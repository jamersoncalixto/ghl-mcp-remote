import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest } from "../services/ghl-client.js";
import { toolResult, withErrorHandling } from "./helpers.js";

const locationIdField = z.string().describe("ID da subconta (obtido via ghl_locations_list)");

export function registerPhoneNumberTools(server: McpServer): void {
  server.registerTool(
    "ghl_phone_numbers_search_available",
    {
      title: "Buscar números disponíveis para compra",
      description:
        "Busca números de telefone disponíveis para compra no sistema de telefonia nativo da GHL (LC Phone) para uma " +
        "subconta, filtrando por DDD/prefixo, país e capacidades (SMS/MMS/voz). Somente leitura — não compra nada. " +
        "A resposta inclui um fingerprintId: guarde-o e reutilize-o exatamente ao chamar ghl_phone_numbers_purchase " +
        "para o número escolhido nesta mesma busca.",
      inputSchema: {
        locationId: locationIdField,
        countryCode: z.string().default("US").describe("Código ISO alpha-2 do país, ex: US, CA"),
        firstPart: z.string().optional().describe("Início do número (equivalente a DDD/área), ex: '415'"),
        lastPart: z.string().optional().describe("Final do número desejado"),
        anywhere: z.string().optional().describe("Dígitos que devem aparecer em qualquer posição do número"),
        numberTypes: z
          .array(z.enum(["local", "tollFree", "mobile"]))
          .optional()
          .describe("Tipos de número aceitos"),
        smsEnabled: z.boolean().optional(),
        mmsEnabled: z.boolean().optional(),
        voiceEnabled: z.boolean().optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    withErrorHandling(async (args: Record<string, unknown>) => {
      const { locationId, numberTypes, ...rest } = args as {
        locationId: string;
        numberTypes?: string[];
        [key: string]: unknown;
      };
      const data = await ghlRequest({
        method: "GET",
        path: `/phone-system/numbers/location/${locationId}/available`,
        locationId,
        query: {
          ...(rest as Record<string, string | number | boolean | undefined>),
          numberTypes: numberTypes?.join(","),
        },
      });
      return toolResult(data);
    }),
  );

  server.registerTool(
    "ghl_phone_numbers_list_active",
    {
      title: "Listar números já provisionados",
      description: "Lista os números de telefone já ativos/provisionados em uma subconta no LC Phone.",
      inputSchema: {
        locationId: locationIdField,
        page: z.number().int().min(0).default(0),
        pageSize: z.number().int().min(1).max(1000).default(50),
        searchFilter: z.string().optional().describe("Filtra por trecho do número"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    withErrorHandling(async (args: Record<string, unknown>) => {
      const { locationId, ...rest } = args as { locationId: string; [key: string]: unknown };
      const data = await ghlRequest({
        method: "GET",
        path: `/phone-system/numbers/location/${locationId}`,
        locationId,
        query: rest as Record<string, string | number | boolean | undefined>,
      });
      return toolResult(data);
    }),
  );

  server.registerTool(
    "ghl_phone_numbers_purchase",
    {
      title: "Comprar/ativar número de telefone",
      description:
        "Compra um número de telefone específico para uma subconta. AÇÃO FINANCEIRA REAL: gera cobrança recorrente " +
        "na conta da agência. Confirme número, subconta e custo com o usuário antes de chamar. " +
        "IMPORTANTE: fingerprintId deve ser exatamente o valor retornado por ghl_phone_numbers_search_available na " +
        "MESMA busca que retornou este phoneNumber — um fingerprintId novo/desconectado faz a compra travar em " +
        "timeout (NUMBERS_UNABLE_PURCHASE_TIMEOUT). Não envie countryCode/numberType/addressSid/bundleSid/etc. a não " +
        "ser que o usuário peça explicitamente ou uma tentativa anterior tenha pedido esses campos — o payload " +
        "mínimo validado é só phoneNumber + fingerprintId.",
      inputSchema: {
        locationId: locationIdField,
        phoneNumber: z.string().describe("Número a comprar, no formato retornado pela busca (ex: '+15623625530')"),
        fingerprintId: z
          .string()
          .describe("fingerprintId retornado por ghl_phone_numbers_search_available na mesma busca deste número"),
        countryCode: z.string().optional(),
        numberType: z.enum(["local", "tollFree", "mobile"]).optional(),
        addressSid: z.string().optional().describe("SID do endereço regulatório — só se uma tentativa anterior exigir"),
        bundleSid: z.string().optional().describe("SID do regulatory bundle — só se uma tentativa anterior exigir"),
        paymentIntentId: z.string().optional(),
        paymentMethodId: z.string().optional(),
        stripeAccountId: z.string().optional(),
        locality: z.string().optional(),
        region: z.string().optional(),
      },
      annotations: { destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    withErrorHandling(async (args: Record<string, unknown>) => {
      const { locationId, ...rest } = args as { locationId: string; [key: string]: unknown };
      const data = await ghlRequest({
        method: "POST",
        path: `/phone-system/numbers/location/${locationId}/purchase`,
        locationId,
        body: rest,
      });
      return toolResult(data);
    }),
  );
}
