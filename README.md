# ghl-mcp-remote

Servidor MCP (Model Context Protocol) remoto para GoHighLevel — **multi-tenant**, acessível
via URL, para ser usado a partir do Claude ou do ChatGPT por qualquer agência, sem que cada
uma precise rodar nada localmente.

Este é um projeto **separado** do [`ghl-mcp`](../ghl-mcp) original (stdio, uso pessoal/local).
Nenhum dos dois depende do outro.

## Diferença para o `ghl-mcp` original

| | `ghl-mcp` (original) | `ghl-mcp-remote` (este) |
|---|---|---|
| Transporte | stdio (processo local) | HTTP (`POST /mcp`), hosteável |
| Tenants | 1 agência por instalação, credenciais em `~/.ghl-mcp/credentials.json` | Qualquer nº de agências, isoladas por `companyId`, credenciais no Postgres |
| "Login" | `npm run auth` no terminal | Tela de autorização da própria GHL, disparada pelo Claude/ChatGPT |
| Uso | Você, localmente | Qualquer empresa, a partir do Claude.ai/ChatGPT, via URL |

O código de negócio (as tools em `src/tools/`) é praticamente idêntico nos dois — só a camada
de autenticação/armazenamento muda.

## Arquitetura

```
Claude/ChatGPT ──(1) descobre──> GET /.well-known/oauth-authorization-server
               ──(2) registra───> POST /register                      (DCR, automático)
               ──(3) pede login─> GET /authorize ──redirect──> tela da GHL (o "login")
                                                        <──redirect── GET /oauth/ghl/callback
               <──code+state───── (nosso próprio código de autorização)
               ──(4) troca──────> POST /token ──> access_token + refresh_token nossos
               ──(5) chama tool─> POST /mcp  (Authorization: Bearer <access_token>)
```

- **"Login" = autorizar a GHL.** Não existe conta/senha própria deste serviço. Quando o
  admin de uma agência aprova o acesso na tela da própria GHL, isso já cria/atualiza o tenant
  dele (identificado pelo `companyId` da GHL) e completa o login do lado do MCP.
- **Um único app GHL Marketplace** (mesmo `GHL_CLIENT_ID`/`GHL_CLIENT_SECRET`) atende
  qualquer agência que o instalar — não é preciso criar um app por cliente.
- Cada chamada de tool chega autenticada com um Bearer token emitido por este servidor;
  o middleware resolve esse token pro `companyId` certo e injeta isso num
  `AsyncLocalStorage` (`src/tenant-context.ts`) — é assim que o código das tools (idêntico
  ao do projeto original) permanece "sem saber" de multi-tenancy.
- Implementado em cima do que o próprio `@modelcontextprotocol/sdk` já traz para servidores
  OAuth (`server/auth/router.ts`, `provider.ts`) — ver `src/auth/mcp-oauth-provider.ts`.

## Pré-requisitos pra rodar em qualquer lugar

1. **App OAuth no GHL Marketplace** (Developer > seu app), distribuição "Agency" ou
   "Agency & Sub-Account":
   - Redirect URI cadastrada: `<PUBLIC_URL>/oauth/ghl/callback` (precisa ser a URL pública
     final deste serviço — HTTPS).
   - Scopes: os mesmos listados em [`src/services/scopes.ts`](src/services/scopes.ts).
2. **Postgres** (qualquer um — Supabase, Neon, RDS, o Postgres gerenciado da própria
   plataforma de hosting, etc.). Rodar [`db/schema.sql`](db/schema.sql) nele uma vez.
3. **Node.js 20+** (ou a imagem Docker deste projeto, que já inclui isso).

## Variáveis de ambiente

Ver [`.env.example`](.env.example). Resumo:

| Variável | Descrição |
|---|---|
| `GHL_CLIENT_ID` / `GHL_CLIENT_SECRET` | Do app OAuth do GHL Marketplace |
| `PUBLIC_URL` | URL pública final deste serviço, sem barra no final |
| `PORT` | Porta em que o processo escuta (muitas plataformas sobrescrevem sozinhas) |
| `DATABASE_URL` | Connection string do Postgres |
| `TOKEN_ENCRYPTION_KEY` | 32 bytes em base64 — `openssl rand -base64 32` |

## Rodar localmente (dev)

```bash
npm install
npm run build
npm start
```

Verificações possíveis sem nenhum domínio público:

```bash
curl localhost:8080/healthz
curl localhost:8080/.well-known/oauth-authorization-server
```

O fluxo completo de OAuth (autorizar de verdade na GHL, ganhar token, chamar uma tool) só
funciona com uma `PUBLIC_URL` real (HTTPS) no ar, porque a GHL precisa conseguir redirecionar
o navegador do admin da agência de volta pra cá — e essa mesma URL precisa estar cadastrada
como redirect URI no app GHL.

## Deploy

Este projeto **não assume nenhuma plataforma de hosting específica** — só inclui um
`Dockerfile` genérico. Qualquer plataforma que rode uma imagem Docker (ou `node dist/index.js`
direto) serve, desde que:

1. Exponha uma URL pública HTTPS estável → isso vira `PUBLIC_URL`.
2. Injete as variáveis de ambiente da tabela acima.
3. O Postgres apontado por `DATABASE_URL` já tenha rodado `db/schema.sql`.
4. O redirect URI do app GHL Marketplace seja atualizado pra `<PUBLIC_URL>/oauth/ghl/callback`
   assim que a URL final for conhecida.

## Conectar no Claude / ChatGPT

Depois de hospedado:

- **Claude.ai / Claude Desktop**: Configurações → Connectors → Add custom connector → URL:
  `https://<seu-dominio>/mcp`. O Claude vai te levar pro fluxo de autorização automaticamente.
- **ChatGPT**: em workspaces com suporte a Connectors/MCP remoto (varia por plano — Team,
  Enterprise, ou "Developer mode"), adicionar um connector apontando pra
  `https://<seu-dominio>/mcp`.

> **Caveat sobre o ChatGPT**: o suporte a conectores MCP remotos com OAuth no ChatGPT varia
> por plano/workspace, e algumas superfícies (ex. Deep Research) restringem quais formatos de
> tool aceitam (às vezes só tools no formato "search"/"fetch"). Este servidor segue a spec de
> autorização do MCP à risca (a mesma que o Claude usa), o que maximiza compatibilidade — mas
> vale testar de verdade assim que estiver hospedado, já que o comportamento do lado do
> ChatGPT foge do nosso controle.

## Estrutura

```
src/
  index.ts                 App Express: monta o router de OAuth, POST/GET/DELETE /mcp,
                            GET /oauth/ghl/callback, GET /healthz, CORS.
  server.ts                 createMcpServer() — registra as tools (idêntico ao projeto original).
  tenant-context.ts          AsyncLocalStorage que carrega o companyId durante cada request.
  db/
    pool.ts                  Pool do `pg` a partir de DATABASE_URL.
    crypto.ts                 AES-256-GCM (tokens da GHL em repouso) + SHA-256 (hash dos nossos tokens).
    agencies.ts                Tokens de agência da GHL por companyId (substitui o antigo token-store.ts).
    oauth-store.ts              Clients MCP, pending auth, authorization codes, access/refresh tokens.
  auth/
    ghl-oauth.ts               Troca/refresh de tokens com a GHL — equivalente ao oauth-flow.ts original,
                               mas web-based e por tenant em vez de CLI + arquivo único.
    location-tokens.ts          Cache de location tokens, agora chaveado por companyId.
    mcp-oauth-provider.ts        Implementa OAuthServerProvider do SDK — o núcleo do "login = autorizar a GHL".
    ghl-callback.ts               Handler de GET /oauth/ghl/callback.
  services/
    constants.ts, scopes.ts, ghl-client.ts   Idênticos ao projeto original (só o import de token mudou).
  tools/
    *.ts                       Idênticos ao projeto original, exceto locations.ts (cache agora por tenant).
db/
  schema.sql                  DDL do Postgres — rodar uma vez antes do primeiro start.
```

## Segurança

- Refresh tokens da GHL: criptografados em repouso (AES-256-GCM).
- Access/refresh tokens que este servidor emite para Claude/ChatGPT: guardados só como hash
  SHA-256 — nunca em texto puro, igual senha.
- PKCE (S256) obrigatório em todo o fluxo MCP-side, validado localmente (não delegado à GHL).
- Nenhuma credencial de uma agência é acessível a partir do token de outra — todo acesso ao
  Postgres é filtrado por `companyId`, e esse valor só entra em cena depois que o Bearer token
  é validado.
