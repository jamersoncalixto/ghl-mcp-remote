import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest } from "../services/ghl-client.js";
import { toolResult, withErrorHandling } from "./helpers.js";

const locationIdField = z.string().describe("Subaccount ID (obtained via ghl_locations_list)");

export function registerBlogTools(server: McpServer): void {
  server.registerTool(
    "ghl_blogs_list_posts",
    {
      title: "List Blog Posts",
      description: "Lists blog posts published or drafted in a subaccount.",
      inputSchema: {
        locationId: locationIdField,
        limit: z.number().int().min(1).max(100).default(20),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    withErrorHandling(async ({ locationId, limit }: { locationId: string; limit: number }) => {
      const data = await ghlRequest({
        method: "GET",
        path: "/blogs/posts",
        locationId,
        query: { locationId, limit },
      });
      return toolResult(data);
    }),
  );

  server.registerTool(
    "ghl_blogs_create_post",
    {
      title: "Create Blog Post",
      description: "Creates a new blog post for a subaccount.",
      inputSchema: {
        locationId: locationIdField,
        title: z.string(),
        body: z.string().describe("Blog post content (HTML or markdown)"),
        slug: z.string().optional(),
        status: z.enum(["PUBLISHED", "DRAFT"]).default("DRAFT"),
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    withErrorHandling(async (args: Record<string, unknown>) => {
      const { locationId, ...rest } = args as { locationId: string; [key: string]: unknown };
      const data = await ghlRequest({
        method: "POST",
        path: "/blogs/posts",
        locationId,
        body: { locationId, ...rest },
      });
      return toolResult(data);
    }),
  );
}
