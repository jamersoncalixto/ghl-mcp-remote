import { randomUUID } from "node:crypto";
import type { Response } from "express";
import type { OAuthServerProvider, AuthorizationParams } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { InvalidGrantError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { buildGhlAuthorizeUrl } from "./ghl-oauth.js";
import {
  PgOAuthClientsStore,
  createPendingAuth,
  findAuthCode,
  markAuthCodeUsed,
  createAccessToken,
  createRefreshToken,
  findAccessToken,
  findRefreshToken,
  deleteRefreshToken,
  revokeByTokenValue,
} from "../db/oauth-store.js";

/** This server only ever grants one macro-scope — there's nothing narrower to negotiate
 * since every tool call is already scoped to a single GHL agency (the tenant). */
export const MCP_SCOPE = "ghl:access";

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1h
const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 180; // ~6 months
const PENDING_AUTH_TTL_MS = 10 * 60 * 1000; // 10 min to complete the GHL consent screen
/** Also used by ghl-callback.ts when minting the code after GHL confirms the agency. */
export const AUTH_CODE_TTL_MS = 5 * 60 * 1000; // 5 min, single-use

export function ghlCallbackUrl(): string {
  const publicUrl = process.env.PUBLIC_URL;
  if (!publicUrl) throw new Error("Missing required env var PUBLIC_URL");
  return new URL("/oauth/callback", publicUrl).toString();
}

/**
 * Implements the MCP-facing OAuth authorization server by delegating the actual "login"
 * step to GHL's own Marketplace consent screen (see authorize()). Everything else — PKCE,
 * codes, access/refresh tokens handed to Claude/ChatGPT — is our own, backed by Postgres.
 */
export class McpOAuthProvider implements OAuthServerProvider {
  readonly clientsStore: OAuthRegisteredClientsStore = new PgOAuthClientsStore();

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    const ghlState = randomUUID();
    await createPendingAuth({
      ghlState,
      clientId: client.client_id,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      mcpState: params.state,
      scopes: params.scopes && params.scopes.length > 0 ? params.scopes : [MCP_SCOPE],
      resource: params.resource?.toString(),
      expiresAt: Date.now() + PENDING_AUTH_TTL_MS,
    });
    res.redirect(302, buildGhlAuthorizeUrl(ghlCallbackUrl(), ghlState));
  }

  async challengeForAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string): Promise<string> {
    const row = await findAuthCode(authorizationCode);
    if (!row || row.clientId !== client.client_id) {
      throw new InvalidGrantError("Invalid authorization code");
    }
    return row.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
  ): Promise<OAuthTokens> {
    const row = await findAuthCode(authorizationCode);
    if (!row || row.clientId !== client.client_id) {
      throw new InvalidGrantError("Invalid authorization code");
    }
    if (row.used) {
      throw new InvalidGrantError("Authorization code already used");
    }
    if (Date.now() > row.expiresAt) {
      throw new InvalidGrantError("Authorization code expired");
    }
    if (redirectUri && redirectUri !== row.redirectUri) {
      throw new InvalidGrantError("redirect_uri does not match the one used to start this authorization");
    }
    await markAuthCodeUsed(authorizationCode);

    const accessToken = await createAccessToken({
      clientId: client.client_id,
      companyId: row.companyId,
      scopes: row.scopes,
      resource: row.resource,
      ttlSeconds: ACCESS_TOKEN_TTL_SECONDS,
    });
    const refreshToken = await createRefreshToken({
      clientId: client.client_id,
      companyId: row.companyId,
      scopes: row.scopes,
      resource: row.resource,
      ttlSeconds: REFRESH_TOKEN_TTL_SECONDS,
    });

    return {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: refreshToken,
      scope: row.scopes.join(" "),
    };
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
  ): Promise<OAuthTokens> {
    const row = await findRefreshToken(refreshToken);
    if (!row || row.clientId !== client.client_id) {
      throw new InvalidGrantError("Invalid refresh token");
    }
    if (Date.now() > row.expiresAt) {
      throw new InvalidGrantError("Refresh token expired");
    }

    // Single-use rotation — the old refresh token stops working the moment a new one is issued.
    await deleteRefreshToken(refreshToken);

    const grantedScopes = scopes && scopes.length > 0 ? scopes : row.scopes;
    const accessToken = await createAccessToken({
      clientId: client.client_id,
      companyId: row.companyId,
      scopes: grantedScopes,
      resource: row.resource,
      ttlSeconds: ACCESS_TOKEN_TTL_SECONDS,
    });
    const newRefreshToken = await createRefreshToken({
      clientId: client.client_id,
      companyId: row.companyId,
      scopes: grantedScopes,
      resource: row.resource,
      ttlSeconds: REFRESH_TOKEN_TTL_SECONDS,
    });

    return {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: newRefreshToken,
      scope: grantedScopes.join(" "),
    };
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const row = await findAccessToken(token);
    if (!row || Date.now() > row.expiresAt) {
      throw new Error("Invalid or expired token");
    }
    return {
      token,
      clientId: row.clientId,
      scopes: row.scopes,
      expiresAt: Math.floor(row.expiresAt / 1000),
      resource: row.resource ? new URL(row.resource) : undefined,
      // This is how every tool call finds out which GHL agency it's acting on behalf of.
      extra: { companyId: row.companyId },
    };
  }

  async revokeToken(client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest): Promise<void> {
    await revokeByTokenValue(request.token, client.client_id);
  }
}
