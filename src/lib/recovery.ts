import { validateProject, type Project } from "./model";
import type { SavedSession } from "./storage";
type Draft = {
  id: string;
  project: Project;
  savedAt: string;
  assetIds: string[];
};
export type RecoverySummary = {
  id: string;
  projectId: string;
  name: string;
  savedAt: string;
  tracks: number;
};
const timeoutError = () =>
  new Error("Recovery storage did not respond. Save a project backup.");
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let expired = false;
    const timer = setTimeout(() => {
      expired = true;
      reject(timeoutError());
    }, 8000);
    const r = indexedDB.open("seshgrid-recovery", 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore("drafts", { keyPath: "id" });
      r.result.createObjectStore("assets");
    };
    r.onblocked = () => {
      expired = true;
      clearTimeout(timer);
      reject(timeoutError());
    };
    r.onerror = () => {
      clearTimeout(timer);
      reject(r.error);
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
  });
}
async function operation<T>(
  mode: IDBTransactionMode,
  run: (
    tx: IDBTransaction,
    done: (value: T) => void,
    fail: (error: unknown) => void,
  ) => void,
): Promise<T> {
  const db = await openDB();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(["drafts", "assets"], mode);
      let value: T, error: unknown;
      const timer = setTimeout(() => {
        error = timeoutError();
        try {
          tx.abort();
        } catch {}
        reject(error);
      }, 8000);
      const fail = (e: unknown) => {
        error = e;
        try {
          tx.abort();
        } catch {
          clearTimeout(timer);
          reject(e);
        }
      };
      tx.oncomplete = () => {
        clearTimeout(timer);
        resolve(value);
      };
      tx.onerror = tx.onabort = () => {
        clearTimeout(timer);
        reject(error ?? tx.error ?? timeoutError());
      };
      try {
        run(
          tx,
          (v) => {
            value = v;
          },
          fail,
        );
      } catch (e) {
        fail(e);
      }
    });
  } finally {
    db.close();
  }
}
export async function saveRecovery(
  id: string,
  session: SavedSession,
): Promise<void> {
  const project = validateProject(session.project),
    needed = new Set(
      project.tracks.flatMap((t) => t.clips.map((c) => c.assetId)),
    ),
    provided = new Map(session.assets.map((a) => [a.id, a.blob]));
  if ([...needed].some((asset) => !provided.has(asset)))
    throw new Error("Recovery source audio is missing");
  return operation("readwrite", (tx, done, fail) => {
    const drafts = tx.objectStore("drafts"),
      assets = tx.objectStore("assets"),
      request = drafts.get(id);
    request.onsuccess = () => {
      try {
        const old = request.result as Draft | undefined,
          previous = new Set(
            old?.project.id === project.id ? old.assetIds : [],
          );
        for (const asset of needed)
          if (!previous.has(asset))
            assets.put(provided.get(asset), `${id}/${asset}`);
        for (const asset of old?.assetIds ?? [])
          if (!needed.has(asset)) assets.delete(`${id}/${asset}`);
        drafts.put({
          id,
          project,
          savedAt: new Date().toISOString(),
          assetIds: [...needed],
        } satisfies Draft);
        done();
      } catch (e) {
        fail(e);
      }
    };
  });
}
export function listRecovery(): Promise<RecoverySummary[]> {
  return operation("readonly", (tx, done) => {
    const r = tx.objectStore("drafts").getAll();
    r.onsuccess = () =>
      done(
        (r.result as Draft[])
          .flatMap((d) => {
            try {
              const p = validateProject(d.project);
              if (!Number.isFinite(Date.parse(d.savedAt))) return [];
              return [
                {
                  id: d.id,
                  projectId: p.id,
                  name: p.name,
                  savedAt: d.savedAt,
                  tracks: p.tracks.length,
                },
              ];
            } catch {
              return [];
            }
          })
          .sort((a, b) => b.savedAt.localeCompare(a.savedAt)),
      );
  });
}
export function loadRecovery(id: string): Promise<SavedSession> {
  return operation("readonly", (tx, done, fail) => {
    const r = tx.objectStore("drafts").get(id);
    r.onsuccess = () => {
      try {
        const draft = r.result as Draft | undefined;
        if (!draft) throw new Error("Recovery draft was not found");
        const project = validateProject(draft.project),
          assets: SavedSession["assets"] = [];
        let remaining = draft.assetIds.length;
        if (!remaining) {
          done({ project, assets });
          return;
        }
        for (const asset of draft.assetIds) {
          const a = tx.objectStore("assets").get(`${id}/${asset}`);
          a.onsuccess = () => {
            if (!(a.result instanceof Blob)) {
              fail(new Error("Recovery audio is missing"));
              return;
            }
            assets.push({ id: asset, blob: a.result });
            if (--remaining === 0) done({ project, assets });
          };
        }
      } catch (e) {
        fail(e);
      }
    };
  });
}
export function deleteRecovery(id: string): Promise<void> {
  return operation("readwrite", (tx, done) => {
    const drafts = tx.objectStore("drafts"),
      r = drafts.get(id);
    r.onsuccess = () => {
      const d = r.result as Draft | undefined;
      for (const asset of d?.assetIds ?? [])
        tx.objectStore("assets").delete(`${id}/${asset}`);
      drafts.delete(id);
      done();
    };
  });
}
