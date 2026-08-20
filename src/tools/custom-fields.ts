import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest } from "../services/ghl-client.js";
import { toolResult, withErrorHandling } from "./helpers.js";

const locationIdField = z.string().describe("Subaccount ID (obtained via ghl_locations_list)");

export function registerCustomFieldTools(server: McpServer): void {
  server.registerTool(
    "ghl_custom_fields_list",
    {
      title: "List Custom Fields",
      description: "Lists contact custom fields configured in a subaccount.",
      inputSchema: { locationId: locationIdField },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    withErrorHandling(async ({ locationId }: { locationId: string }) => {
      const data = await ghlRequest({
        method: "GET",
        path: `/locations/${locationId}/customFields`,
        locationId,
      });
      return toolResult(data);
    }),
  );

  server.registerTool(
    "ghl_custom_fields_create",
    {
      title: "Create Custom Field",
      description: "Creates a new contact custom field in a subaccount.",
      inputSchema: {
        locationId: locationIdField,
        name: z.string(),
        dataType: z
          .enum(["TEXT", "LARGE_TEXT", "NUMERICAL", "PHONE", "MONETARY", "CHECKBOX", "SINGLE_OPTIONS", "MULTIPLE_OPTIONS", "DATE", "TEXTBOX_LIST", "FILE_UPLOAD", "RADIO"])
          .describe("Data type accepted by GHL Custom Fields API"),
        options: z.array(z.string()).optional().describe("Options for multiple choice field types"),
      },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    withErrorHandling(async (args: Record<string, unknown>) => {
      const { locationId, ...rest } = args as { locationId: string; [key: string]: unknown };
      const data = await ghlRequest({
        method: "POST",
        path: `/locations/${locationId}/customFields`,
        locationId,
        body: rest,
      });
      return toolResult(data);
    }),
  );

  server.registerTool(
    "ghl_custom_fields_update",
    {
      title: "Update Custom Field",
      description: "Updates an existing custom field.",
      inputSchema: { locationId: locationIdField, fieldId: z.string(), fields: z.record(z.any()) },
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    withErrorHandling(
      async ({
        locationId,
        fieldId,
        fields,
      }: {
        locationId: string;
        fieldId: string;
        fields: Record<string, unknown>;
      }) => {
        const data = await ghlRequest({
          method: "PUT",
          path: `/locations/${locationId}/customFields/${fieldId}`,
          locationId,
          body: fields,
        });
        return toolResult(data);
      },
    ),
  );

  server.registerTool(
    "ghl_custom_values_list",
    {
      title: "List Custom Values",
      description: "Lists custom values configured in a subaccount.",
      inputSchema: { locationId: locationIdField },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    withErrorHandling(async ({ locationId }: { locationId: string }) => {
      const data = await ghlRequest({
        method: "GET",
        path: `/locations/${locationId}/customValues`,
        locationId,
      });
      return toolResult(data);
    }),
  );

  server.registerTool(
    "ghl_custom_values_create",
    {
      title: "Create Custom Value",
      description: "Creates a new custom value in a subaccount.",
      inputSchema: { locationId: locationIdField, name: z.string(), value: z.string() },
      annotations: { destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    withErrorHandling(async ({ locationId, name, value }: { locationId: string; name: string; value: string }) => {
      const data = await ghlRequest({
        method: "POST",
        path: `/locations/${locationId}/customValues`,
        locationId,
        body: { name, value },
      });
      return toolResult(data);
    }),
  );

  server.registerTool(
    "ghl_custom_values_update",
    {
      title: "Update Custom Value",
      description: "Updates an existing custom value.",
      inputSchema: { locationId: locationIdField, customValueId: z.string(), value: z.string() },
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    withErrorHandling(
      async ({
        locationId,
        customValueId,
        value,
      }: {
        locationId: string;
        customValueId: string;
        value: string;
      }) => {
        const data = await ghlRequest({
          method: "PUT",
          path: `/locations/${locationId}/customValues/${customValueId}`,
          locationId,
          body: { value },
        });
        return toolResult(data);
      },
    ),
  );
}
