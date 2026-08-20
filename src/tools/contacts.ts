import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest } from "../services/ghl-client.js";
import { toolResult, withErrorHandling } from "./helpers.js";

const locationIdField = z.string().describe("ID da subconta (obtido via ghl_locations_list)");

export function registerContactTools(server: McpServer): void {
  server.registerTool(
    "ghl_contacts_search",
    {
      title: "Buscar contatos",
      description: "Busca/lista contatos de uma subconta, com filtro de texto opcional.",
      inputSchema: {
        locationId: locationIdField,
        query: z.string().optional().describe("Texto livre para buscar (nome, email, telefone)"),
        limit: z.number().int().min(1).max(100).default(20),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    withErrorHandling(
      async ({ locationId, query, limit }: { locationId: string; query?: string; limit: number }) => {
        const data = await ghlRequest({
          method: "GET",
          path: "/contacts/",
          locationId,
          query: { locationId, query, limit },
        });
        return toolResult(data);
      },
    ),
  );

  server.registerTool(
    "ghl_contacts_get",
    {
      title: "Obter contato",
      description: "Retorna os detalhes completos de um contato pelo contactId.",
      inputSchema: { locationId: locationIdField, contactId: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    withErrorHandling(async ({ locationId, contactId }: { locationId: string; contactId: string }) => {
      const data = await ghlRequest({ method: "GET", path: `/contacts/${contactId}`, locationId });
      return toolResult(data);
    }),
  );

  server.registerTool(
    "ghl_contacts_create",
    {
      title: "Criar contato",
      description: "Cria um novo contato em uma subconta.",
      inputSchema: {
        locationId: locationIdField,
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        tags: z.array(z.string()).optional(),
        additionalFields: z
          .record(z.any())
          .optional()
          .describe("Campos extras aceitos pela Contacts API v2 da GHL (customFields, address1, city, etc.)"),
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    withErrorHandling(async (args: Record<string, unknown>) => {
      const { locationId, additionalFields, ...rest } = args as {
        locationId: string;
        additionalFields?: Record<string, unknown>;
        [key: string]: unknown;
      };
      const data = await ghlRequest({
        method: "POST",
        path: "/contacts/",
        locationId,
        body: { locationId, ...rest, ...additionalFields },
      });
      return toolResult(data);
    }),
  );

  server.registerTool(
    "ghl_contacts_update",
    {
      title: "Atualizar contato",
      description: "Atualiza campos de um contato existente.",
      inputSchema: {
        locationId: locationIdField,
        contactId: z.string(),
        fields: z.record(z.any()).describe("Campos a atualizar (email, phone, firstName, customFields, etc.)"),
      },
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    withErrorHandling(
      async ({
        locationId,
        contactId,
        fields,
      }: {
        locationId: string;
        contactId: string;
        fields: Record<string, unknown>;
      }) => {
        const data = await ghlRequest({
          method: "PUT",
          path: `/contacts/${contactId}`,
          locationId,
          body: fields,
        });
        return toolResult(data);
      },
    ),
  );

  server.registerTool(
    "ghl_contacts_delete",
    {
      title: "Excluir contato",
      description: "Exclui permanentemente um contato. Ação irreversível — confirme com o usuário antes de chamar.",
      inputSchema: { locationId: locationIdField, contactId: z.string() },
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    withErrorHandling(async ({ locationId, contactId }: { locationId: string; contactId: string }) => {
      const data = await ghlRequest({ method: "DELETE", path: `/contacts/${contactId}`, locationId });
      return toolResult(data ?? { deleted: true, contactId });
    }),
  );

  server.registerTool(
    "ghl_contacts_add_tags",
    {
      title: "Adicionar tags a um contato",
      description: "Adiciona uma ou mais tags a um contato existente.",
      inputSchema: { locationId: locationIdField, contactId: z.string(), tags: z.array(z.string()) },
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    withErrorHandling(
      async ({ locationId, contactId, tags }: { locationId: string; contactId: string; tags: string[] }) => {
        const data = await ghlRequest({
          method: "POST",
          path: `/contacts/${contactId}/tags`,
          locationId,
          body: { tags },
        });
        return toolResult(data);
      },
    ),
  );

  server.registerTool(
    "ghl_contacts_remove_tags",
    {
      title: "Remover tags de um contato",
      description: "Remove uma ou mais tags de um contato existente.",
      inputSchema: { locationId: locationIdField, contactId: z.string(), tags: z.array(z.string()) },
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    withErrorHandling(
      async ({ locationId, contactId, tags }: { locationId: string; contactId: string; tags: string[] }) => {
        const data = await ghlRequest({
          method: "DELETE",
          path: `/contacts/${contactId}/tags`,
          locationId,
          body: { tags },
        });
        return toolResult(data);
      },
    ),
  );

  server.registerTool(
    "ghl_contacts_add_to_workflow",
    {
      title: "Inscrever contato em um workflow",
      description:
        "Inscreve (enroll) um contato em um workflow. A GHL não expõe um endpoint genérico de 'trigger' de workflow — " +
        "inscrever um contato é o mecanismo equivalente.",
      inputSchema: { locationId: locationIdField, contactId: z.string(), workflowId: z.string() },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    withErrorHandling(
      async ({
        locationId,
        contactId,
        workflowId,
      }: {
        locationId: string;
        contactId: string;
        workflowId: string;
      }) => {
        const data = await ghlRequest({
          method: "POST",
          path: `/contacts/${contactId}/workflow/${workflowId}`,
          locationId,
          body: {},
        });
        return toolResult(data ?? { enrolled: true, contactId, workflowId });
      },
    ),
  );
}
