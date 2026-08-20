import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest } from "../services/ghl-client.js";
import { toolResult, withErrorHandling } from "./helpers.js";

const locationIdField = z.string().describe("Subaccount ID (obtained via ghl_locations_list)");

export function registerPhoneNumberTools(server: McpServer): void {
  server.registerTool(
    "ghl_phone_numbers_search_available",
    {
      title: "Search Available Phone Numbers",
      description:
        "Searches available phone numbers to purchase in LC Phone for a subaccount. " +
        "Includes fingerprintId in response which MUST be passed when purchasing.",
      inputSchema: {
        locationId: locationIdField,
        countryCode: z.string().default("US").describe("ISO alpha-2 country code, e.g. US, CA"),
        firstPart: z.string().optional().describe("Area code / number prefix, e.g. '415'"),
        lastPart: z.string().optional().describe("Desired ending digits"),
        anywhere: z.string().optional().describe("Digits matching anywhere in the number"),
        numberTypes: z
          .array(z.enum(["local", "tollFree", "mobile"]))
          .optional()
          .describe("Accepted number types"),
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
      title: "List Active Phone Numbers",
      description: "Lists active phone numbers provisioned in a subaccount.",
      inputSchema: {
        locationId: locationIdField,
        page: z.number().int().min(0).default(0),
        pageSize: z.number().int().min(1).max(1000).default(50),
        searchFilter: z.string().optional().describe("Filter by number substring"),
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
      title: "Purchase Phone Number",
      description:
        "Purchases a phone number for a subaccount. " +
        "fingerprintId MUST be the exact value returned by ghl_phone_numbers_search_available from the same search.",
      inputSchema: {
        locationId: locationIdField,
        phoneNumber: z.string().describe("Phone number to purchase (e.g. '+15623625530')"),
        fingerprintId: z
          .string()
          .describe("fingerprintId returned from ghl_phone_numbers_search_available"),
        countryCode: z.string().optional(),
        numberType: z.enum(["local", "tollFree", "mobile"]).optional(),
        addressSid: z.string().optional(),
        bundleSid: z.string().optional(),
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
