import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest } from "../services/ghl-client.js";
import { toolResult, withErrorHandling } from "./helpers.js";

const locationIdField = z.string().describe("ID da subconta (obtido via ghl_locations_list)");

export function registerFormTools(server: McpServer): void {
  server.registerTool(
    "ghl_forms_list",
    {
      title: "Listar formulários",
      description: "Lista os formulários configurados em uma subconta.",
      inputSchema: { locationId: locationIdField, limit: z.number().int().min(1).max(100).default(20) },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    withErrorHandling(async ({ locationId, limit }: { locationId: string; limit: number }) => {
      const data = await ghlRequest({ method: "GET", path: "/forms/", locationId, query: { locationId, limit } });
      return toolResult(data);
    }),
  );

  server.registerTool(
    "ghl_forms_get_submissions",
    {
      title: "Obter respostas de um formulário",
      description: "Lista as submissões recebidas por um formulário específico.",
      inputSchema: {
        locationId: locationIdField,
        formId: z.string(),
        limit: z.number().int().min(1).max(100).default(20),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    withErrorHandling(
      async ({ locationId, formId, limit }: { locationId: string; formId: string; limit: number }) => {
        const data = await ghlRequest({
          method: "GET",
          path: "/forms/submissions",
          locationId,
          query: { locationId, formId, limit },
        });
        return toolResult(data);
      },
    ),
  );
}
