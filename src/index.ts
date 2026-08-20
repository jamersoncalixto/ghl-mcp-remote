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

import fs from "node:fs";

const ghlIconPng = fs.existsSync("ghl-icon.png")
  ? fs.readFileSync("ghl-icon.png")
  : fs.existsSync("favicon.png")
  ? fs.readFileSync("favicon.png")
  : null;

const ghlIconSvg = fs.existsSync("ghl-icon.svg")
  ? fs.readFileSync("ghl-icon.svg", "utf-8")
  : `<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="512" height="512" rx="104" fill="#0B2440"/><g><polygon points="88,178 228,178 158,90" fill="#F4C217"/><polygon points="158,90 228,178 158,178" fill="#000000" opacity="0.14"/><rect x="132" y="178" width="52" height="252" fill="#F4C217"/></g><g><polygon points="284,178 424,178 354,90" fill="#4CAF2E"/><polygon points="354,90 424,178 354,178" fill="#000000" opacity="0.14"/><rect x="328" y="178" width="52" height="252" fill="#4CAF2E"/></g><g><polygon points="196,292 316,292 256,206" fill="#2D9CDB"/><polygon points="256,206 316,292 256,292" fill="#000000" opacity="0.16"/><rect x="230" y="292" width="52" height="138" fill="#2D9CDB"/></g></svg>`;

app.get("/", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>GHL Remote MCP Server</title>
  <link rel="icon" type="image/png" sizes="512x512" href="/favicon.png">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="shortcut icon" href="/favicon.ico">
  <link rel="apple-touch-icon" sizes="512x512" href="/apple-touch-icon.png">
  <meta property="og:image" content="${PUBLIC_URL.origin}/ghl-icon.png">
</head>
<body style="font-family: system-ui, sans-serif; display: grid; place-content: center; height: 100vh; margin: 0; background: #0B2440; color: #fff; text-align: center;">
  <img src="/ghl-icon.png" width="128" height="128" style="border-radius: 24px; margin: 0 auto 1.5rem; box-shadow: 0 10px 25px rgba(0,0,0,0.3);" alt="HighLevel Logo" />
  <h1 style="margin: 0 0 0.5rem; font-weight: 700;">GHL Remote MCP Server</h1>
  <p style="opacity: 0.8; margin: 0;">Status: Active & Operational</p>
</body>
</html>`);
});

app.get(["/favicon.png", "/icon.png", "/apple-touch-icon.png", "/logo.png", "/ghl-icon.png"], (_req, res) => {
  if (ghlIconPng) {
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(ghlIconPng);
  } else {
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(ghlIconSvg);
  }
});

app.get(["/favicon.ico"], (_req, res) => {
  if (ghlIconPng) {
    res.setHeader("Content-Type", "image/x-icon");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(ghlIconPng);
  } else {
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(ghlIconSvg);
  }
});

app.get(["/favicon.svg", "/icon.svg", "/logo.svg", "/ghl-icon.svg"], (_req, res) => {
  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(ghlIconSvg);
});

// Mounts /.well-known/oauth-authorization-server, /.well-known/oauth-protected-resource/mcp,
// /register (DCR), /authorize, /token, /revoke.
app.use(
  mcpAuthRouter({
    provider,
    issuerUrl: PUBLIC_URL,
    resourceServerUrl: new URL("/mcp", PUBLIC_URL),
    resourceName: "GHL Remote MCP",
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
