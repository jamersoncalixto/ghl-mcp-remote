import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest } from "../services/ghl-client.js";
import { toolResult, withErrorHandling } from "./helpers.js";

const locationIdField = z.string().describe("Subaccount ID (obtained via ghl_locations_list)");

export function registerFormTools(server: McpServer): void {
  server.registerTool(
    "ghl_forms_list",
    {
      title: "List Forms",
      description: "Lists forms configured in a subaccount.",
      inputSchema: { locationId: locationIdField, limit: z.number().int().min(1).max(100).default(20) },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    withErrorHandling(async ({ locationId, limit }: { locationId: string; limit: number }) => {
      const data = await ghlRequest({ method: "GET", path: "/forms/", locationId, query: { locationId, limit } });
      return toolResult(data);
    }),
  );

  server.registerTool(
    "ghl_forms_get_submissions",
    {
      title: "List Form Submissions",
      description: "Lists submissions received by a specific form.",
      inputSchema: {
        locationId: locationIdField,
        formId: z.string(),
        limit: z.number().int().min(1).max(100).default(20),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    withErrorHandling(
      async ({ locationId, formId, limit }: { locationId: string; formId: string; limit: number }) => {
        const data = await ghlRequest({
          method: "GET",
          path: "/forms/submissions",
          locationId,
          query: { locationId, formId, limit },
        });
        return toolResult(data);
      },
    ),
  );
}
