import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ghlRequest } from "../services/ghl-client.js";
import { toolResult, withErrorHandling } from "./helpers.js";

const locationIdField = z.string().describe("ID da subconta (obtido via ghl_locations_list)");

export function registerCalendarTools(server: McpServer): void {
  server.registerTool(
    "ghl_calendars_list",
    {
      title: "Listar calendários",
      description: "Lista os calendários configurados em uma subconta.",
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
      title: "Obter horários disponíveis",
      description: "Retorna os horários livres de um calendário em um intervalo de datas (timestamps em ms).",
      inputSchema: {
        locationId: locationIdField,
        calendarId: z.string(),
        startDate: z.number().describe("Início do intervalo, epoch ms"),
        endDate: z.number().describe("Fim do intervalo, epoch ms"),
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
      title: "Listar agendamentos",
      description: "Lista eventos/agendamentos de calendário em uma subconta, em um intervalo de datas (timestamps em ms).",
      inputSchema: {
        locationId: locationIdField,
        calendarId: z.string().optional(),
        startTime: z.number().describe("Início do intervalo, epoch ms"),
        endTime: z.number().describe("Fim do intervalo, epoch ms"),
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
      title: "Obter agendamento",
      description: "Retorna os detalhes de um agendamento pelo id.",
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
      title: "Criar agendamento",
      description: "Cria um novo agendamento em um calendário para um contato.",
      inputSchema: {
        locationId: locationIdField,
        calendarId: z.string(),
        contactId: z.string(),
        startTime: z.string().describe("ISO 8601, ex: 2026-08-01T14:00:00-03:00"),
        endTime: z.string().describe("ISO 8601"),
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
      title: "Atualizar agendamento",
      description: "Atualiza campos de um agendamento existente (horário, status, título, etc.).",
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
      title: "Cancelar/excluir agendamento",
      description: "Exclui um agendamento. Ação irreversível — confirme com o usuário antes de chamar.",
      inputSchema: { locationId: locationIdField, appointmentId: z.string() },
      annotations: { destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    withErrorHandling(async ({ locationId, appointmentId }: { locationId: string; appointmentId: string }) => {
      const data = await ghlRequest({ method: "DELETE", path: `/calendars/events/${appointmentId}`, locationId });
      return toolResult(data ?? { deleted: true, appointmentId });
    }),
  );
}
