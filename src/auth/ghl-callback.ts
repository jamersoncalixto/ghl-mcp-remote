import type { Request, Response } from "express";
import { exchangeGhlCode } from "./ghl-oauth.js";
import { ghlCallbackUrl, AUTH_CODE_TTL_MS, MCP_SCOPE } from "./mcp-oauth-provider.js";
import { consumePendingAuth, createAuthCode } from "../db/oauth-store.js";

function errorPage(status: number, message: string): { status: number; body: string } {
  return {
    status,
    body: `<!doctype html><html><body style="font-family: sans-serif; max-width: 32rem; margin: 4rem auto;">
      <h1>Não foi possível conectar</h1><p>${message}</p></body></html>`,
  };
}

/**
 * GET /oauth/ghl/callback — GHL redirects here once the agency admin approves (or denies)
 * access on its own consent screen. This is the second half of provider.authorize(): we
 * look up the pending MCP request by the `state` we round-tripped through GHL, mint our
 * own authorization code bound to the now-known companyId, and hand control back to the
 * MCP client's original redirect_uri.
 */
export async function ghlCallbackHandler(req: Request, res: Response): Promise<void> {
  const ghlState = typeof req.query.state === "string" ? req.query.state : undefined;
  const code = typeof req.query.code === "string" ? req.query.code : undefined;
  const ghlError = typeof req.query.error === "string" ? req.query.error : undefined;

  if (!ghlState) {
    const page = errorPage(400, "Parâmetro state ausente na resposta da GHL.");
    res.status(page.status).send(page.body);
    return;
  }

  const pending = await consumePendingAuth(ghlState);
  if (!pending) {
    const page = errorPage(400, "Esta tentativa de autorização expirou ou já foi usada. Volte ao Claude/ChatGPT e tente conectar novamente.");
    res.status(page.status).send(page.body);
    return;
  }

  if (ghlError || !code) {
    const target = new URL(pending.redirectUri);
    target.searchParams.set("error", ghlError ?? "access_denied");
    if (pending.mcpState) target.searchParams.set("state", pending.mcpState);
    res.redirect(302, target.toString());
    return;
  }

  let companyId: string;
  try {
    const creds = await exchangeGhlCode(code, ghlCallbackUrl());
    companyId = creds.companyId;
  } catch (err) {
    console.error("[ghl-mcp-remote] failed exchanging GHL code:", err);
    const target = new URL(pending.redirectUri);
    target.searchParams.set("error", "server_error");
    if (pending.mcpState) target.searchParams.set("state", pending.mcpState);
    res.redirect(302, target.toString());
    return;
  }

  const mcpCode = await createAuthCode({
    clientId: pending.clientId,
    companyId,
    redirectUri: pending.redirectUri,
    codeChallenge: pending.codeChallenge,
    scopes: pending.scopes.length > 0 ? pending.scopes : [MCP_SCOPE],
    resource: pending.resource,
    ttlMs: AUTH_CODE_TTL_MS,
  });

  const target = new URL(pending.redirectUri);
  target.searchParams.set("code", mcpCode);
  if (pending.mcpState) target.searchParams.set("state", pending.mcpState);
  res.redirect(302, target.toString());
}
