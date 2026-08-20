import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest } from "../services/ghl-client.js";
import { toolResult, withErrorHandling } from "./helpers.js";

const locationIdField = z.string().describe("Subaccount ID (obtained via ghl_locations_list)");

export function registerInvoiceTools(server: McpServer): void {
  server.registerTool(
    "ghl_invoices_list",
    {
      title: "List Invoices",
      description: "Lists invoices created in a subaccount.",
      inputSchema: {
        locationId: locationIdField,
        limit: z.number().int().min(1).max(100).default(20),
        status: z.string().optional().describe("Filter by invoice status (e.g. draft, sent, paid)"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    withErrorHandling(async ({ locationId, limit, status }: { locationId: string; limit: number; status?: string }) => {
      const data = await ghlRequest({
        method: "GET",
        path: "/invoices/",
        locationId,
        query: { altId: locationId, altType: "location", limit, status },
      });
      return toolResult(data);
    }),
  );

  server.registerTool(
    "ghl_invoices_get",
    {
      title: "Get Invoice",
      description: "Returns invoice details by invoiceId.",
      inputSchema: { locationId: locationIdField, invoiceId: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    withErrorHandling(async ({ locationId, invoiceId }: { locationId: string; invoiceId: string }) => {
      const data = await ghlRequest({
        method: "GET",
        path: `/invoices/${invoiceId}`,
        locationId,
        query: { altId: locationId, altType: "location" },
      });
      return toolResult(data);
    }),
  );

  server.registerTool(
    "ghl_invoices_create",
    {
      title: "Create Invoice",
      description: "Creates a new invoice for a contact in a subaccount.",
      inputSchema: {
        locationId: locationIdField,
        title: z.string(),
        customerId: z.string().describe("Contact ID"),
        currency: z.string().default("USD"),
        dueDate: z.string().optional().describe("Due date, ISO format (e.g. 2026-08-30)"),
        lineItems: z.array(
          z.object({
            name: z.string(),
            amount: z.number(),
            qty: z.number().default(1),
          }),
        ),
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    withErrorHandling(async (args: Record<string, unknown>) => {
      const { locationId, ...rest } = args as { locationId: string; [key: string]: unknown };
      const data = await ghlRequest({
        method: "POST",
        path: "/invoices/",
        locationId,
        body: { altId: locationId, altType: "location", ...rest },
      });
      return toolResult(data);
    }),
  );
}
