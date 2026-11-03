import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
try {
  process.loadEnvFile(".env.local");
} catch {}
const env = process.env;
const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_TEST_EMAIL_A",
  "SUPABASE_TEST_PASSWORD_A",
  "SUPABASE_TEST_EMAIL_B",
  "SUPABASE_TEST_PASSWORD_B",
];
if (required.some((key) => !env[key]))
  throw new Error(
    `Configure ${required.join(", ")} in ignored .env.local before running the live privacy checks.`,
  );
const client = () =>
  createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(30000) }),
      },
    },
  );
const a = client(),
  b = client(),
  anon = client();
const signIn = async (c, suffix) => {
  const { data, error } = await c.auth.signInWithPassword({
    email: env[`SUPABASE_TEST_EMAIL_${suffix}`],
    password: env[`SUPABASE_TEST_PASSWORD_${suffix}`],
  });
  if (error)
    throw new Error(
      `Test account ${suffix} sign-in failed. Confirm its email and check its credentials.`,
    );
  return data.user.id;
};
const owner = await signIn(a, "A"),
  other = await signIn(b, "B");
assert.notEqual(owner, other, "Use two different confirmed test accounts");
const id = crypto.randomUUID(),
  asset = crypto.randomUUID(),
  path = `${owner}/${id}/${asset}`;
try {
  const create = await a
    .from("projects")
    .insert({
      id,
      owner_id: owner,
      name: "SeshGrid temporary privacy test",
      manifest: { test: true },
    });
  assert.equal(create.error, null, "Owner can create a project");
  const upload = await a.storage
    .from("project-audio")
    .upload(path, new Blob(["SeshGrid temporary test bytes"]));
  assert.equal(upload.error, null, "Owner can upload private audio");
  for (const [label, c] of [
    ["other user", b],
    ["anonymous", anon],
  ]) {
    const read = await c.from("projects").select("id").eq("id", id);
    assert.ok(
      read.error || read.data.length === 0,
      `${label} cannot read owner project`,
    );
    const audio = await c.storage.from("project-audio").download(path);
    assert.ok(audio.error, `${label} cannot download owner audio`);
  }
  const update = await b
    .from("projects")
    .update({ name: "unauthorized" })
    .eq("id", id)
    .select("id");
  assert.ok(
    update.error || update.data.length === 0,
    "Other user cannot update owner project",
  );
  const remove = await b.from("projects").delete().eq("id", id).select("id");
  assert.ok(
    remove.error || remove.data.length === 0,
    "Other user cannot delete owner project",
  );
  const badInsert = await b
    .from("projects")
    .insert({
      id: crypto.randomUUID(),
      owner_id: owner,
      name: "unauthorized",
      manifest: {},
    });
  assert.ok(
    badInsert.error,
    "Other user cannot create a project under owner identity",
  );
  const badUpload = await b.storage
    .from("project-audio")
    .upload(
      `${owner}/${id}/${crypto.randomUUID()}`,
      new Blob(["unauthorized"]),
    );
  assert.ok(badUpload.error, "Other user cannot upload into owner folder");
  const ownRead = await a.from("projects").select("name").eq("id", id).single();
  assert.equal(
    ownRead.data?.name,
    "SeshGrid temporary privacy test",
    "Owner project remains intact",
  );
  const ownAudio = await a.storage.from("project-audio").download(path);
  assert.equal(await ownAudio.data?.text(), "SeshGrid temporary test bytes");
  console.log(
    "Live privacy checks passed: anonymous and cross-account reads/writes denied; owner access preserved.",
  );
} finally {
  const audioCleanup = await a.storage.from("project-audio").remove([path]);
  const projectCleanup = await a.from("projects").delete().eq("id", id);
  if (audioCleanup.error || projectCleanup.error)
    console.error(
      "Temporary privacy-test cleanup failed; inspect the named test records in Supabase.",
    );
  await Promise.allSettled([a.auth.signOut(), b.auth.signOut()]);
}
