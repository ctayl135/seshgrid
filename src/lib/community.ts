import { supabase, type SavedSession } from "./storage";
import { newProject, newTrack } from "./model";
export type Person = { id: string; display_name: string; genre: string };
export type Invitation = {
  id: string;
  project_id: string;
  invited_by: string;
  member_id: string;
  project_name: string;
  role: "viewer" | "editor";
  status: string;
};
export type Notice = {
  id: string;
  title: string;
  link: string;
  invite_id: string | null;
  read_at: string | null;
  created_at: string;
};
export type Message = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
};
export type Beat = {
  id: string;
  owner_id: string;
  title: string;
  genre: string;
  audio_path: string;
  bpm: number | null;
  duration: number;
  license_notes: string;
  allow_session_use: boolean;
  artist_profiles: { display_name: string } | null;
};
export function messageBody(body: string) {
  const text = body.trim();
  if (!text || text.length > 2000)
    throw new Error("Messages need 1–2000 characters.");
  return text;
}
const client = () => {
  if (!supabase) throw new Error("Sign in first");
  return supabase;
};
export async function people(search = "") {
  const { data, error } = await client()
    .from("artist_profiles")
    .select("id,display_name,genre")
    .ilike("display_name", "%" + search.trim().slice(0, 60) + "%")
    .order("display_name")
    .limit(30);
  if (error) throw error;
  return data as Person[];
}
export async function invitations(project?: string) {
  let q = client()
    .from("collaborators")
    .select("*")
    .order("created_at", { ascending: false });
  if (project) q = q.eq("project_id", project);
  const { data, error } = await q;
  if (error) throw error;
  return data as Invitation[];
}
export async function communityRPC(
  name: string,
  args: Record<string, unknown>,
) {
  const { data, error } = await client().rpc(name, args);
  if (error) throw error;
  return data;
}
export async function notices() {
  const { data, error } = await client()
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data as Notice[];
}
export async function messages(peer?: string, self?: string) {
  let q = client()
    .from("direct_messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(peer ? 200 : 300);
  if (peer && self) {
    if (!/^[a-f0-9-]{36}$/.test(peer) || !/^[a-f0-9-]{36}$/.test(self))
      throw new Error("Choose a valid artist");
    q = q.or(
      `and(sender_id.eq.${self},recipient_id.eq.${peer}),and(sender_id.eq.${peer},recipient_id.eq.${self})`,
    );
  }
  const { data, error } = await q;
  if (error) throw error;
  return data as Message[];
}
export async function sendMessage(
  user: string,
  recipient: string,
  body: string,
) {
  const { error } = await client()
    .from("direct_messages")
    .insert({
      sender_id: user,
      recipient_id: recipient,
      body: messageBody(body),
    });
  if (error)
    throw new Error(
      error.code === "23503"
        ? "Create your artist profile before sending messages."
        : error.message,
    );
}
export async function beats() {
  const { data, error } = await client()
    .from("feed_posts")
    .select("*,artist_profiles(display_name)")
    .eq("published", true)
    .eq("kind", "beat")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data as unknown as Beat[];
}
export async function beatSession(id: string): Promise<SavedSession> {
  const { data, error } = await client()
    .from("feed_posts")
    .select("*")
    .eq("id", id)
    .eq("kind", "beat")
    .eq("published", true)
    .eq("allow_session_use", true)
    .single();
  if (error)
    throw new Error("This beat is no longer available for new sessions.");
  const { data: blob, error: audioError } = await client()
    .storage.from("shared-mixes")
    .download(data.audio_path);
  if (audioError) throw audioError;
  const p = newProject(),
    t = newTrack(data.title),
    assetId = crypto.randomUUID();
  p.name = data.title.slice(0, 180) + " session";
  p.bpm = data.bpm ?? 120;
  t.role = "beat";
  t.clips = [
    {
      id: crypto.randomUUID(),
      assetId,
      start: 0,
      offset: 0,
      duration: Number(data.duration),
    },
  ];
  p.tracks = [t];
  return { project: p, assets: [{ id: assetId, blob }] };
}

export function conversationHeads(rows: Message[], userId: string) {
  const heads = new Map<string, { id: string; message: Message }>();
  for (const m of [...rows].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  )) {
    const id = m.sender_id === userId ? m.recipient_id : m.sender_id;
    if (!heads.has(id)) heads.set(id, { id, message: m });
  }
  return [...heads.values()];
}
