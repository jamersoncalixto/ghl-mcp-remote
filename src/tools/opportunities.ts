import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest } from "../services/ghl-client.js";
import { toolResult, withErrorHandling } from "./helpers.js";

const locationIdField = z.string().describe("Subaccount ID (obtained via ghl_locations_list)");

export function registerOpportunityTools(server: McpServer): void {
  server.registerTool(
    "ghl_pipelines_list",
    {
      title: "List Pipelines",
      description: "Lists sales pipelines in a subaccount, including their stages.",
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
      title: "Search Opportunities",
      description: "Search or list opportunities in a subaccount, optionally filtering by pipeline, stage, status, or contact.",
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
      title: "Get Opportunity",
      description: "Returns opportunity details by ID.",
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
      title: "Create Opportunity",
      description: "Creates a new opportunity in a pipeline stage for a contact.",
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
      title: "Update Opportunity",
      description: "Updates fields on an opportunity (name, value, stage, status, etc.).",
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
      title: "Delete Opportunity",
      description: "Permanently deletes an opportunity.",
      inputSchema: { locationId: locationIdField, opportunityId: z.string() },
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    withErrorHandling(async ({ locationId, opportunityId }: { locationId: string; opportunityId: string }) => {
      const data = await ghlRequest({ method: "DELETE", path: `/opportunities/${opportunityId}`, locationId });
      return toolResult(data ?? { deleted: true, opportunityId });
    }),
  );
}
