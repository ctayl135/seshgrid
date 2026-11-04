import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { databaseClient } from "./database-client.mjs";
// Isolated integration fixtures: never send email, persist passwords, or modify existing users.
const client = await databaseClient();
const accounts = ["A", "B", "C"].map((suffix) => ({
  suffix,
  id: randomUUID(),
  email: `seshgrid-qa-${randomUUID()}@example.invalid`,
  password: randomBytes(32).toString("base64url"),
}));
let studio;
let stage = "setup";
let projectId;
let audioPath;
let sharedPath;
let secondClient;
let thirdClient;
const extraShared = [];
const extraAudio = [];
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
  const { stockPlugins } = await import("../src/lib/stock-plugins.ts");
  track.plugins = stockPlugins();
  track.plugins.pitch = {
    enabled: true,
    root: 9,
    scale: "minor",
    strength: 0.85,
    retune: 90,
  };
  track.plugins.deEss = 0.4;
  track.clips[0].takeGroup = randomUUID();
  track.clips[0].takeId = randomUUID();
  track.clips[0].muted = false;
  track.reverb = 0.1;
  project.tracks = [track];
  Object.assign(track, applyVocalPreset(track, "ping-pong"));
  audioPath = `${accounts[0].id}/${project.id}/${assetId}`;
  const session = { project, assets: [{ id: assetId, blob }] };
  stage = "owner-save";
  await storage.saveCloud(session, accounts[0].id);
  project.name = "Updated temporary cloud round trip";
  await storage.saveCloud(session, accounts[0].id);
  const listed = await storage.listCloud();
  assert.ok(
    listed.some((p) => p.id === project.id),
    "Cloud project is listed",
  );
  stage = "owner-reopen";
  const legacy = await studio
    .from("projects")
    .update({ name: project.name })
    .eq("id", project.id)
    .select("revision");
  assert.equal(
    legacy.error,
    null,
    "Legacy private owner saves remain supported",
  );
  assert.equal(legacy.data.length, 1);
  session.cloudRevision = legacy.data[0].revision;
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
  stage = "publish-song";
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
    (
      await secondClient.storage
        .from("shared-mixes")
        .createSignedUrl(sharedPath, 60)
    ).error,
    "Other members cannot obtain fresh playback links for unpublished mixes",
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
  stage = "community-profiles";
  const community = await import("../src/lib/community.ts");
  thirdClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    opts,
  );
  assert.equal(
    (
      await thirdClient.auth.signInWithPassword({
        email: accounts[2].email,
        password: accounts[2].password,
      })
    ).error,
    null,
  );
  for (const [c, a] of [
    [secondClient, accounts[1]],
    [thirdClient, accounts[2]],
  ])
    assert.equal(
      (
        await c.from("artist_profiles").insert({
          id: a.id,
          display_name: "Temporary " + a.suffix,
          genre: "Rage",
        })
      ).error,
      null,
    );
  stage = "artist-follows";
  const follow = { follower_id: accounts[0].id, artist_id: accounts[1].id };
  const discoveryHandle = "qa_" + randomBytes(6).toString("hex");
  assert.equal(
    (
      await secondClient
        .from("artist_profiles")
        .update({ username: discoveryHandle })
        .eq("id", accounts[1].id)
    ).error,
    null,
  );
  const search = await studio.rpc("discover_artists", {
    search_text: discoveryHandle,
    suggestions: false,
  });
  assert.equal(search.error, null);
  assert.equal(search.data.length, 1);
  assert.equal(search.data[0].id, accounts[1].id);
  const injection = await studio.rpc("discover_artists", {
    search_text: "%,()",
    suggestions: false,
  });
  assert.equal(injection.error, null);
  assert.equal(injection.data.length, 0);
  assert.ok(
    (
      await anonymous.rpc("discover_artists", {
        search_text: "",
        suggestions: true,
      })
    ).error,
    "Anonymous discovery denied",
  );
  assert.equal(
    (
      await studio.from("artist_follows").upsert(follow, {
        onConflict: "follower_id,artist_id",
        ignoreDuplicates: true,
      })
    ).error,
    null,
  );
  assert.equal(
    (
      await studio.from("artist_follows").upsert(follow, {
        onConflict: "follower_id,artist_id",
        ignoreDuplicates: true,
      })
    ).error,
    null,
  );
  assert.equal(
    (
      await secondClient
        .from("artist_follows")
        .select("*", { head: true, count: "exact" })
        .eq("artist_id", accounts[1].id)
    ).count,
    1,
  );
  assert.ok(
    (
      await secondClient
        .from("artist_follows")
        .insert({ follower_id: accounts[0].id, artist_id: accounts[2].id })
    ).error,
    "Follower impersonation denied",
  );
  const followNotice = await secondClient
    .from("notifications")
    .select("*")
    .eq("link", "/profile?artist=" + accounts[0].id);
  assert.equal(followNotice.error, null);
  assert.equal(
    followNotice.data.length,
    1,
    "Duplicate follows do not duplicate notifications",
  );
  assert.equal(followNotice.data[0].read_at, null);
  assert.ok(
    followNotice.data[0].title.includes(
      "Temporary Noir Artist started following you",
    ),
  );
  for (const c of [studio, thirdClient])
    assert.equal(
      (
        await c
          .from("notifications")
          .select("id")
          .eq("id", followNotice.data[0].id)
      ).data.length,
      0,
      "Only recipient reads follow notification",
    );
  assert.ok(
    (
      await studio
        .from("artist_follows")
        .insert({ follower_id: accounts[0].id, artist_id: accounts[0].id })
    ).error,
    "Self follow denied",
  );
  assert.ok(
    (await anonymous.from("artist_follows").select("*")).error,
    "Anonymous follows denied",
  );
  await secondClient
    .from("artist_follows")
    .delete()
    .eq("follower_id", accounts[0].id);
  assert.equal(
    (
      await studio
        .from("artist_follows")
        .select("*", { head: true, count: "exact" })
        .eq("follower_id", accounts[0].id)
    ).count,
    1,
    "Other artists cannot remove your follows",
  );
  assert.equal(
    (
      await studio
        .from("artist_follows")
        .delete()
        .eq("follower_id", accounts[0].id)
        .eq("artist_id", accounts[1].id)
    ).error,
    null,
  );
  assert.equal(
    (
      await studio
        .from("artist_follows")
        .select("*", { head: true, count: "exact" })
        .eq("follower_id", accounts[0].id)
    ).count,
    0,
  );
  const suggestions = await studio.rpc("discover_artists", {
    search_text: "",
    suggestions: true,
  });
  assert.equal(suggestions.error, null);
  assert.ok(suggestions.data.every((p) => p.id !== accounts[0].id));
  assert.ok(suggestions.data.length <= 6);
  console.log(
    "Live artist follow/discovery checks passed: username search, literal search safety, suggested limits/self-exclusion, counts, duplicate safety and follow privacy.",
  );
  await community.sendMessage(
    accounts[0].id,
    accounts[1].id,
    "Synthetic private message",
  );
  const dm = (
    await secondClient
      .from("direct_messages")
      .select("*")
      .eq("sender_id", accounts[0].id)
  ).data[0];
  assert.equal(dm.body, "Synthetic private message");
  assert.equal(
    (await thirdClient.from("direct_messages").select("id").eq("id", dm.id))
      .data.length,
    0,
    "Unrelated artists cannot read DMs",
  );
  assert.ok(
    (
      await secondClient.from("direct_messages").insert({
        sender_id: accounts[0].id,
        recipient_id: accounts[2].id,
        body: "Spoof",
      })
    ).error,
    "Senders cannot be impersonated",
  );
  assert.ok(
    (await secondClient.from("notifications").select("id")).data.length > 0,
    "Messages generate recipient notifications",
  );
  assert.equal(
    (
      await thirdClient
        .from("notifications")
        .select("id")
        .eq("user_id", accounts[1].id)
    ).data.length,
    0,
    "Notifications are owner-only",
  );
  assert.equal(
    (await secondClient.rpc("read_inbox", { p_sender: accounts[0].id })).error,
    null,
  );
  assert.ok(
    (
      await studio
        .from("direct_messages")
        .select("read_at")
        .eq("id", dm.id)
        .single()
    ).data.read_at,
    "Recipients can mark their conversation read",
  );
  stage = "publish-beat";
  const beatId = await social.publishMix(
    accounts[0].id,
    "Synthetic producer beat",
    "Rage",
    blob,
    {
      bpm: 140,
      license_notes: "Synthetic test only",
      allow_session_use: true,
      duration: 0.1,
    },
  );
  extraShared.push(accounts[0].id + "/" + beatId + "/mix.wav");
  assert.ok((await community.beats()).some((b) => b.id === beatId));
  stage = "invite-editor";
  const inviteId = await community.communityRPC("invite_collaborator", {
    p_project: projectId,
    p_member: accounts[1].id,
    p_role: "editor",
  });
  assert.equal(
    (await secondClient.from("projects").select("id").eq("id", projectId)).data
      .length,
    0,
    "Pending invitations do not expose projects",
  );
  assert.ok(
    (await secondClient.storage.from("project-audio").download(audioPath))
      .error,
    "Pending invitations do not expose sources",
  );
  assert.ok(
    (
      await thirdClient.rpc("respond_invitation", {
        p_id: inviteId,
        p_accept: true,
      })
    ).error,
    "Invitations cannot be accepted by another user",
  );
  assert.equal(
    (
      await secondClient.rpc("respond_invitation", {
        p_id: inviteId,
        p_accept: true,
      })
    ).error,
    null,
  );
  const stale = structuredClone(session);
  await studio.auth.signOut();
  assert.equal(
    (
      await studio.auth.signInWithPassword({
        email: accounts[1].email,
        password: accounts[1].password,
      })
    ).error,
    null,
  );
  stage = "editor-open";
  const shared = await storage.loadCloud(projectId, accounts[1].id);
  assert.equal(shared.ownerId, accounts[0].id);
  assert.equal(shared.canEdit, true);
  const extraId = randomUUID();
  extraAudio.push(accounts[0].id + "/" + projectId + "/" + extraId);
  shared.assets.push({ id: extraId, blob });
  shared.project.tracks[0].clips.push({
    id: randomUUID(),
    assetId: extraId,
    start: 1,
    offset: 0,
    duration: 0.1,
  });
  shared.project.name = "Edited by accepted collaborator";
  stage = "editor-save";
  await storage.saveCloud(shared, accounts[1].id);
  stage = "beat-import";
  const beatCopy = await community.beatSession(beatId);
  assert.equal(beatCopy.project.tracks[0].role, "beat");
  assert.equal(beatCopy.project.bpm, 140);
  assert.notEqual(beatCopy.project.id, projectId);
  const takeOwner = await studio
    .from("projects")
    .update({ owner_id: accounts[1].id })
    .eq("id", projectId)
    .select("id");
  assert.ok(
    takeOwner.error || takeOwner.data.length === 0,
    "Editors cannot take ownership",
  );

  await studio.auth.signOut();
  await studio.auth.signInWithPassword({
    email: accounts[0].email,
    password: accounts[0].password,
  });
  assert.equal(
    (await storage.loadCloud(projectId, accounts[0].id)).project.name,
    "Edited by accepted collaborator",
  );
  stage = "stale-save";
  await assert.rejects(
    () => storage.saveCloud(stale, accounts[0].id),
    (error) => String(error?.message).includes("Session changed"),
  );
  stage = "viewer-access";
  const viewer = await community.communityRPC("invite_collaborator", {
    p_project: projectId,
    p_member: accounts[2].id,
    p_role: "viewer",
  });
  assert.equal(
    (
      await thirdClient.rpc("respond_invitation", {
        p_id: viewer,
        p_accept: true,
      })
    ).error,
    null,
  );
  assert.equal(
    (
      await thirdClient.rpc("project_access", {
        p_id: projectId,
        p_write: false,
      })
    ).data,
    true,
  );
  assert.equal(
    (
      await thirdClient.rpc("project_access", {
        p_id: projectId,
        p_write: true,
      })
    ).data,
    false,
  );
  assert.ok(
    (
      await thirdClient.rpc("save_session", {
        p_id: projectId,
        p_owner: accounts[0].id,
        p_name: "No",
        p_manifest: shared.project,
        p_updated: new Date().toISOString(),
        p_revision: shared.cloudRevision,
      })
    ).error,
    "Viewers cannot save shared edits",
  );
  stage = "revoke";
  await community.communityRPC("revoke_collaborator", { p_id: inviteId });
  assert.equal(
    (await secondClient.from("projects").select("id").eq("id", projectId)).data
      .length,
    0,
    "Revocation removes project access",
  );
  assert.ok(
    (
      await secondClient.storage
        .from("project-audio")
        .createSignedUrl(audioPath, 60)
    ).error,
    "Revocation removes fresh source access",
  );
  console.log(
    "Live beats/DM/invite checks passed: private messages, unread notifications, beat-to-session import, pending denial, editor source upload and save, stale-save rejection, owner immutability, viewer denial and revocation.",
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
    `Live cloud verification failed at ${stage} (${error.code || error.name}): ${error instanceof assert.AssertionError ? error.message.split("\n")[0] : "Check the test stage and provider configuration; credentials were not printed."}`,
  );
  process.exitCode = 1;
} finally {
  if (studio?.auth) {
    await studio.auth.signOut();
    await studio.auth.signInWithPassword({
      email: accounts[0].email,
      password: accounts[0].password,
    });
    if (extraShared.length)
      await studio.storage.from("shared-mixes").remove(extraShared);
    if (extraAudio.length)
      await studio.storage.from("project-audio").remove(extraAudio);
    if (sharedPath)
      await studio.storage.from("shared-mixes").remove([sharedPath]);
    if (audioPath)
      await studio.storage.from("project-audio").remove([audioPath]);
    if (projectId) await studio.from("projects").delete().eq("id", projectId);
    await studio.auth.signOut();
  }
  await secondClient?.auth.signOut();
  await thirdClient?.auth.signOut();
  await anonymous?.auth.signOut();
  // Delete exactly the temporary fixture identities created by this run.
  await client.query("delete from auth.users where id = any($1::uuid[])", [
    accounts.map((a) => a.id),
  ]);
  await client.end();
  console.log("Temporary cloud test accounts removed.");
}
