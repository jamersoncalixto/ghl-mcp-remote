import { getFreshCompanyToken } from "./ghl-oauth.js";
import { getTenantCompanyId } from "../tenant-context.js";
import { GHL_API_VERSION, GHL_BASE_URL } from "../services/constants.js";

interface CachedLocationToken {
  accessToken: string;
  expiresAt: number;
}

/** Keyed by `${companyId}:${locationId}` — this process serves many tenants, so the
 * companyId must be part of the cache key or one agency's location token could leak
 * into another agency's request. */
const cache = new Map<string, CachedLocationToken>();

/** Skew so we re-mint slightly before GHL actually expires the token. */
const REFRESH_SKEW_MS = 60_000;

interface LocationTokenResponse {
  access_token: string;
  expires_in: number;
  locationId: string;
  companyId: string;
}

/**
 * Returns a valid location-scoped access token for the given sub-account, minting a
 * fresh one from the current tenant's agency (company) token when the cached one is
 * missing/expiring. Location tokens are never persisted to disk/DB — they're short-lived
 * (~24h) and cheap to re-derive from the long-lived company refresh token.
 */
export async function getLocationToken(locationId: string): Promise<string> {
  const companyId = getTenantCompanyId();
  const cacheKey = `${companyId}:${locationId}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt - REFRESH_SKEW_MS) {
    return cached.accessToken;
  }

  const { accessToken: companyToken } = await getFreshCompanyToken();

  const res = await fetch(`${GHL_BASE_URL}/oauth/locationToken`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${companyToken}`,
      Version: GHL_API_VERSION,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ companyId, locationId }).toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Falha ao mintar location token para ${locationId} (HTTP ${res.status}): ${text}`,
    );
  }

  const data = (await res.json()) as LocationTokenResponse;
  cache.set(cacheKey, {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  });
  return data.access_token;
}
