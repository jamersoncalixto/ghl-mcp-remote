import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest } from "../services/ghl-client.js";
import { toolResult, withErrorHandling } from "./helpers.js";

const locationIdField = z.string().describe("Subaccount ID (obtained via ghl_locations_list)");

export function registerFunnelTools(server: McpServer): void {
  server.registerTool(
    "ghl_funnels_list",
    {
      title: "List Funnels",
      description: "Lists page funnels configured in a subaccount.",
      inputSchema: { locationId: locationIdField, limit: z.number().int().min(1).max(100).default(20) },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    withErrorHandling(async ({ locationId, limit }: { locationId: string; limit: number }) => {
      const data = await ghlRequest({
        method: "GET",
        path: "/funnels/funnel/list",
        locationId,
        query: { locationId, limit },
      });
      return toolResult(data);
    }),
  );

  server.registerTool(
    "ghl_funnels_list_pages",
    {
      title: "List Funnel Pages",
      description: "Lists pages that belong to a specific funnel.",
      inputSchema: { locationId: locationIdField, funnelId: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    withErrorHandling(async ({ locationId, funnelId }: { locationId: string; funnelId: string }) => {
      const data = await ghlRequest({
        method: "GET",
        path: "/funnels/page",
        locationId,
        query: { locationId, funnelId },
      });
      return toolResult(data);
    }),
  );
}
