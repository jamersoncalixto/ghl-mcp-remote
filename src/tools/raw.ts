import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest } from "../services/ghl-client.js";
import { toolResult, withErrorHandling } from "./helpers.js";

export function registerRawTool(server: McpServer): void {
  server.registerTool(
    "ghl_raw_request",
    {
      title: "Execute Raw GHL API Request",
      description:
        "Executes a direct HTTP request to any endpoint in GoHighLevel API v2 (services.leadconnectorhq.com). " +
        "Use as an escape hatch when no dedicated tool covers the required endpoint.",
      inputSchema: {
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
        path: z.string().describe("Relative endpoint path, e.g. /contacts/ or /custom-menus/"),
        locationId: z
          .string()
          .optional()
          .describe("Target subaccount ID. Omit only for agency-level endpoints."),
        useCompanyToken: z
          .boolean()
          .optional()
          .describe("Set to true to use the agency company token instead of subaccount token"),
        query: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
        body: z.record(z.any()).optional(),
      },
      annotations: { openWorldHint: true },
    },
    withErrorHandling(
      async ({
        method,
        path,
        locationId,
        useCompanyToken,
        query,
        body,
      }: {
        method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
        path: string;
        locationId?: string;
        useCompanyToken?: boolean;
        query?: Record<string, string | number | boolean>;
        body?: Record<string, unknown>;
      }) => {
        const data = await ghlRequest({ method, path, locationId, useCompanyToken, query, body });
        return toolResult(data);
      },
    ),
  );
}
