import { GhlApiError } from "../services/ghl-client.js";

export function toolResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: data as Record<string, unknown>,
  };
}

export function toolError(err: unknown) {
  const message = err instanceof GhlApiError ? err.message : String((err as Error)?.message ?? err);
  return {
    content: [{ type: "text" as const, text: `Erro: ${message}` }],
    isError: true as const,
  };
}

/** Wraps a tool handler so thrown errors become a proper MCP error result instead of crashing the server. */
export function withErrorHandling<Args extends unknown[], R>(
  fn: (...args: Args) => Promise<R>,
) {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (err) {
      return toolError(err);
    }
  };
}
