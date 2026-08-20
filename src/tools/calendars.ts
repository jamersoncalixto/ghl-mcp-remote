import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest } from "../services/ghl-client.js";
import { toolResult, withErrorHandling } from "./helpers.js";

const locationIdField = z.string().describe("Subaccount ID (obtained via ghl_locations_list)");

export function registerCalendarTools(server: McpServer): void {
  server.registerTool(
    "ghl_calendars_list",
    {
      title: "List Calendars",
      description: "Get all calendars configured in a subaccount.",
      inputSchema: { locationId: locationIdField },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    withErrorHandling(async ({ locationId }: { locationId: string }) => {
      const data = await ghlRequest({ method: "GET", path: "/calendars/", locationId, query: { locationId } });
      return toolResult(data);
    }),
  );

  server.registerTool(
    "ghl_calendars_get_free_slots",
    {
      title: "Get Available Slots",
      description: "Returns available free slots for a calendar within a date range (timestamps in ms).",
      inputSchema: {
        locationId: locationIdField,
        calendarId: z.string(),
        startDate: z.number().describe("Start of date range, epoch ms"),
        endDate: z.number().describe("End of date range, epoch ms"),
        timezone: z.string().optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    withErrorHandling(
      async ({
        locationId,
        calendarId,
        startDate,
        endDate,
        timezone,
      }: {
        locationId: string;
        calendarId: string;
        startDate: number;
        endDate: number;
        timezone?: string;
      }) => {
        const data = await ghlRequest({
          method: "GET",
          path: `/calendars/${calendarId}/free-slots`,
          locationId,
          query: { startDate, endDate, timezone },
        });
        return toolResult(data);
      },
    ),
  );

  server.registerTool(
    "ghl_appointments_list",
    {
      title: "List Appointments",
      description: "Lists calendar events and appointments in a subaccount within a date range (timestamps in ms).",
      inputSchema: {
        locationId: locationIdField,
        calendarId: z.string().optional(),
        startTime: z.number().describe("Start of range, epoch ms"),
        endTime: z.number().describe("End of range, epoch ms"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    withErrorHandling(async (args: Record<string, unknown>) => {
      const { locationId, ...rest } = args as { locationId: string; [key: string]: unknown };
      const data = await ghlRequest({
        method: "GET",
        path: "/calendars/events",
        locationId,
        query: { locationId, ...(rest as Record<string, string | number | boolean | undefined>) },
      });
      return toolResult(data);
    }),
  );

  server.registerTool(
    "ghl_appointments_get",
    {
      title: "Get Appointment",
      description: "Returns appointment details by ID.",
      inputSchema: { locationId: locationIdField, appointmentId: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    withErrorHandling(async ({ locationId, appointmentId }: { locationId: string; appointmentId: string }) => {
      const data = await ghlRequest({
        method: "GET",
        path: `/calendars/events/appointments/${appointmentId}`,
        locationId,
      });
      return toolResult(data);
    }),
  );

  server.registerTool(
    "ghl_appointments_create",
    {
      title: "Create Appointment",
      description: "Creates a new appointment in a calendar for a contact.",
      inputSchema: {
        locationId: locationIdField,
        calendarId: z.string(),
        contactId: z.string(),
        startTime: z.string().describe("ISO 8601 string, e.g. 2026-08-01T14:00:00-03:00"),
        endTime: z.string().describe("ISO 8601 string"),
        title: z.string().optional(),
        appointmentStatus: z.enum(["new", "confirmed", "cancelled", "showed", "noshow"]).optional(),
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
        path: "/calendars/events/appointments",
        locationId,
        body: { locationId, ...rest, ...additionalFields },
      });
      return toolResult(data);
    }),
  );

  server.registerTool(
    "ghl_appointments_update",
    {
      title: "Update Appointment",
      description: "Updates fields of an existing appointment (time, status, title, etc.).",
      inputSchema: { locationId: locationIdField, appointmentId: z.string(), fields: z.record(z.any()) },
      annotations: { destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    withErrorHandling(
      async ({
        locationId,
        appointmentId,
        fields,
      }: {
        locationId: string;
        appointmentId: string;
        fields: Record<string, unknown>;
      }) => {
        const data = await ghlRequest({
          method: "PUT",
          path: `/calendars/events/appointments/${appointmentId}`,
          locationId,
          body: fields,
        });
        return toolResult(data);
      },
    ),
  );

  server.registerTool(
    "ghl_appointments_delete",
    {
      title: "Delete Appointment",
      description: "Deletes an appointment.",
      inputSchema: { locationId: locationIdField, appointmentId: z.string() },
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    withErrorHandling(async ({ locationId, appointmentId }: { locationId: string; appointmentId: string }) => {
      const data = await ghlRequest({ method: "DELETE", path: `/calendars/events/${appointmentId}`, locationId });
      return toolResult(data ?? { deleted: true, appointmentId });
    }),
  );
}
