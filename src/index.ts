import "dotenv/config";
import express from "express";
import cors from "cors";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./server.js";
import { McpOAuthProvider, MCP_SCOPE } from "./auth/mcp-oauth-provider.js";
import { ghlCallbackHandler } from "./auth/ghl-callback.js";
import { runWithTenant } from "./tenant-context.js";
import { startCleanupLoop } from "./db/oauth-store.js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

const PUBLIC_URL = new URL(requireEnv("PUBLIC_URL"));
const PORT = Number(process.env.PORT ?? 8080);

const provider = new McpOAuthProvider();

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(cors({ exposedHeaders: ["Mcp-Session-Id"] }));
app.use(express.json());

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

// Mounts /.well-known/oauth-authorization-server, /.well-known/oauth-protected-resource/mcp,
// /register (DCR), /authorize, /token, /revoke.
app.use(
  mcpAuthRouter({
    provider,
    issuerUrl: PUBLIC_URL,
    resourceServerUrl: new URL("/mcp", PUBLIC_URL),
    resourceName: "ghl-mcp-remote",
    scopesSupported: [MCP_SCOPE],
  }),
);

// GHL redirects here once the agency admin approves/denies on GHL's own consent screen —
// this is the "login" for this server, see auth/ghl-callback.ts for the full flow.
app.get("/oauth/callback", (req, res) => {
  ghlCallbackHandler(req, res).catch((err) => {
    console.error("[ghl-mcp-remote] unhandled error in GHL callback:", err);
    if (!res.headersSent) res.status(500).send("Internal server error");
  });
});

const resourceMetadataUrl = new URL("/.well-known/oauth-protected-resource/mcp", PUBLIC_URL).toString();
const bearerAuth = requireBearerAuth({ verifier: provider, resourceMetadataUrl });

app.post("/mcp", bearerAuth, async (req, res) => {
  const companyId = req.auth?.extra?.companyId as string | undefined;
  if (!companyId) {
    res.status(401).json({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Token has no associated GHL agency" },
      id: null,
    });
    return;
  }

  try {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await runWithTenant(companyId, () => transport.handleRequest(req, res, req.body));
    res.on("close", () => {
      transport.close();
      server.close();
    });
  } catch (err) {
    console.error("[ghl-mcp-remote] error handling /mcp request:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

// Stateless mode (see server.ts / index.ts wiring): there's no session to resume or close
// out-of-band, so GET/DELETE on /mcp simply aren't supported.
app.get("/mcp", bearerAuth, (_req, res) => {
  res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
});
app.delete("/mcp", bearerAuth, (_req, res) => {
  res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
});

startCleanupLoop();

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[Express Error Handler]", err);
  res.status(500).json({ error: "server_error", details: err?.message || String(err) });
});

app.listen(PORT, () => {
  console.log(`[ghl-mcp-remote] listening on :${PORT} — issuer ${PUBLIC_URL.toString()}`);
});
