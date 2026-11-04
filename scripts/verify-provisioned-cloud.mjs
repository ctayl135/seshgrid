import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { databaseClient } from "./database-client.mjs";
// Isolated integration fixtures: never send email, persist passwords, or modify existing users.
const client = await databaseClient();
const accounts = ["A", "B"].map((suffix) => ({
  suffix,
  id: randomUUID(),
  email: `seshgrid-qa-${randomUUID()}@example.invalid`,
  password: randomBytes(32).toString("base64url"),
}));
let studio;
let projectId;
let audioPath;
let sharedPath;
let secondClient;
let anonymous;
try {
  await client.query("begin");
  for (const a of accounts) {
    await client.query(
      `insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change,email_change_token_current,phone_change,phone_change_token,reauthentication_token) values($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,extensions.crypt($3,extensions.gen_salt('bf')),now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','','','','','')`,
      [a.id, a.email, a.password],
    );
    await client.query(
      `insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at) values($1::text,$1::uuid,$2::jsonb,'email',now(),now())`,
      [
        a.id,
        JSON.stringify({ sub: a.id, email: a.email, email_verified: true }),
      ],
    );
    process.env[`SUPABASE_TEST_EMAIL_${a.suffix}`] = a.email;
    process.env[`SUPABASE_TEST_PASSWORD_${a.suffix}`] = a.password;
  }
  await client.query("commit");
  await import("./verify-cloud.mjs");
  process.env.NEXT_PUBLIC_SUPABASE_URL ||=
    process.env.STUDIO_SUPABASE_PROJECT_URL || process.env.SUPABASE_PROJECT_URL;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||=
    process.env.STUDIO_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY;
  const storage = await import("../src/lib/storage.ts");
  const { newProject, newTrack } = await import("../src/lib/model.ts");
  const { encodeWav } = await import("../src/lib/wav.ts");
  const { applyVocalPreset } = await import("../src/lib/presets.ts");
  studio = storage.supabase;
  const signedIn = await studio.auth.signInWithPassword({
    email: accounts[0].email,
    password: accounts[0].password,
  });
  assert.equal(signedIn.error, null, "Studio sign-in succeeds");
  const project = newProject(),
    track = newTrack("Cloud round trip"),
    assetId = randomUUID();
  projectId = project.id;
  project.name = "Temporary SeshGrid cloud round trip";
  const samples = Float32Array.from(
      { length: 4410 },
      (_, i) => Math.sin((i * 2 * Math.PI * 440) / 44100) * 0.1,
    ),
    blob = new Blob([encodeWav([samples], 44100)], { type: "audio/wav" });
  track.clips = [
    { id: randomUUID(), assetId, start: 0.5, offset: 0, duration: 0.1 },
  ];
  track.role = "beat";
  track.clips[0].level = 1.25;
  track.pan = -0.25;
  track.reverb = 0.1;
  project.tracks = [track];
  Object.assign(track, applyVocalPreset(track, "ping-pong"));
  audioPath = `${accounts[0].id}/${project.id}/${assetId}`;
  const session = { project, assets: [{ id: assetId, blob }] };
  await storage.saveCloud(session, accounts[0].id);
  project.name = "Updated temporary cloud round trip";
  await storage.saveCloud(session, accounts[0].id);
  const listed = await storage.listCloud();
  assert.ok(
    listed.some((p) => p.id === project.id),
    "Cloud project is listed",
  );
  const restored = await storage.loadCloud(project.id, accounts[0].id);
  assert.deepEqual(restored.project, project);
  assert.deepEqual(
    Buffer.from(await restored.assets[0].blob.arrayBuffer()),
    Buffer.from(await blob.arrayBuffer()),
  );
  const social = await import("../src/lib/social.ts");
  await social.saveProfile(
    accounts[0].id,
    "Temporary Noir Artist",
    "Generated-audio security fixture",
    "Rage",
  );
  assert.equal(
    (await social.getProfile(accounts[0].id)).display_name,
    "Temporary Noir Artist",
  );
  const releaseId = await social.publishMix(
    accounts[0].id,
    "Temporary synthetic release",
    "Rage",
    blob,
  );
  sharedPath = accounts[0].id + "/" + releaseId + "/mix.wav";
  assert.ok((await social.releases()).some((p) => p.id === releaseId));
  assert.ok((await social.listenURL(sharedPath)).startsWith("https://"));
  const { createClient } = await import("@supabase/supabase-js");
  const opts = {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  };
  secondClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    opts,
  );
  anonymous = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    opts,
  );
  assert.equal(
    (
      await secondClient.auth.signInWithPassword({
        email: accounts[1].email,
        password: accounts[1].password,
      })
    ).error,
    null,
  );
  assert.equal(
    (await secondClient.storage.from("shared-mixes").download(sharedPath))
      .error,
    null,
    "Members can listen to opted-in published mixes",
  );
  const changed = await secondClient
    .from("artist_profiles")
    .update({ display_name: "Unauthorized overwrite" })
    .eq("id", accounts[0].id)
    .select();
  assert.equal(
    changed.data?.length ?? 0,
    0,
    "Other artists cannot overwrite profiles",
  );
  const changedPost = await secondClient
    .from("feed_posts")
    .update({ title: "Unauthorized overwrite" })
    .eq("id", releaseId)
    .select();
  assert.equal(
    changedPost.data?.length ?? 0,
    0,
    "Other artists cannot change releases",
  );
  const anonPosts = await anonymous.from("feed_posts").select("id");
  assert.ok(
    anonPosts.error || !anonPosts.data?.length,
    "Anonymous users cannot read feed metadata",
  );
  assert.ok(
    (await anonymous.storage.from("shared-mixes").download(sharedPath)).error,
    "Anonymous users cannot download mixes",
  );
  await social.setPublished(releaseId, false);
  assert.ok(
    !(await social.releases()).some((p) => p.id === releaseId),
    "Unpublished releases leave the feed",
  );
  assert.ok(
    (await secondClient.storage.from("shared-mixes").download(sharedPath))
      .error,
    "Other members cannot download unpublished mixes",
  );
  assert.equal(
    (await studio.storage.from("shared-mixes").download(sharedPath)).error,
    null,
    "Owners retain unpublished mixes",
  );
  await social.setPublished(releaseId, true);
  assert.ok(
    (await social.releases()).some((p) => p.id === releaseId),
    "Owners can republish",
  );
  console.log(
    "Live artist/feed checks passed: profile save, mix publish, member playback, anonymous denial, owner-only edits, unpublish denial and republish.",
  );
  console.log(
    "Live studio workflow passed: password sign-in, source upload, repeated save, project listing, reopening and byte-for-byte audio restoration.",
  );
} catch (error) {
  await client.query("rollback").catch(() => {});
  console.error(
    `Live cloud verification failed (${error.code || error.name}): ${error instanceof assert.AssertionError ? error.message.split("\n")[0] : "Check the test stage and provider configuration; credentials were not printed."}`,
  );
  process.exitCode = 1;
} finally {
  if (studio?.auth) {
    if (sharedPath)
      await studio.storage.from("shared-mixes").remove([sharedPath]);
    if (audioPath)
      await studio.storage.from("project-audio").remove([audioPath]);
    if (projectId) await studio.from("projects").delete().eq("id", projectId);
    await studio.auth.signOut();
  }
  await secondClient?.auth.signOut();
  await anonymous?.auth.signOut();
  // Delete exactly the temporary fixture identities created by this run.
  await client.query("delete from auth.users where id = any($1::uuid[])", [
    accounts.map((a) => a.id),
  ]);
  await client.end();
  console.log("Temporary cloud test accounts removed.");
}
