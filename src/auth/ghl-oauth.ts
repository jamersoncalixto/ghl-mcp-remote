import { GHL_SCOPE_STRING } from "../services/scopes.js";
import { getTenantCompanyId } from "../tenant-context.js";
import { readAgencyCredentials, upsertAgencyCredentials, type AgencyCredentials } from "../db/agencies.js";

const AUTHORIZE_URL = "https://marketplace.gohighlevel.com/oauth/chooselocation";
const TOKEN_URL = "https://services.leadconnectorhq.com/oauth/token";

/** How long before actual expiry we proactively refresh the company token. */
const REFRESH_SKEW_MS = 5 * 60 * 1000;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name}.`);
  }
  return value;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  companyId: string;
  userId: string;
  userType: string;
}

async function postForm(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GHL token endpoint returned ${res.status}: ${text}`);
  }
  return (await res.json()) as TokenResponse;
}

function toCredentials(tok: TokenResponse): AgencyCredentials {
  return {
    companyId: tok.companyId,
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token,
    expiresAt: Date.now() + tok.expires_in * 1000,
    userId: tok.userId,
  };
}

/**
 * Builds the URL that sends the agency admin to GHL's own consent screen. This IS the
 * "login" for this server — there's no separate password of our own. `redirectUri` must
 * exactly match the one registered on the GHL Marketplace app; `state` carries our own
 * `ghlState` through unchanged so /oauth/ghl/callback can find the pending MCP request.
 */
export function buildGhlAuthorizeUrl(redirectUri: string, state: string): string {
  const clientId = requireEnv("GHL_CLIENT_ID");
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", GHL_SCOPE_STRING);
  url.searchParams.set("state", state);
  return url.toString();
}

/** Exchanges the GHL authorization code for agency tokens and persists them, keyed by companyId. */
export async function exchangeGhlCode(code: string, redirectUri: string): Promise<AgencyCredentials> {
  const clientId = requireEnv("GHL_CLIENT_ID");
  const clientSecret = requireEnv("GHL_CLIENT_SECRET");
  const tokenResponse = await postForm({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
    user_type: "Company",
    redirect_uri: redirectUri,
  });
  const creds = toCredentials(tokenResponse);
  await upsertAgencyCredentials(creds);
  return creds;
}

/**
 * Returns a valid (non-expired) company-level access token + companyId for the tenant
 * bound to the current request (via tenant-context), refreshing and persisting a new
 * one transparently if the cached token is near expiry.
 */
export async function getFreshCompanyToken(): Promise<{ accessToken: string; companyId: string }> {
  const companyId = getTenantCompanyId();
  const creds = await readAgencyCredentials(companyId);
  if (!creds) {
    throw new Error(
      `Nenhuma credencial encontrada para a agência ${companyId}. Reconecte via o fluxo de autorização (GET /authorize).`,
    );
  }

  if (Date.now() < creds.expiresAt - REFRESH_SKEW_MS) {
    return { accessToken: creds.accessToken, companyId: creds.companyId };
  }

  const clientId = requireEnv("GHL_CLIENT_ID");
  const clientSecret = requireEnv("GHL_CLIENT_SECRET");

  const tokenResponse = await postForm({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: creds.refreshToken,
  });

  const fresh = toCredentials(tokenResponse);
  await upsertAgencyCredentials(fresh);
  return { accessToken: fresh.accessToken, companyId: fresh.companyId };
}
