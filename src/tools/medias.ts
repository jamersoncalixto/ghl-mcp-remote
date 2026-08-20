import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest } from "../services/ghl-client.js";
import { toolResult, withErrorHandling } from "./helpers.js";

const locationIdField = z.string().describe("Subaccount ID (obtained via ghl_locations_list)");

export function registerMediaTools(server: McpServer): void {
  server.registerTool(
    "ghl_medias_list",
    {
      title: "List Media Library Files",
      description: "Lists uploaded images, documents, and media files in a subaccount media library.",
      inputSchema: {
        locationId: locationIdField,
        limit: z.number().int().min(1).max(100).default(20),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    withErrorHandling(async ({ locationId, limit }: { locationId: string; limit: number }) => {
      const data = await ghlRequest({
        method: "GET",
        path: "/medias/files",
        locationId,
        query: { altId: locationId, altType: "location", limit },
      });
      return toolResult(data);
    }),
  );
}
