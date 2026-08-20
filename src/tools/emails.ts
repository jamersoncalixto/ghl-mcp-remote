import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest } from "../services/ghl-client.js";
import { toolResult, withErrorHandling } from "./helpers.js";

const locationIdField = z.string().describe("Subaccount ID (obtained via ghl_locations_list)");

export function registerEmailTools(server: McpServer): void {
  server.registerTool(
    "ghl_emails_list_templates",
    {
      title: "List Email Templates",
      description: "Lists email builder templates configured in a subaccount.",
      inputSchema: {
        locationId: locationIdField,
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    withErrorHandling(async ({ locationId, limit, offset }: { locationId: string; limit: number; offset: number }) => {
      const data = await ghlRequest({
        method: "GET",
        path: "/emails/builder",
        locationId,
        query: { locationId, limit, offset },
      });
      return toolResult(data);
    }),
  );

  server.registerTool(
    "ghl_emails_get_template",
    {
      title: "Get Email Template",
      description: "Returns full details and HTML content of an email builder template by templateId.",
      inputSchema: { locationId: locationIdField, templateId: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    withErrorHandling(async ({ locationId, templateId }: { locationId: string; templateId: string }) => {
      const data = await ghlRequest({
        method: "GET",
        path: `/emails/builder/${templateId}`,
        locationId,
      });
      return toolResult(data);
    }),
  );

  server.registerTool(
    "ghl_emails_create_builder_template",
    {
      title: "Create Email Builder Template",
      description: "Creates a new HTML email template in the Email Builder for a subaccount.",
      inputSchema: {
        locationId: locationIdField,
        title: z.string().describe("Template title or name"),
        html: z.string().describe("HTML string of the email body"),
        type: z.enum(["html", "builder"]).default("html"),
        previewText: z.string().optional(),
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    withErrorHandling(
      async ({
        locationId,
        title,
        html,
        type,
        previewText,
      }: {
        locationId: string;
        title: string;
        html: string;
        type: "html" | "builder";
        previewText?: string;
      }) => {
        const data = await ghlRequest({
          method: "POST",
          path: "/emails/builder",
          locationId,
          body: { locationId, title, html, type, previewText },
        });
        return toolResult(data);
      },
    ),
  );

  server.registerTool(
    "ghl_emails_list_campaigns",
    {
      title: "List Email Campaigns",
      description: "Lists email campaigns created in a subaccount.",
      inputSchema: {
        locationId: locationIdField,
        limit: z.number().int().min(1).max(100).default(20),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    withErrorHandling(async ({ locationId, limit }: { locationId: string; limit: number }) => {
      const data = await ghlRequest({
        method: "GET",
        path: "/emails/campaigns",
        locationId,
        query: { locationId, limit },
      });
      return toolResult(data);
    }),
  );
}
