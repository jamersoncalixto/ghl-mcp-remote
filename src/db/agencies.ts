import { pool } from "./pool.js";
import { encrypt, decrypt } from "./crypto.js";

export interface AgencyCredentials {
  companyId: string;
  accessToken: string;
  refreshToken: string;
  /** epoch ms when accessToken expires */
  expiresAt: number;
  userId: string;
}

/** Creates or overwrites the stored agency tokens for a tenant (re-authorization included). */
export async function upsertAgencyCredentials(creds: AgencyCredentials): Promise<void> {
  await pool.query(
    `INSERT INTO ghl_agencies (company_id, access_token_enc, refresh_token_enc, expires_at, user_id, updated_at)
     VALUES ($1, $2, $3, to_timestamp($4 / 1000.0), $5, now())
     ON CONFLICT (company_id) DO UPDATE SET
       access_token_enc = EXCLUDED.access_token_enc,
       refresh_token_enc = EXCLUDED.refresh_token_enc,
       expires_at = EXCLUDED.expires_at,
       user_id = EXCLUDED.user_id,
       updated_at = now()`,
    [creds.companyId, encrypt(creds.accessToken), encrypt(creds.refreshToken), creds.expiresAt, creds.userId],
  );
}

export async function readAgencyCredentials(companyId: string): Promise<AgencyCredentials | null> {
  const { rows } = await pool.query(
    `SELECT company_id, access_token_enc, refresh_token_enc,
            extract(epoch from expires_at) * 1000 AS expires_at_ms, user_id
     FROM ghl_agencies WHERE company_id = $1`,
    [companyId],
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    companyId: row.company_id,
    accessToken: decrypt(row.access_token_enc),
    refreshToken: decrypt(row.refresh_token_enc),
    expiresAt: Number(row.expires_at_ms),
    userId: row.user_id,
  };
}
