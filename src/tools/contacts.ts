import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest } from "../services/ghl-client.js";
import { toolResult, withErrorHandling } from "./helpers.js";

const locationIdField = z.string().describe("Subaccount ID (obtained via ghl_locations_list)");

export function registerContactTools(server: McpServer): void {
  server.registerTool(
    "ghl_contacts_search",
    {
      title: "Search Contacts",
      description: "Search or list contacts in a subaccount with optional query text filtering.",
      inputSchema: {
        locationId: locationIdField,
        query: z.string().optional().describe("Search text (name, email, phone)"),
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
      title: "Get Contact",
      description: "Returns full details for a single contact by contactId.",
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
      title: "Create Contact",
      description: "Creates a new contact in a subaccount.",
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
          .describe("Additional fields accepted by GHL Contacts API v2 (customFields, address1, city, etc.)"),
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
      title: "Update Contact",
      description: "Updates fields on an existing contact.",
      inputSchema: {
        locationId: locationIdField,
        contactId: z.string(),
        fields: z.record(z.any()).describe("Fields to update (email, phone, firstName, customFields, etc.)"),
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
      title: "Delete Contact",
      description: "Permanently deletes a contact.",
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
      title: "Add Tags to Contact",
      description: "Adds one or more tags to an existing contact.",
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
      title: "Remove Tags from Contact",
      description: "Removes one or more tags from an existing contact.",
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
      title: "Enroll Contact in Workflow",
      description: "Enrolls a contact in a workflow.",
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
