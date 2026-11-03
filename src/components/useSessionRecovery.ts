"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Project } from "@/lib/model";
import {
  saveRecovery,
  listRecovery,
  deleteRecovery,
  type RecoverySummary,
} from "@/lib/recovery";
export function useSessionRecovery(
  project: Project | null,
  dirty: boolean,
  paused: boolean,
  assetRef: { current: Map<string, Blob> },
) {
  const key = useRef(""),
    restored = useRef<string | null>(null),
    queue = useRef(Promise.resolve()),
    generation = useRef(0);
  if (!key.current) key.current = crypto.randomUUID();
  const [drafts, setDrafts] = useState<RecoverySummary[]>([]),
    [status, setStatus] = useState<
      "idle" | "pending" | "saving" | "saved" | "unavailable"
    >("idle"),
    [dismissed, setDismissed] = useState(false);
  const enqueue = useCallback((work: () => Promise<void>) => {
    const task = queue.current.catch(() => {}).then(work);
    queue.current = task.catch(() => {});
    return task;
  }, []);
  const refresh = useCallback(async () => {
    const records = await listRecovery();
    setDrafts(records);
  }, []);
  useEffect(() => {
    let active = true;
    void listRecovery().then(
      (records) => {
        if (active) setDrafts(records);
      },
      () => {
        if (active) setStatus("unavailable");
      },
    );
    return () => {
      active = false;
      generation.current++;
    };
  }, []);
  useEffect(() => {
    const revision = ++generation.current;
    if (!project || !dirty || paused) return;
    setStatus("pending");
    const timer = setTimeout(() => {
      if (generation.current !== revision) return;
      const p = {
          ...project,
          name: project.name.trim() ? project.name : "Untitled session",
          updatedAt: new Date().toISOString(),
        },
        ids = new Set(
          project.tracks.flatMap((t) => t.clips.map((c) => c.assetId)),
        );
      const session = {
        project: p,
        assets: [...assetRef.current]
          .filter(([id]) => ids.has(id))
          .map(([id, blob]) => ({ id, blob })),
      };
      setStatus("saving");
      void enqueue(() => saveRecovery(key.current, session)).then(
        () => {
          if (generation.current === revision) setStatus("saved");
        },
        () => {
          if (generation.current === revision) setStatus("unavailable");
        },
      );
    }, 1500);
    return () => clearTimeout(timer);
  }, [project, dirty, paused, assetRef, enqueue]);
  const clear = useCallback(
    async (preserve?: string) => {
      generation.current++;
      const ids = [
        ...new Set(
          [key.current, restored.current].filter(
            (id): id is string => !!id && id !== preserve,
          ),
        ),
      ];
      restored.current = null;
      await enqueue(async () => {
        for (const id of ids) await deleteRecovery(id);
      });
      setDrafts((current) => current.filter((d) => !ids.includes(d.id)));
      setStatus("idle");
    },
    [enqueue],
  );
  const adopt = useCallback((id: string) => {
    restored.current = id;
    setDismissed(true);
  }, []);
  return {
    drafts: drafts.filter(
      (d) => d.id !== key.current && d.id !== restored.current,
    ),
    status,
    refresh,
    clear,
    adopt,
    dismiss: () => setDismissed(true),
    showBanner: !dismissed,
  };
}
