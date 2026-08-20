import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest } from "../services/ghl-client.js";
import { toolResult, withErrorHandling } from "./helpers.js";

const locationIdField = z.string().describe("ID da subconta (obtido via ghl_locations_list)");

export function registerFunnelTools(server: McpServer): void {
  server.registerTool(
    "ghl_funnels_list",
    {
      title: "Listar funnels",
      description: "Lista os funnels (funis de páginas) configurados em uma subconta.",
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
      title: "Listar páginas de um funnel",
      description: "Lista as páginas que compõem um funnel específico.",
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
