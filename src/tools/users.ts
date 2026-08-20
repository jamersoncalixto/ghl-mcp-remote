import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest } from "../services/ghl-client.js";
import { toolResult, withErrorHandling } from "./helpers.js";

const locationIdField = z.string().describe("Subaccount ID (obtained via ghl_locations_list)");

export function registerUserTools(server: McpServer): void {
  server.registerTool(
    "ghl_users_list",
    {
      title: "List Users",
      description: "Lists team members and users assigned to a subaccount.",
      inputSchema: {
        locationId: locationIdField,
        limit: z.number().int().min(1).max(100).default(20),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    withErrorHandling(async ({ locationId, limit }: { locationId: string; limit: number }) => {
      const data = await ghlRequest({
        method: "GET",
        path: "/users/",
        locationId,
        query: { locationId, limit },
      });
      return toolResult(data);
    }),
  );

  server.registerTool(
    "ghl_users_get",
    {
      title: "Get User",
      description: "Returns full profile details of a user by userId.",
      inputSchema: { locationId: locationIdField, userId: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    withErrorHandling(async ({ locationId, userId }: { locationId: string; userId: string }) => {
      const data = await ghlRequest({
        method: "GET",
        path: `/users/${userId}`,
        locationId,
      });
      return toolResult(data);
    }),
  );
}
