import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest } from "../services/ghl-client.js";
import { toolResult, withErrorHandling } from "./helpers.js";

export function registerRawTool(server: McpServer): void {
  server.registerTool(
    "ghl_raw_request",
    {
      title: "Chamada direta à API da GHL (escape hatch)",
      description:
        "Faz uma chamada direta a qualquer endpoint da GoHighLevel API v2 (services.leadconnectorhq.com) que ainda não " +
        "tenha uma tool dedicada. Use como último recurso quando nenhuma outra tool cobrir o que é necessário — consulte " +
        "a documentação oficial da GHL para o path e o formato exatos. O locationId é injetado automaticamente na " +
        "resolução do token; inclua-o também na query/body se o endpoint exigir.",
      inputSchema: {
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
        path: z.string().describe("Path relativo, ex: /contacts/ ou /custom-menus/"),
        locationId: z
          .string()
          .optional()
          .describe("Sub-conta alvo. Omitir apenas para endpoints de nível de agência (ex: /oauth/installedLocations)."),
        useCompanyToken: z
          .boolean()
          .optional()
          .describe("true para usar o token de agência em vez do token da subconta"),
        query: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
        body: z.record(z.any()).optional(),
      },
      annotations: { openWorldHint: true },
    },
    withErrorHandling(
      async ({
        method,
        path,
        locationId,
        useCompanyToken,
        query,
        body,
      }: {
        method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
        path: string;
        locationId?: string;
        useCompanyToken?: boolean;
        query?: Record<string, string | number | boolean>;
        body?: Record<string, unknown>;
      }) => {
        const data = await ghlRequest({ method, path, locationId, useCompanyToken, query, body });
        return toolResult(data);
      },
    ),
  );
}
