"use client";
import { useCallback, useRef, useState } from "react";
import type { Project } from "@/lib/model";
import {
  createHistory,
  recordHistory,
  undoHistory,
  redoHistory,
  type History,
} from "@/lib/history";
export function useProjectEditor() {
  const state = useRef<History<Project | null>>(createHistory(null));
  const [history, render] = useState(state.current);
  const publish = useCallback((next: History<Project | null>) => {
    state.current = next;
    render(next);
  }, []);
  const reset = useCallback(
    (project: Project) => publish(createHistory(project)),
    [publish],
  );
  const saved = useCallback(
    (project: Project) =>
      publish({ ...state.current, present: project, group: undefined, at: 0 }),
    [publish],
  );
  const edit = useCallback(
    (fn: (p: Project) => Project, group?: string) => {
      const current = state.current.present;
      if (!current) return;
      const next = fn(current);
      publish(
        next.id === current.id
          ? recordHistory(state.current, next, group)
          : createHistory(next),
      );
    },
    [publish],
  );
  const undo = useCallback(() => {
    const next = undoHistory(state.current);
    publish(next);
    return next.present;
  }, [publish]);
  const redo = useCallback(() => {
    const next = redoHistory(state.current);
    publish(next);
    return next.present;
  }, [publish]);
  return {
    project: history.present,
    reset,
    saved,
    edit,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
