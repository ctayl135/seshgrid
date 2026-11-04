import { createClient } from "@supabase/supabase-js";
import { validateProject, type Project, type Asset } from "./model";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const supabase =
  url && key
    ? createClient(url, key, {
        global: {
          fetch: (input, init) =>
            fetch(input, {
              ...init,
              signal: AbortSignal.any([
                ...(init?.signal ? [init.signal] : []),
                AbortSignal.timeout(45000),
              ]),
            }),
        },
      })
    : null;
export type SavedSession = {
  project: Project;
  assets: Asset[];
  ownerId?: string;
  cloudRevision?: number;
  canEdit?: boolean;
};
const storageError = () =>
  new Error(
    "Browser storage did not respond. Download a project backup or use cloud saving.",
  );
function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let expired = false;
    const timer = setTimeout(() => {
      expired = true;
      reject(storageError());
    }, 8000);
    const r = indexedDB.open("seshgrid", 1);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains("sessions"))
        r.result.createObjectStore("sessions", { keyPath: "project.id" });
    };
    r.onblocked = () => {
      expired = true;
      clearTimeout(timer);
      reject(
        new Error(
          "Browser storage is blocked by another tab. Close other SeshGrid tabs or download a project backup.",
        ),
      );
    };
    r.onsuccess = () => {
      clearTimeout(timer);
      if (expired) {
        r.result.close();
        return;
      }
      r.result.onversionchange = () => r.result.close();
      resolve(r.result);
    };
    r.onerror = () => {
      clearTimeout(timer);
      reject(r.error);
    };
  });
}
export async function saveLocal(session: SavedSession) {
  const d = await db();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction("sessions", "readwrite");
      const timer = setTimeout(() => {
        try {
          tx.abort();
        } catch {}
        reject(storageError());
      }, 8000);
      tx.oncomplete = () => {
        clearTimeout(timer);
        resolve();
      };
      tx.onerror = tx.onabort = () => {
        clearTimeout(timer);
        reject(tx.error ?? storageError());
      };
      try {
        tx.objectStore("sessions").put(session);
      } catch (e) {
        clearTimeout(timer);
        reject(e);
      }
    });
  } finally {
    d.close();
  }
}
export async function listLocal(): Promise<SavedSession[]> {
  const d = await db();
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(storageError()), 8000);
      const r = d.transaction("sessions").objectStore("sessions").getAll();
      r.onsuccess = () => {
        clearTimeout(timer);
        resolve(r.result);
      };
      r.onerror = () => {
        clearTimeout(timer);
        reject(r.error);
      };
    });
  } finally {
    d.close();
  }
}
async function privateAudio(path: string): Promise<Blob> {
  if (!supabase) throw new Error("Sign in first");
  const { data, error } = await supabase.storage
    .from("project-audio")
    .createSignedUrl(path, 60);
  if (error) throw error;
  const response = await fetch(data.signedUrl, {
    cache: "no-store",
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok)
    throw new Error(
      "Source audio could not be loaded. Refresh the cloud session and try again.",
    );
  return response.blob();
}
export async function saveCloud(session: SavedSession, userId: string) {
  if (!supabase) throw new Error("Configure Supabase first");
  const ownerId = session.ownerId ?? userId;
  // Immutable assets upload before the manifest. A failed upload never replaces a good project.
  for (const a of session.assets) {
    const path = `${ownerId}/${session.project.id}/${a.id}`;
    const { error } = await supabase.storage
      .from("project-audio")
      .upload(path, a.blob, {
        upsert: false,
        cacheControl: "0",
        contentType: a.blob.type || "application/octet-stream",
      });
    if (error) {
      const status = "statusCode" in error ? String(error.statusCode) : "";
      const duplicate =
        status === "409" ||
        (status === "400" && /already exists/i.test(error.message));
      if (!duplicate) throw error;
      const existing = await privateAudio(path);
      if (existing.size !== a.blob.size)
        throw new Error(
          "Cloud audio differs from this project backup. Create a new session to avoid replacing an existing source.",
        );
      const digest = async (blob: Blob) =>
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()),
        );
      const [cloudHash, localHash] = await Promise.all([
        digest(existing),
        digest(a.blob),
      ]);
      if (!cloudHash.every((byte, index) => byte === localHash[index]))
        throw new Error(
          "Cloud audio differs from this source. Save as a new project to preserve both versions.",
        );
    }
  }
  const { data, error } = await supabase.rpc("save_session", {
    p_id: session.project.id,
    p_owner: ownerId,
    p_name: session.project.name,
    p_manifest: session.project,
    p_updated: session.project.updatedAt,
    p_revision: session.cloudRevision ?? null,
  });
  if (error) throw error;
  session.ownerId = ownerId;
  session.cloudRevision = data as number;
}
export async function listCloud() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("projects")
    .select("id,name,updated_at,owner_id,revision")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
export async function loadCloud(
  id: string,
  userId: string,
): Promise<SavedSession> {
  if (!supabase) throw new Error("Configure Supabase first");
  const { data, error } = await supabase
    .from("projects")
    .select("manifest,owner_id,revision")
    .eq("id", id)
    .single();
  if (error) throw error;
  const ownerId = data.owner_id as string;
  const { data: canEdit, error: accessError } = await supabase.rpc(
    "project_access",
    { p_id: id, p_write: true },
  );
  if (accessError) throw accessError;
  const project = validateProject(data.manifest);
  if (project.id !== id)
    throw new Error("Cloud project identity does not match its manifest");
  const ids = [
      ...new Set(project.tracks.flatMap((t) => t.clips.map((c) => c.assetId))),
    ],
    assets: Asset[] = [];
  for (const assetId of ids) {
    const blob = await privateAudio(`${ownerId}/${id}/${assetId}`);
    assets.push({ id: assetId, blob });
  }
  return {
    project,
    assets,
    ownerId,
    cloudRevision: data.revision,
    canEdit: !!canEdit,
  };
}
