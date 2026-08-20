import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest } from "../services/ghl-client.js";
import { toolResult, withErrorHandling } from "./helpers.js";

const locationIdField = z.string().describe("ID da subconta (obtido via ghl_locations_list)");

export function registerOpportunityTools(server: McpServer): void {
  server.registerTool(
    "ghl_pipelines_list",
    {
      title: "Listar pipelines",
      description: "Lista os pipelines de vendas de uma subconta, com seus estágios (stages).",
      inputSchema: { locationId: locationIdField },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    withErrorHandling(async ({ locationId }: { locationId: string }) => {
      const data = await ghlRequest({ method: "GET", path: "/pipelines/", locationId, query: { locationId } });
      return toolResult(data);
    }),
  );

  server.registerTool(
    "ghl_opportunities_search",
    {
      title: "Buscar oportunidades",
      description: "Busca/lista oportunidades de uma subconta, opcionalmente filtrando por pipeline, estágio ou contato.",
      inputSchema: {
        locationId: locationIdField,
        pipelineId: z.string().optional(),
        pipelineStageId: z.string().optional(),
        contactId: z.string().optional(),
        status: z.enum(["open", "won", "lost", "abandoned", "all"]).optional(),
        limit: z.number().int().min(1).max(100).default(20),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    withErrorHandling(async (args: Record<string, unknown>) => {
      const { locationId, ...filters } = args as { locationId: string; [key: string]: unknown };
      const data = await ghlRequest({
        method: "GET",
        path: "/opportunities/search",
        locationId,
        query: { location_id: locationId, ...(filters as Record<string, string | number | boolean | undefined>) },
      });
      return toolResult(data);
    }),
  );

  server.registerTool(
    "ghl_opportunities_get",
    {
      title: "Obter oportunidade",
      description: "Retorna os detalhes de uma oportunidade pelo id.",
      inputSchema: { locationId: locationIdField, opportunityId: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    withErrorHandling(async ({ locationId, opportunityId }: { locationId: string; opportunityId: string }) => {
      const data = await ghlRequest({ method: "GET", path: `/opportunities/${opportunityId}`, locationId });
      return toolResult(data);
    }),
  );

  server.registerTool(
    "ghl_opportunities_create",
    {
      title: "Criar oportunidade",
      description: "Cria uma nova oportunidade em um pipeline/estágio para um contato.",
      inputSchema: {
        locationId: locationIdField,
        pipelineId: z.string(),
        pipelineStageId: z.string(),
        name: z.string(),
        contactId: z.string(),
        monetaryValue: z.number().optional(),
        status: z.enum(["open", "won", "lost", "abandoned"]).default("open"),
        additionalFields: z.record(z.any()).optional(),
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
        path: "/opportunities/",
        locationId,
        body: { locationId, ...rest, ...additionalFields },
      });
      return toolResult(data);
    }),
  );

  server.registerTool(
    "ghl_opportunities_update",
    {
      title: "Atualizar oportunidade",
      description: "Atualiza campos de uma oportunidade (nome, valor, estágio, status, etc.).",
      inputSchema: { locationId: locationIdField, opportunityId: z.string(), fields: z.record(z.any()) },
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    withErrorHandling(
      async ({
        locationId,
        opportunityId,
        fields,
      }: {
        locationId: string;
        opportunityId: string;
        fields: Record<string, unknown>;
      }) => {
        const data = await ghlRequest({
          method: "PUT",
          path: `/opportunities/${opportunityId}`,
          locationId,
          body: fields,
        });
        return toolResult(data);
      },
    ),
  );

  server.registerTool(
    "ghl_opportunities_delete",
    {
      title: "Excluir oportunidade",
      description: "Exclui permanentemente uma oportunidade. Ação irreversível — confirme com o usuário antes de chamar.",
      inputSchema: { locationId: locationIdField, opportunityId: z.string() },
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    withErrorHandling(async ({ locationId, opportunityId }: { locationId: string; opportunityId: string }) => {
      const data = await ghlRequest({ method: "DELETE", path: `/opportunities/${opportunityId}`, locationId });
      return toolResult(data ?? { deleted: true, opportunityId });
    }),
  );
}
