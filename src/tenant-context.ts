import { AsyncLocalStorage } from "node:async_hooks";

interface TenantContext {
  /** GHL agency (company) id — the tenant boundary for every request in this process. */
  companyId: string;
}

const als = new AsyncLocalStorage<TenantContext>();

/**
 * Runs `fn` with `companyId` bound to the current async context. Everything awaited
 * inside `fn` (directly or transitively) can read it back via `getTenantCompanyId()`
 * without it having to be threaded through every function call — this is what lets
 * the GHL tool/service code stay tenant-agnostic while still being fully isolated
 * per authenticated MCP request.
 */
export function runWithTenant<T>(companyId: string, fn: () => T): T {
  return als.run({ companyId }, fn);
}

export function getTenantCompanyId(): string {
  const ctx = als.getStore();
  if (!ctx) {
    throw new Error(
      "No tenant context available — this code path must run inside runWithTenant() (i.e. during an authenticated MCP request).",
    );
  }
  return ctx.companyId;
}
