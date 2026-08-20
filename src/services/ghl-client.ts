import { getLocationToken } from "../auth/location-tokens.js";
import { getFreshCompanyToken } from "../auth/ghl-oauth.js";
import { GHL_API_VERSION, GHL_BASE_URL } from "./constants.js";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface GhlRequestOptions {
  method: HttpMethod;
  path: string;
  /** Sub-account this call targets. Omit only for company-level endpoints (e.g. installedLocations). */
  locationId?: string;
  /** Use the agency (company) token instead of a location token — for company-scoped endpoints. */
  useCompanyToken?: boolean;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** Escape hatch to override the `Version` header, in case a future endpoint needs something other than GHL_API_VERSION. */
  apiVersion?: string;
}

export class GhlApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public bodyText: string,
    path: string,
  ) {
    super(`GHL API ${status} ${statusText} on ${path}: ${bodyText}`);
    this.name = "GhlApiError";
  }
}

/** Simple per-key concurrency cap so one busy location can't starve the others. */
class KeyedSemaphore {
  private counts = new Map<string, number>();
  private waiters = new Map<string, Array<() => void>>();
  constructor(private readonly limit: number) {}

  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    await this.acquire(key);
    try {
      return await fn();
    } finally {
      this.release(key);
    }
  }

  private acquire(key: string): Promise<void> {
    const current = this.counts.get(key) ?? 0;
    if (current < this.limit) {
      this.counts.set(key, current + 1);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const queue = this.waiters.get(key) ?? [];
      queue.push(resolve);
      this.waiters.set(key, queue);
    });
  }

  private release(key: string): void {
    const queue = this.waiters.get(key);
    if (queue && queue.length > 0) {
      const next = queue.shift()!;
      next();
      return;
    }
    const current = this.counts.get(key) ?? 1;
    this.counts.set(key, Math.max(0, current - 1));
  }
}

const semaphore = new KeyedSemaphore(4);
const MAX_RETRIES = 3;

function buildUrl(path: string, query?: GhlRequestOptions["query"]): string {
  const url = new URL(path.startsWith("http") ? path : `${GHL_BASE_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function doFetch(opts: GhlRequestOptions, token: string): Promise<Response> {
  const url = buildUrl(opts.path, opts.query);
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
    Version: opts.apiVersion ?? GHL_API_VERSION,
  };
  let body: string | undefined;
  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  return fetch(url, { method: opts.method, headers, body });
}

/**
 * Executes an authenticated GHL API v2 request, resolving the right bearer token
 * (location or company) for the tenant bound to the current request, applying a
 * per-location concurrency cap, and retrying once on 429 with the server-provided backoff.
 */
export async function ghlRequest<T = unknown>(opts: GhlRequestOptions): Promise<T> {
  const rateLimitKey = opts.locationId ?? "__company__";

  return semaphore.run(rateLimitKey, async () => {
    const token = opts.useCompanyToken
      ? (await getFreshCompanyToken()).accessToken
      : await getLocationToken(opts.locationId!);

    let lastError: GhlApiError | undefined;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const res = await doFetch(opts, token);

      if (res.status === 429) {
        const retryAfterHeader = res.headers.get("Retry-After");
        const waitMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : 2000 * (attempt + 1);
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }
      }

      if (!res.ok) {
        const bodyText = await res.text().catch(() => "");
        lastError = new GhlApiError(res.status, res.statusText, bodyText, opts.path);
        if (res.status >= 500 && attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        throw lastError;
      }

      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    }

    throw lastError ?? new GhlApiError(429, "Too Many Requests", "rate limited", opts.path);
  });
}
