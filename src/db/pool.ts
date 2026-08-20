import { Pool } from "pg";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name}. Set it before starting the server.`);
  }
  return value;
}

const connectionString = requireEnv("DATABASE_URL");
const isLocal = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");

export const pool = new Pool({
  connectionString,
  ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
});

