import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest } from "../services/ghl-client.js";
import { toolResult, withErrorHandling } from "./helpers.js";

const locationIdField = z.string().describe("Subaccount ID (obtained via ghl_locations_list)");

export function registerTagTools(server: McpServer): void {
  server.registerTool(
    "ghl_tags_list",
    {
      title: "List Tags",
      description: "Lists all tags configured in a subaccount.",
      inputSchema: { locationId: locationIdField },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    withErrorHandling(async ({ locationId }: { locationId: string }) => {
      const data = await ghlRequest({ method: "GET", path: `/locations/${locationId}/tags`, locationId });
      return toolResult(data);
    }),
  );

  server.registerTool(
    "ghl_tags_create",
    {
      title: "Create Tag",
      description: "Creates a new tag in a subaccount.",
      inputSchema: { locationId: locationIdField, name: z.string() },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    withErrorHandling(async ({ locationId, name }: { locationId: string; name: string }) => {
      const data = await ghlRequest({
        method: "POST",
        path: `/locations/${locationId}/tags`,
        locationId,
        body: { name },
      });
      return toolResult(data);
    }),
  );
}
