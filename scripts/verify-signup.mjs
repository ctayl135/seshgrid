import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { databaseClient } from "./database-client.mjs";
const db = await databaseClient();
const users = [];
const clients = [];
try {
  const url = process.env.SUPABASE_PROJECT_URL,
    key = process.env.SUPABASE_PUBLISHABLE_KEY;
  for (let i = 0; i < 2; i++) {
    const c = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    clients.push(c);
    const email = "noir-signup-" + randomUUID() + "@example.invalid";
    const { data, error } = await c.auth.signUp({
      email,
      password: randomBytes(24).toString("base64url"),
      options: { data: { display_name: "Generated signup test" } },
    });
    assert.equal(error, null);
    assert.ok(data.session, "Instant signup returns a session");
    users.push({ id: data.user.id, email });
  }
  const handle = "qa_" + randomBytes(6).toString("hex");
  assert.equal(
    (
      await clients[0]
        .from("artist_profiles")
        .insert({
          id: users[0].id,
          display_name: "Welcome test",
          username: handle,
          genre: "Underground",
        })
    ).error,
    null,
  );
  assert.ok(
    (
      await clients[1]
        .from("artist_profiles")
        .insert({
          id: users[1].id,
          display_name: "Duplicate test",
          username: handle,
          genre: "Underground",
        })
    ).error,
    "Duplicate usernames rejected",
  );
  assert.equal(
    (
      await clients[0]
        .from("artist_profiles")
        .update({
          username: handle + "_2",
          bio: "Updated bio",
          website: "https://example.com",
        })
        .eq("id", users[0].id)
    ).error,
    null,
  );
  const path = users[0].id + "/test.png";
  const bytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64",
  );
  assert.equal(
    (
      await clients[0].storage
        .from("artist-avatars")
        .upload(path, bytes, { contentType: "image/png" })
    ).error,
    null,
  );
  assert.equal(
    (
      await clients[0]
        .from("artist_profiles")
        .update({ avatar_path: path })
        .eq("id", users[0].id)
    ).error,
    null,
  );
  assert.ok(
    (
      await clients[1].storage
        .from("artist-avatars")
        .upload(users[0].id + "/spoof.png", bytes, { contentType: "image/png" })
    ).error,
    "Avatar impersonation denied",
  );
  const anon = createClient(url, key, { auth: { persistSession: false } });
  assert.ok(
    (await anon.storage.from("artist-avatars").download(path)).error,
    "Anonymous avatar access denied",
  );
  assert.equal(
    (await clients[0].storage.from("artist-avatars").remove([path])).error,
    null,
  );
  const profile = await clients[0]
    .from("artist_profiles")
    .select("username,website,avatar_path")
    .eq("id", users[0].id)
    .single();
  assert.equal(profile.data.username, handle + "_2");
  console.log(
    "PASS: real instant signup/sign-in sessions, unique/editable usernames, profile details, avatar upload, impersonation denial and anonymous privacy.",
  );
} finally {
  for (let i = 0; i < users.length; i++) {
    await clients[i].auth.signOut();
    await db.query("delete from auth.users where id=$1 and email=$2", [
      users[i].id,
      users[i].email,
    ]);
  }
  await db.end();
  console.log("Generated signup test accounts removed.");
}
