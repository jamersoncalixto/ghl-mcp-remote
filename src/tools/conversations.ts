import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest } from "../services/ghl-client.js";
import { toolResult, withErrorHandling } from "./helpers.js";

const locationIdField = z.string().describe("Subaccount ID (obtained via ghl_locations_list)");

export function registerConversationTools(server: McpServer): void {
  server.registerTool(
    "ghl_conversations_list",
    {
      title: "List Conversations",
      description: "List conversations (SMS/Email/etc.) in a subaccount, optionally filtering by contact.",
      inputSchema: {
        locationId: locationIdField,
        contactId: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(20),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    withErrorHandling(async (args: Record<string, unknown>) => {
      const { locationId, ...rest } = args as { locationId: string; [key: string]: unknown };
      const data = await ghlRequest({
        method: "GET",
        path: "/conversations/search",
        locationId,
        query: { locationId, ...(rest as Record<string, string | number | boolean | undefined>) },
      });
      return toolResult(data);
    }),
  );

  server.registerTool(
    "ghl_conversations_get",
    {
      title: "Get Conversation",
      description: "Returns details of a conversation by ID.",
      inputSchema: { locationId: locationIdField, conversationId: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    withErrorHandling(async ({ locationId, conversationId }: { locationId: string; conversationId: string }) => {
      const data = await ghlRequest({ method: "GET", path: `/conversations/${conversationId}`, locationId });
      return toolResult(data);
    }),
  );

  server.registerTool(
    "ghl_conversations_list_messages",
    {
      title: "List Conversation Messages",
      description: "Lists messages sent and received within a conversation.",
      inputSchema: { locationId: locationIdField, conversationId: z.string(), limit: z.number().int().min(1).max(100).default(20) },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    withErrorHandling(
      async ({
        locationId,
        conversationId,
        limit,
      }: {
        locationId: string;
        conversationId: string;
        limit: number;
      }) => {
        const data = await ghlRequest({
          method: "GET",
          path: `/conversations/${conversationId}/messages`,
          locationId,
          query: { limit },
        });
        return toolResult(data);
      },
    ),
  );

  server.registerTool(
    "ghl_conversations_send_message",
    {
      title: "Send Message",
      description:
        "Sends an SMS or Email message to a contact, creating or continuing a conversation.",
      inputSchema: {
        locationId: locationIdField,
        contactId: z.string(),
        type: z.enum(["SMS", "Email"]),
        message: z.string().describe("Message body (text for SMS, text/HTML for Email)"),
        subject: z.string().optional().describe("Subject line (required for Email)"),
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    withErrorHandling(
      async ({
        locationId,
        contactId,
        type,
        message,
        subject,
      }: {
        locationId: string;
        contactId: string;
        type: "SMS" | "Email";
        message: string;
        subject?: string;
      }) => {
        const data = await ghlRequest({
          method: "POST",
          path: "/conversations/messages",
          locationId,
          body: { type, contactId, message, subject },
        });
        return toolResult(data);
      },
    ),
  );
}
