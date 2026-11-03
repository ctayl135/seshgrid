import { Client } from "pg";
import { readFile } from "node:fs/promises";
import { rootCertificates } from "node:tls";
// Load CLI-managed configuration for runtime use; never print or rewrite it.
try {
  process.loadEnvFile(".env.local");
} catch {}
try {
  process.loadEnvFile(".env");
} catch {}
export async function databaseClient() {
  const raw =
    process.env.STUDIO_SUPABASE_POOLER_URL ||
    process.env.SUPABASE_POOLER_URL ||
    process.env.STUDIO_SUPABASE_DB_URL ||
    process.env.SUPABASE_DB_URL;
  if (!raw)
    throw Object.assign(
      new Error("Provisioned Supabase database connection is not configured."),
      { code: "DB_CONFIG_MISSING" },
    );
  const url = new URL(raw);
  const password =
    process.env.STUDIO_SUPABASE_DB_PASS || process.env.SUPABASE_DB_PASS;
  if (password) url.password = password;
  if (
    !url.hostname.endsWith(".supabase.com") &&
    !url.hostname.endsWith(".supabase.co")
  )
    throw Object.assign(new Error("Expected a Supabase database host"), {
      code: "DB_HOST_UNEXPECTED",
    });
  // Explicit TLS options prevent URL parameters from disabling identity checks.
  for (const option of [
    "sslmode",
    "sslcert",
    "sslkey",
    "sslrootcert",
    "uselibpqcompat",
  ])
    url.searchParams.delete(option);
  const ca = await readFile(
    new URL("../supabase/certs/prod-ca-2021.crt", import.meta.url),
    "utf8",
  );
  const client = new Client({
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: true, ca: [...rootCertificates, ca] },
    connectionTimeoutMillis: 15000,
    statement_timeout: 20000,
  });
  await client.connect();
  return client;
}
