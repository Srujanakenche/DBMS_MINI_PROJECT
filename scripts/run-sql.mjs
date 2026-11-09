// Runs one SQL file against the project database.
// Usage: node scripts/run-sql.mjs scripts/alter-demo.sql
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/run-sql.mjs <path-to-sql-file>");
  process.exit(1);
}

// Read .env.local / .env without extra dependencies (same approach as run-init-db.mjs).
for (const name of [".env.local", ".env"]) {
  const full = path.resolve(process.cwd(), name);
  if (!fs.existsSync(full)) continue;
  for (const line of fs.readFileSync(full, "utf8").split("\n")) {
    const m = line.trim().match(/^([^#=][^=]*)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    let value = m[2].trim();
    if (/^(".*"|'.*')$/.test(value)) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL (or DIRECT_URL) is not set in the environment or .env.local.");
  process.exit(1);
}

const sqlPath = path.resolve(process.cwd(), file);
const client = new pg.Client({ connectionString });
try {
  await client.connect();
  await client.query(fs.readFileSync(sqlPath, "utf8"));
  console.log(`Ran ${file} successfully.`);
} catch (e) {
  console.error(`Failed to run ${file}: ${e.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
