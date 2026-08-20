import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest } from "../services/ghl-client.js";
import { toolResult, withErrorHandling } from "./helpers.js";

const locationIdField = z.string().describe("ID da subconta (obtido via ghl_locations_list)");

export function registerWorkflowTools(server: McpServer): void {
  server.registerTool(
    "ghl_workflows_list",
    {
      title: "Listar workflows",
      description:
        "Lista os workflows de automação configurados em uma subconta. Somente leitura — a GHL não expõe um endpoint " +
        "para disparar/editar workflows via API; para inscrever um contato em um workflow use ghl_contacts_add_to_workflow.",
      inputSchema: { locationId: locationIdField },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    withErrorHandling(async ({ locationId }: { locationId: string }) => {
      const data = await ghlRequest({ method: "GET", path: "/workflows/", locationId, query: { locationId } });
      return toolResult(data);
    }),
  );
}
