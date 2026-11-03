import type { VocalEffects } from "./presets";
export type Clip = {
  id: string;
  assetId: string;
  start: number;
  offset: number;
  duration: number;
};
export type Track = {
  id: string;
  name: string;
  gain: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  low: number;
  high: number;
  reverb: number;
  fx?: VocalEffects;
  clips: Clip[];
};
export type Project = {
  version: 1;
  id: string;
  name: string;
  bpm: number;
  updatedAt: string;
  tracks: Track[];
};
export type Asset = { id: string; blob: Blob };
export function newProject(): Project {
  return {
    version: 1,
    id: crypto.randomUUID(),
    name: "Untitled session",
    bpm: 120,
    updatedAt: new Date().toISOString(),
    tracks: [],
  };
}
export function newTrack(name: string): Track {
  return {
    id: crypto.randomUUID(),
    name,
    gain: 0.8,
    pan: 0,
    mute: false,
    solo: false,
    low: 0,
    high: 0,
    reverb: 0,
    clips: [],
  };
}
export function projectEnd(p: Project) {
  return Math.max(
    0,
    ...p.tracks.flatMap((t) => t.clips.map((c) => c.start + c.duration)),
  );
}
export function audible(t: Track, tracks: Track[]) {
  return !t.mute && (!tracks.some((x) => x.solo) || t.solo);
}
export function splitClip(c: Clip, at: number): Clip[] {
  const delta = at - c.start;
  if (delta <= 0 || delta >= c.duration) return [c];
  return [
    { ...c, duration: delta },
    {
      ...c,
      id: crypto.randomUUID(),
      start: at,
      offset: c.offset + delta,
      duration: c.duration - delta,
    },
  ];
}
export function validateProject(value: unknown): Project {
  const p = value as Project;
  const finite = (n: number, min: number, max: number) =>
    typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
  if (
    !p ||
    p.version !== 1 ||
    typeof p.id !== "string" ||
    !/^[a-f0-9-]{36}$/.test(p.id) ||
    typeof p.name !== "string" ||
    !p.name.trim() ||
    p.name.length > 200 ||
    !Number.isFinite(Date.parse(p.updatedAt)) ||
    !finite(p.bpm, 30, 300) ||
    !Array.isArray(p.tracks) ||
    p.tracks.length > 128
  )
    throw new Error("Invalid project format");
  const ids = new Set<string>();
  for (const t of p.tracks) {
    if (
      typeof t.id !== "string" ||
      ids.has(t.id) ||
      typeof t.name !== "string" ||
      !finite(t.gain, 0, 2) ||
      !finite(t.pan, -1, 1) ||
      !finite(t.low, -12, 12) ||
      !finite(t.high, -12, 12) ||
      !finite(t.reverb, 0, 1) ||
      typeof t.mute !== "boolean" ||
      typeof t.solo !== "boolean" ||
      !Array.isArray(t.clips)
    )
      throw new Error("Invalid track");
    ids.add(t.id);
    if (t.fx !== undefined) {
      const fx = t.fx;
      if (
        !fx ||
        !finite(fx.highpass, 20, 1500) ||
        !finite(fx.lowpass, 2000, 22000) ||
        !finite(fx.compression, 0, 1) ||
        !finite(fx.drive, 0, 1) ||
        !finite(fx.delay, 0, 1) ||
        !finite(fx.delayTime, 0.025, 0.75) ||
        !finite(fx.feedback, 0, 0.65) ||
        !finite(fx.width, 0, 1)
      )
        throw new Error("Invalid vocal effects");
    }
    if (t.clips.length > 10000) throw new Error("Too many clips");
    for (const c of t.clips) {
      if (
        typeof c.id !== "string" ||
        ids.has(c.id) ||
        typeof c.assetId !== "string" ||
        !/^[a-f0-9-]{36}$/.test(c.assetId) ||
        !finite(c.start, 0, 14400) ||
        !finite(c.offset, 0, 14400) ||
        !finite(c.duration, 0.001, 14400)
      )
        throw new Error("Invalid clip");
      ids.add(c.id);
    }
  }
  return p;
}
