import type { Project, Clip } from "./model";
export type TimelineTool =
  "select" | "move" | "draw" | "slice" | "mute" | "erase";
export function snapTime(time: number, bpm: number, division: number) {
  return Math.max(
    0,
    Math.min(
      14400,
      division
        ? Math.round(time / (60 / bpm / division)) * (60 / bpm / division)
        : time,
    ),
  );
}
export function clipsInRange(p: Project, a: number, b: number) {
  const start = Math.min(a, b),
    end = Math.max(a, b);
  return p.tracks.flatMap((t) =>
    t.clips
      .filter((c) => c.start < end && c.start + c.duration > start)
      .map((c) => c.id),
  );
}
export function moveClips(
  p: Project,
  ids: readonly string[],
  delta: number,
): Project {
  const clips = p.tracks
    .flatMap((t) => t.clips)
    .filter((c) => ids.includes(c.id));
  if (!clips.length) return p;
  const shift = Math.max(
    -Math.min(...clips.map((c) => c.start)),
    Math.min(delta, 14400 - Math.max(...clips.map((c) => c.start))),
  );
  return {
    ...p,
    tracks: p.tracks.map((t) => ({
      ...t,
      clips: t.clips.map((c) =>
        ids.includes(c.id) ? { ...c, start: c.start + shift } : c,
      ),
    })),
  };
}
export type ClipCopy = { track: string; clip: Clip };
export function copyClips(p: Project, ids: readonly string[]): ClipCopy[] {
  return p.tracks.flatMap((t) =>
    t.clips
      .filter((c) => ids.includes(c.id))
      .map((clip) => ({ track: t.id, clip: { ...clip } })),
  );
}
export function pasteClips(
  p: Project,
  copies: ClipCopy[],
  at: number,
  target?: string,
): Project {
  if (!copies.length) return p;
  const first = Math.min(...copies.map((c) => c.clip.start));
  if (copies.some((c) => at + c.clip.start - first > 14400))
    throw Error("Pasted clips would exceed the timeline limit.");
  return {
    ...p,
    tracks: p.tracks.map((t) => ({
      ...t,
      clips: [
        ...t.clips,
        ...copies
          .filter((c) => (target ? t.id === target : c.track === t.id))
          .map(({ clip }) => {
            const { takeId, takeGroup, ...rest } = clip;
            return {
              ...rest,
              id: crypto.randomUUID(),
              start: at + clip.start - first,
            };
          }),
      ],
    })),
  };
}
