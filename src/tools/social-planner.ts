import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest } from "../services/ghl-client.js";
import { toolResult, withErrorHandling } from "./helpers.js";

const locationIdField = z.string().describe("Subaccount ID (obtained via ghl_locations_list)");

export function registerSocialPlannerTools(server: McpServer): void {
  server.registerTool(
    "ghl_social_posts_list",
    {
      title: "List Social Planner Posts",
      description: "Lists social media posts configured or scheduled in Social Planner for a subaccount.",
      inputSchema: {
        locationId: locationIdField,
        limit: z.number().int().min(1).max(100).default(20),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    withErrorHandling(async ({ locationId, limit }: { locationId: string; limit: number }) => {
      const data = await ghlRequest({
        method: "GET",
        path: "/social-planner/posts",
        locationId,
        query: { locationId, limit },
      });
      return toolResult(data);
    }),
  );

  server.registerTool(
    "ghl_social_posts_create",
    {
      title: "Create Social Post",
      description: "Creates and schedules or publishes a social media post across connected social accounts.",
      inputSchema: {
        locationId: locationIdField,
        accountIds: z.array(z.string()).describe("IDs of connected social media accounts"),
        text: z.string().describe("Post text content"),
        mediaUrls: z.array(z.string()).optional().describe("URLs of image or video attachments"),
        scheduleDate: z.string().optional().describe("ISO 8601 string for scheduled publication time"),
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    withErrorHandling(async (args: Record<string, unknown>) => {
      const { locationId, ...rest } = args as { locationId: string; [key: string]: unknown };
      const data = await ghlRequest({
        method: "POST",
        path: "/social-planner/post",
        locationId,
        body: { locationId, ...rest },
      });
      return toolResult(data);
    }),
  );
}
