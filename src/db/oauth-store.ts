import { randomBytes } from "node:crypto";
import { pool } from "./pool.js";
import { sha256Hex } from "./crypto.js";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";

// ---------------------------------------------------------------------------
// OAuth clients (Dynamic Client Registration) — Claude/ChatGPT self-register here.
// ---------------------------------------------------------------------------

export class PgOAuthClientsStore implements OAuthRegisteredClientsStore {
  async getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
    const { rows } = await pool.query(`SELECT raw FROM mcp_oauth_clients WHERE client_id = $1`, [clientId]);
    if (!rows[0]) return undefined;
    const raw = rows[0].raw;
    return (typeof raw === "string" ? JSON.parse(raw) : raw) as OAuthClientInformationFull;
  }

  async registerClient(
    client: OAuthClientInformationFull,
  ): Promise<OAuthClientInformationFull> {
    try {
      const jsonStr = JSON.stringify(client);
      await pool.query(
        `INSERT INTO mcp_oauth_clients (client_id, raw) VALUES ($1, $2::jsonb)
         ON CONFLICT (client_id) DO UPDATE SET raw = EXCLUDED.raw`,
        [client.client_id, jsonStr],
      );
      return client;
    } catch (err) {
      console.error("[oauth-store] registerClient error:", err);
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Pending auth — bridges "MCP client asked to authorize" -> "agency approved on GHL".
// ---------------------------------------------------------------------------

export interface PendingAuth {
  ghlState: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  mcpState?: string;
  scopes: string[];
  resource?: string;
  expiresAt: number;
}

export async function createPendingAuth(row: PendingAuth): Promise<void> {
  await pool.query(
    `INSERT INTO mcp_pending_auth
       (ghl_state, client_id, redirect_uri, code_challenge, mcp_state, scopes, resource, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8 / 1000.0))`,
    [
      row.ghlState,
      row.clientId,
      row.redirectUri,
      row.codeChallenge,
      row.mcpState ?? null,
      row.scopes,
      row.resource ?? null,
      row.expiresAt,
    ],
  );
}

/** Reads and deletes (single-use) the pending auth row for a ghlState, or null if missing/expired. */
export async function consumePendingAuth(ghlState: string): Promise<PendingAuth | null> {
  const { rows } = await pool.query(`DELETE FROM mcp_pending_auth WHERE ghl_state = $1 RETURNING *`, [ghlState]);
  if (rows.length === 0) return null;
  const row = rows[0];
  if (Date.now() > new Date(row.expires_at).getTime()) return null;
  return {
    ghlState: row.ghl_state,
    clientId: row.client_id,
    redirectUri: row.redirect_uri,
    codeChallenge: row.code_challenge,
    mcpState: row.mcp_state ?? undefined,
    scopes: row.scopes,
    resource: row.resource ?? undefined,
    expiresAt: new Date(row.expires_at).getTime(),
  };
}

// ---------------------------------------------------------------------------
// MCP-side authorization codes — minted by us after GHL confirms the agency.
// ---------------------------------------------------------------------------

export interface AuthCodeRow {
  clientId: string;
  companyId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: string[];
  resource?: string;
  used: boolean;
  expiresAt: number;
}

/** Creates a new authorization code and returns its plaintext value (only ever returned once). */
export async function createAuthCode(input: {
  clientId: string;
  companyId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: string[];
  resource?: string;
  ttlMs: number;
}): Promise<string> {
  const code = randomBytes(32).toString("hex");
  await pool.query(
    `INSERT INTO mcp_auth_codes
       (code_hash, client_id, company_id, redirect_uri, code_challenge, scopes, resource, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8 / 1000.0))`,
    [
      sha256Hex(code),
      input.clientId,
      input.companyId,
      input.redirectUri,
      input.codeChallenge,
      input.scopes,
      input.resource ?? null,
      Date.now() + input.ttlMs,
    ],
  );
  return code;
}

export async function findAuthCode(code: string): Promise<AuthCodeRow | null> {
  const { rows } = await pool.query(`SELECT * FROM mcp_auth_codes WHERE code_hash = $1`, [sha256Hex(code)]);
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    clientId: row.client_id,
    companyId: row.company_id,
    redirectUri: row.redirect_uri,
    codeChallenge: row.code_challenge,
    scopes: row.scopes,
    resource: row.resource ?? undefined,
    used: row.used,
    expiresAt: new Date(row.expires_at).getTime(),
  };
}

export async function markAuthCodeUsed(code: string): Promise<void> {
  await pool.query(`UPDATE mcp_auth_codes SET used = true WHERE code_hash = $1`, [sha256Hex(code)]);
}

// ---------------------------------------------------------------------------
// Access / refresh tokens issued by this server to MCP clients.
// ---------------------------------------------------------------------------

export interface TokenRow {
  clientId: string;
  companyId: string;
  scopes: string[];
  resource?: string;
  expiresAt: number;
}

export async function createAccessToken(input: {
  clientId: string;
  companyId: string;
  scopes: string[];
  resource?: string;
  ttlSeconds: number;
}): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await pool.query(
    `INSERT INTO mcp_access_tokens (token_hash, client_id, company_id, scopes, resource, expires_at)
     VALUES ($1, $2, $3, $4, $5, to_timestamp($6 / 1000.0))`,
    [
      sha256Hex(token),
      input.clientId,
      input.companyId,
      input.scopes,
      input.resource ?? null,
      Date.now() + input.ttlSeconds * 1000,
    ],
  );
  return token;
}

export async function findAccessToken(token: string): Promise<TokenRow | null> {
  const { rows } = await pool.query(`SELECT * FROM mcp_access_tokens WHERE token_hash = $1`, [sha256Hex(token)]);
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    clientId: row.client_id,
    companyId: row.company_id,
    scopes: row.scopes,
    resource: row.resource ?? undefined,
    expiresAt: new Date(row.expires_at).getTime(),
  };
}

export async function createRefreshToken(input: {
  clientId: string;
  companyId: string;
  scopes: string[];
  resource?: string;
  ttlSeconds: number;
}): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await pool.query(
    `INSERT INTO mcp_refresh_tokens (token_hash, client_id, company_id, scopes, resource, expires_at)
     VALUES ($1, $2, $3, $4, $5, to_timestamp($6 / 1000.0))`,
    [
      sha256Hex(token),
      input.clientId,
      input.companyId,
      input.scopes,
      input.resource ?? null,
      Date.now() + input.ttlSeconds * 1000,
    ],
  );
  return token;
}

export async function findRefreshToken(token: string): Promise<TokenRow | null> {
  const { rows } = await pool.query(`SELECT * FROM mcp_refresh_tokens WHERE token_hash = $1`, [sha256Hex(token)]);
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    clientId: row.client_id,
    companyId: row.company_id,
    scopes: row.scopes,
    resource: row.resource ?? undefined,
    expiresAt: new Date(row.expires_at).getTime(),
  };
}

export async function deleteRefreshToken(token: string): Promise<void> {
  await pool.query(`DELETE FROM mcp_refresh_tokens WHERE token_hash = $1`, [sha256Hex(token)]);
}

/** Best-effort revoke: the RFC 7009 request doesn't say which table the token lives in. */
export async function revokeByTokenValue(token: string, clientId: string): Promise<void> {
  const hash = sha256Hex(token);
  await Promise.all([
    pool.query(`DELETE FROM mcp_access_tokens WHERE token_hash = $1 AND client_id = $2`, [hash, clientId]),
    pool.query(`DELETE FROM mcp_refresh_tokens WHERE token_hash = $1 AND client_id = $2`, [hash, clientId]),
  ]);
}

// ---------------------------------------------------------------------------
// Housekeeping — expired rows are harmless but no reason to let them pile up forever.
// ---------------------------------------------------------------------------

async function cleanupExpired(): Promise<void> {
  await Promise.all([
    pool.query(`DELETE FROM mcp_pending_auth WHERE expires_at < now()`),
    pool.query(`DELETE FROM mcp_auth_codes WHERE expires_at < now()`),
    pool.query(`DELETE FROM mcp_access_tokens WHERE expires_at < now()`),
    pool.query(`DELETE FROM mcp_refresh_tokens WHERE expires_at < now()`),
  ]);
}

/** Runs a light cleanup pass immediately and then once an hour for the life of the process. */
export function startCleanupLoop(): void {
  cleanupExpired().catch((err) => console.error("[ghl-mcp-remote] cleanup pass failed:", err));
  setInterval(() => {
    cleanupExpired().catch((err) => console.error("[ghl-mcp-remote] cleanup pass failed:", err));
  }, 60 * 60 * 1000).unref();
}
