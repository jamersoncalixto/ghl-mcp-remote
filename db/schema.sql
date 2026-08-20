-- Rodar uma vez no Postgres escolhido (Supabase, Neon, RDS, Render Postgres, etc.)
-- antes de subir o servidor pela primeira vez. Idempotente (IF NOT EXISTS).

-- Tokens de agência da GHL, um por tenant (companyId). access_token/refresh_token
-- ficam criptografados (AES-256-GCM, ver src/db/crypto.ts) — nunca em texto puro.
CREATE TABLE IF NOT EXISTS ghl_agencies (
  company_id        TEXT PRIMARY KEY,
  access_token_enc  TEXT NOT NULL,
  refresh_token_enc TEXT NOT NULL,
  expires_at        TIMESTAMPTZ NOT NULL,
  user_id           TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Clients MCP (Claude, ChatGPT, etc.) que se auto-registraram via Dynamic Client
-- Registration (RFC 7591). `raw` guarda o objeto OAuthClientInformationFull inteiro.
CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
  client_id  TEXT PRIMARY KEY,
  raw        JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ponte entre "o client MCP pediu autorização" e "o admin da agência autorizou na
-- tela da GHL" — uma linha por tentativa de login, de curta duração.
CREATE TABLE IF NOT EXISTS mcp_pending_auth (
  ghl_state     TEXT PRIMARY KEY,
  client_id     TEXT NOT NULL,
  redirect_uri  TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  mcp_state     TEXT,
  scopes        TEXT[] NOT NULL DEFAULT '{}',
  resource      TEXT,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Authorization codes emitidos por nós (MCP-side) depois que a GHL confirmou a
-- agência — de uso único, curta duração.
CREATE TABLE IF NOT EXISTS mcp_auth_codes (
  code_hash      TEXT PRIMARY KEY,
  client_id      TEXT NOT NULL,
  company_id     TEXT NOT NULL,
  redirect_uri   TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  scopes         TEXT[] NOT NULL DEFAULT '{}',
  resource       TEXT,
  used           BOOLEAN NOT NULL DEFAULT false,
  expires_at     TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Access/refresh tokens que este servidor emite para os clients MCP. Guardados só
-- como hash SHA-256 (igual senha) — o valor em texto puro nunca é persistido.
CREATE TABLE IF NOT EXISTS mcp_access_tokens (
  token_hash TEXT PRIMARY KEY,
  client_id  TEXT NOT NULL,
  company_id TEXT NOT NULL,
  scopes     TEXT[] NOT NULL DEFAULT '{}',
  resource   TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mcp_refresh_tokens (
  token_hash TEXT PRIMARY KEY,
  client_id  TEXT NOT NULL,
  company_id TEXT NOT NULL,
  scopes     TEXT[] NOT NULL DEFAULT '{}',
  resource   TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mcp_pending_auth_expires ON mcp_pending_auth (expires_at);
CREATE INDEX IF NOT EXISTS idx_mcp_auth_codes_expires ON mcp_auth_codes (expires_at);
CREATE INDEX IF NOT EXISTS idx_mcp_access_tokens_expires ON mcp_access_tokens (expires_at);
CREATE INDEX IF NOT EXISTS idx_mcp_refresh_tokens_expires ON mcp_refresh_tokens (expires_at);
