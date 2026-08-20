export const GHL_BASE_URL = "https://services.leadconnectorhq.com";
export const GHL_API_VERSION = "2021-07-28";

/**
 * GHL's `/oauth/installedLocations` endpoint requires the Marketplace app's `appId`,
 * distinct from client_id/client_secret. In practice GHL issues client_id as
 * `{appId}-{randomSuffix}` — the part before the first dash is the appId, and there's
 * no separate GHL_APP_ID env var to configure since it's always derivable this way.
 */
export function getAppId(): string {
  const clientId = process.env.GHL_CLIENT_ID;
  if (!clientId) {
    throw new Error("Missing GHL_CLIENT_ID env var — required to derive the marketplace appId.");
  }
  const [appId] = clientId.split("-");
  if (!appId) {
    throw new Error(`Could not derive appId from GHL_CLIENT_ID="${clientId}".`);
  }
  return appId;
}
