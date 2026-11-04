import { randomUUID, randomBytes } from "node:crypto";
import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { databaseClient } from "./database-client.mjs";
import { createClient } from "@supabase/supabase-js";
const path = "test-results/noir-ui-fixture.json",
  db = await databaseClient();
try {
  if (process.argv.includes("--cleanup")) {
    const a = JSON.parse(await readFile(path, "utf8"));
    if (
      !a.email.startsWith("noir-ui-") ||
      !a.email.endsWith("@example.invalid")
    )
      throw Error("Unexpected fixture");
    const match = await db.query(
      "select id from auth.users where id=$1 and email=$2",
      [a.id, a.email],
    );
    if (match.rowCount !== 1) throw Error("Fixture not found");
    const url =
        process.env.SUPABASE_PROJECT_URL ||
        process.env.STUDIO_SUPABASE_PROJECT_URL,
      key =
        process.env.SUPABASE_PUBLISHABLE_KEY ||
        process.env.STUDIO_SUPABASE_PUBLISHABLE_KEY;
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const login = await client.auth.signInWithPassword({
      email: a.email,
      password: a.password,
    });
    if (login.error) throw login.error;
    const posts = await client
      .from("feed_posts")
      .select("audio_path")
      .eq("owner_id", a.id);
    if (posts.error) throw posts.error;
    if (posts.data.length) {
      const removed = await client.storage
        .from("shared-mixes")
        .remove(posts.data.map((p) => p.audio_path));
      if (removed.error) throw removed.error;
    }
    await client.auth.signOut();
    await db.query("delete from auth.users where id=$1 and email=$2", [
      a.id,
      a.email,
    ]);
    await unlink(path);
    console.log("Temporary UI account and generated releases removed.");
  } else {
    try {
      await readFile(path);
      throw Error("An existing UI fixture must be cleaned up first");
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    const a = {
      id: randomUUID(),
      email: `noir-ui-${randomUUID()}@example.invalid`,
      password: randomBytes(32).toString("base64url"),
    };
    await db.query("begin");
    await db.query(
      `insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change,email_change_token_current,phone_change,phone_change_token,reauthentication_token) values($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,extensions.crypt($3,extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','','','','','')`,
      [a.id, a.email, a.password],
    );
    await db.query(
      `insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at) values($1::text,$1::uuid,$2::jsonb,'email',now(),now())`,
      [
        a.id,
        JSON.stringify({ sub: a.id, email: a.email, email_verified: true }),
      ],
    );
    await mkdir("test-results", { recursive: true });
    await writeFile(path, JSON.stringify(a), { flag: "wx" });
    await db.query("commit");
    console.log(
      "Temporary UI fixture created. Credentials remain in ignored local test storage.",
    );
  }
} catch (e) {
  await db.query("rollback").catch(() => {});
  console.error("UI fixture failed: " + (e.code || e.name));
  process.exitCode = 1;
} finally {
  await db.end();
}
