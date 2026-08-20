import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest } from "../services/ghl-client.js";
import { toolResult, withErrorHandling } from "./helpers.js";

const locationIdField = z.string().describe("Subaccount ID (obtained via ghl_locations_list)");

export function registerProductTools(server: McpServer): void {
  server.registerTool(
    "ghl_products_list",
    {
      title: "List Products",
      description: "Lists products configured in a subaccount.",
      inputSchema: {
        locationId: locationIdField,
        limit: z.number().int().min(1).max(100).default(20),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    withErrorHandling(async ({ locationId, limit }: { locationId: string; limit: number }) => {
      const data = await ghlRequest({
        method: "GET",
        path: "/products/",
        locationId,
        query: { locationId, limit },
      });
      return toolResult(data);
    }),
  );

  server.registerTool(
    "ghl_products_get",
    {
      title: "Get Product",
      description: "Returns product details by productId.",
      inputSchema: { locationId: locationIdField, productId: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    withErrorHandling(async ({ locationId, productId }: { locationId: string; productId: string }) => {
      const data = await ghlRequest({
        method: "GET",
        path: `/products/${productId}`,
        locationId,
        query: { locationId },
      });
      return toolResult(data);
    }),
  );

  server.registerTool(
    "ghl_products_create",
    {
      title: "Create Product",
      description: "Creates a new product in a subaccount.",
      inputSchema: {
        locationId: locationIdField,
        name: z.string(),
        productType: z.enum(["DIGITAL", "PHYSICAL", "SERVICE"]).default("DIGITAL"),
        description: z.string().optional(),
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    withErrorHandling(async (args: Record<string, unknown>) => {
      const { locationId, ...rest } = args as { locationId: string; [key: string]: unknown };
      const data = await ghlRequest({
        method: "POST",
        path: "/products/",
        locationId,
        body: { locationId, ...rest },
      });
      return toolResult(data);
    }),
  );
}
