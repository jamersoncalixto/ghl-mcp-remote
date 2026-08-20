import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./pool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runMigration() {
  console.log("[db:migrate] Executing schema.sql migration...");
  
  // Try locating db/schema.sql relative to current file or project root
  const possiblePaths = [
    path.resolve(__dirname, "../../db/schema.sql"),
    path.resolve(process.cwd(), "db/schema.sql"),
  ];

  let schemaSql: string | null = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      schemaSql = fs.readFileSync(p, "utf-8");
      break;
    }
  }

  if (!schemaSql) {
    throw new Error("Could not find db/schema.sql file.");
  }

  await pool.query(schemaSql);
  console.log("[db:migrate] Schema migration executed successfully!");
  await pool.end();
}

runMigration().catch((err) => {
  console.error("[db:migrate] Migration failed:", err);
  process.exit(1);
});
