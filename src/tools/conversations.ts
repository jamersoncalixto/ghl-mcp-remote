import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest } from "../services/ghl-client.js";
import { toolResult, withErrorHandling } from "./helpers.js";

const locationIdField = z.string().describe("ID da subconta (obtido via ghl_locations_list)");

export function registerConversationTools(server: McpServer): void {
  server.registerTool(
    "ghl_conversations_list",
    {
      title: "Listar conversas",
      description: "Lista conversas (SMS/email/etc.) de uma subconta, opcionalmente filtrando por contato.",
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
      title: "Obter conversa",
      description: "Retorna os detalhes de uma conversa pelo id.",
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
      title: "Listar mensagens de uma conversa",
      description: "Lista as mensagens trocadas dentro de uma conversa.",
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
      title: "Enviar mensagem (SMS/Email)",
      description:
        "Envia uma mensagem SMS ou Email para um contato, criando/continuando a conversa. Ação com efeito real no mundo — " +
        "confirme o conteúdo e destinatário com o usuário antes de chamar.",
      inputSchema: {
        locationId: locationIdField,
        contactId: z.string(),
        type: z.enum(["SMS", "Email"]),
        message: z.string().describe("Corpo da mensagem (texto para SMS, HTML ou texto para Email)"),
        subject: z.string().optional().describe("Assunto, obrigatório apenas para Email"),
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
