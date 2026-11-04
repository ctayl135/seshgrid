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
    .select("id,display_name,bio,genre")
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
) {
  if (!supabase) throw new Error("Accounts are not configured");
  const { error } = await supabase.from("artist_profiles").upsert({
    id,
    ...profileValues(name, bio, genre),
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
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
