import { supabase } from "./storage";
export const GENRES = [
  "Underground",
  "Rage",
  "Trap",
  "Cloud rap",
  "Pluggnb",
  "Hip-hop",
  "Experimental",
  "R&B",
] as const;
export type ArtistProfile = {
  id: string;
  display_name: string;
  bio: string;
  genre: string;
  username?: string | null;
  avatar_path?: string | null;
  website?: string;
};
export type Release = {
  id: string;
  owner_id: string;
  title: string;
  genre: string;
  audio_path: string;
  published: boolean;
  created_at: string;
  artist_profiles?: { display_name: string } | null;
};
export function profileValues(name: string, bio: string, genre: string) {
  const display_name = name.trim();
  if (
    !display_name ||
    display_name.length > 60 ||
    bio.length > 500 ||
    !GENRES.includes(genre as (typeof GENRES)[number])
  )
    throw new Error(
      "Choose an artist name (1–60 characters), a bio up to 500 characters and a listed genre.",
    );
  return { display_name, bio: bio.trim(), genre };
}
export async function getProfile(id: string) {
  if (!supabase) throw new Error("Accounts are not configured");
  const { data, error } = await supabase
    .from("artist_profiles")
    .select("id,display_name,bio,genre,username,avatar_path,website")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as ArtistProfile | null;
}
export async function saveProfile(
  id: string,
  name: string,
  bio: string,
  genre: string,
  details?: { username: string; website: string; avatar_path?: string | null },
) {
  if (!supabase) throw new Error("Accounts are not configured");
  const extra = details
    ? accountDetails(details.username, details.website)
    : {};
  const { error } = await supabase.from("artist_profiles").upsert({
    id,
    ...profileValues(name, bio, genre),
    ...extra,
    ...(details ? { avatar_path: details.avatar_path ?? null } : {}),
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}
export function accountDetails(username: string, website: string) {
  const handle = username.trim().toLowerCase(),
    link = website.trim();
  if (!/^[a-z0-9_]{3,24}$/.test(handle))
    throw new Error(
      "Choose a username with 3–24 lowercase letters, numbers or underscores.",
    );
  if (link && (link.length > 200 || !/^https:\/\//i.test(link)))
    throw new Error("Use an https:// website link, up to 200 characters.");
  if (link) {
    const u = new URL(link);
    if (u.username || u.password)
      throw new Error("Website links cannot contain login details.");
  }
  return { username: handle, website: link };
}
export async function uploadAvatar(userId: string, file: File) {
  if (!supabase) throw new Error("Sign in first");
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 2097152 ||
    !file.size
  )
    throw new Error("Choose a JPG, PNG or WebP photo under 2 MB.");
  const bitmap = await createImageBitmap(file);
  const valid = bitmap.width <= 4096 && bitmap.height <= 4096;
  bitmap.close();
  if (!valid) throw new Error("Choose a photo no larger than 4096 × 4096.");
  const path =
    userId +
    "/" +
    crypto.randomUUID() +
    "." +
    { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[
      file.type
    ];
  const { error } = await supabase.storage
    .from("artist-avatars")
    .upload(path, file, { contentType: file.type, cacheControl: "0" });
  if (error) throw error;
  return path;
}
export async function releases(owner?: string) {
  if (!supabase) throw new Error("Accounts are not configured");
  let q = supabase
    .from("feed_posts")
    .select("*,artist_profiles(display_name)")
    .order("created_at", { ascending: false })
    .limit(100);
  q = owner
    ? q.eq("owner_id", owner)
    : q.eq("published", true).eq("kind", "song");
  const { data, error } = await q;
  if (error) throw error;
  return data as unknown as Release[];
}
export async function listenURL(path: string) {
  if (!supabase) throw new Error("Accounts are not configured");
  const { data, error } = await supabase.storage
    .from("shared-mixes")
    .createSignedUrl(path, 60);
  if (error) throw error;
  return data.signedUrl;
}
export async function setPublished(id: string, published: boolean) {
  if (!supabase) throw new Error("Accounts are not configured");
  const { error } = await supabase
    .from("feed_posts")
    .update({ published })
    .eq("id", id);
  if (error) throw error;
}
export async function publishMix(
  userId: string,
  title: string,
  genre: string,
  blob: Blob,
  beat?: {
    bpm: number;
    license_notes: string;
    allow_session_use: boolean;
    duration: number;
  },
) {
  if (!supabase) throw new Error("Sign in first");
  if (
    !title.trim() ||
    title.trim().length > 120 ||
    !GENRES.includes(genre as (typeof GENRES)[number])
  )
    throw new Error("Add a title up to 120 characters and choose a genre.");
  if (blob.type !== "audio/wav" || !blob.size || blob.size > 50 * 1024 * 1024)
    throw new Error("Published mixes must be WAV audio under 50 MB.");
  const id = crypto.randomUUID(),
    path = `${userId}/${id}/mix.wav`;
  const { error: upload } = await supabase.storage
    .from("shared-mixes")
    .upload(path, blob, {
      contentType: "audio/wav",
      cacheControl: "0",
      upsert: false,
    });
  if (upload) throw upload;
  const { error } = await supabase.from("feed_posts").insert({
    id,
    owner_id: userId,
    title: title.trim(),
    genre,
    audio_path: path,
    published: true,
    ...(beat ? { kind: "beat", ...beat } : {}),
  });
  if (error) {
    await supabase.storage.from("shared-mixes").remove([path]);
    throw error;
  }
  return id;
}
