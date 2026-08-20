import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest } from "../services/ghl-client.js";
import { getFreshCompanyToken } from "../auth/ghl-oauth.js";
import { getTenantCompanyId } from "../tenant-context.js";
import { getAppId } from "../services/constants.js";
import { toolResult, withErrorHandling } from "./helpers.js";

interface InstalledLocationsResponse {
  locations: Array<{
    _id: string;
    name: string;
    address?: string;
    isInstalled?: boolean;
  }>;
  count: number;
}

/** Short per-tenant cache so a burst of tool calls in one conversation doesn't re-fetch every
 * time. Keyed by companyId — this process serves many agencies, so a single shared cache
 * entry would leak one agency's location list into another agency's tool call. */
const cache = new Map<string, { data: InstalledLocationsResponse; expiresAt: number }>();
const LIST_CACHE_TTL_MS = 60_000;

async function listInstalledLocations(): Promise<InstalledLocationsResponse> {
  const companyId = getTenantCompanyId();
  const cached = cache.get(companyId);
  if (cached && Date.now() < cached.expiresAt) return cached.data;

  const { companyId: resolvedCompanyId } = await getFreshCompanyToken();
  const data = await ghlRequest<InstalledLocationsResponse>({
    method: "GET",
    path: "/oauth/installedLocations",
    useCompanyToken: true,
    query: { companyId: resolvedCompanyId, appId: getAppId(), limit: 100 },
  });
  cache.set(companyId, { data, expiresAt: Date.now() + LIST_CACHE_TTL_MS });
  return data;
}

export function registerLocationTools(server: McpServer): void {
  server.registerTool(
    "ghl_locations_list",
    {
      title: "List Agency Subaccounts",
      description:
        "Lists all subaccounts (locations) in GoHighLevel where this app is installed, including ID and name. " +
        "Use this tool first to discover the correct locationId before invoking location-scoped tools.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    withErrorHandling(async () => {
      const data = await listInstalledLocations();
      return toolResult({
        count: data.count,
        locations: data.locations.map((l) => ({ id: l._id, name: l.name, address: l.address })),
      });
    }),
  );

  server.registerTool(
    "ghl_locations_get",
    {
      title: "Get Subaccount Details",
      description: "Returns full details for a specific subaccount by locationId.",
      inputSchema: {
        locationId: z.string().describe("Subaccount ID (obtained via ghl_locations_list)"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    withErrorHandling(async ({ locationId }: { locationId: string }) => {
      const data = await ghlRequest({
        method: "GET",
        path: `/locations/${locationId}`,
        locationId,
      });
      return toolResult(data);
    }),
  );
}
