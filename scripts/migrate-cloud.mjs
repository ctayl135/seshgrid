import { readFile, readdir } from "node:fs/promises";
import { databaseClient } from "./database-client.mjs";
let client;
try {
  client = await databaseClient();
  await client.query("begin");
  await client.query("select pg_advisory_xact_lock(18324517)");
  await client.query("create schema if not exists seshgrid_internal");
  await client.query(
    "create table if not exists seshgrid_internal.migrations (name text primary key, applied_at timestamptz not null default now())",
  );
  const applied = [];
  for (const file of (await readdir("supabase/migrations"))
    .filter((f) => /^\d+.*\.sql$/.test(f))
    .sort()) {
    const name = file.slice(0, -4);
    const { rowCount } = await client.query(
      "select name from seshgrid_internal.migrations where name=$1",
      [name],
    );
    if (!rowCount) {
      await client.query(await readFile("supabase/migrations/" + file, "utf8"));
      await client.query(
        "insert into seshgrid_internal.migrations(name) values($1)",
        [name],
      );
      applied.push(name);
    }
  }
  await client.query("commit");
  const policies = await client.query(
    "select policyname from pg_policies where (schemaname='public' and tablename='projects') or (schemaname='storage' and tablename='objects' and policyname in ('Owners read audio','Owners upload audio','Owners delete audio'))",
  );
  const bucket = await client.query(
    "select public from storage.buckets where id='project-audio'",
  );
  if (bucket.rows[0]?.public !== false || policies.rowCount !== 7)
    throw new Error("Private storage policy verification failed");
  console.log(
    JSON.stringify({
      migrationsApplied: applied,
      privateBucket: true,
      ownerPolicies: policies.rowCount,
    }),
  );
} catch (error) {
  if (client) await client.query("rollback").catch(() => {});
  console.error(
    `Supabase migration failed (${error.code || error.name}). No credentials were printed.`,
  );
  process.exitCode = 1;
} finally {
  await client?.end();
}
