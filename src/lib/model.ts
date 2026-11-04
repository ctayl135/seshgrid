import type { StockPlugins } from "./stock-plugins";
import type { VolumeMotion } from "./volume-motion";
import type { VocalEffects } from "./presets";
export type Clip = {
  id: string;
  assetId: string;
  start: number;
  offset: number;
  duration: number;
  level?: number;
  muted?: boolean;
  takeId?: string;
  takeGroup?: string;
};
export type Track = {
  id: string;
  name: string;
  role?: "beat" | "vocal" | "adlib";
  gain: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  low: number;
  high: number;
  reverb: number;
  fx?: VocalEffects;
  plugins?: StockPlugins;
  volumeMotion?: VolumeMotion;
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
    role: "vocal",
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
    ...p.tracks.flatMap((t) =>
      t.clips.filter((c) => !c.muted).map((c) => c.start + c.duration),
    ),
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
      (t.role !== undefined && !["beat", "vocal", "adlib"].includes(t.role)) ||
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
    if (t.volumeMotion !== undefined) {
      const m = t.volumeMotion;
      if (
        !m ||
        !/^[a-f0-9-]{36}$/.test(m.id) ||
        !finite(m.start, 0, 14400) ||
        !finite(m.duration, 0.01, 14400) ||
        !Array.isArray(m.points) ||
        m.points.length < 2 ||
        m.points.length > 64 ||
        m.points[0].time !== 0 ||
        m.points[m.points.length - 1].time !== m.duration ||
        m.points.some(
          (v, i) =>
            !finite(v.time, 0, m.duration) ||
            !finite(v.value, 0, 1) ||
            (i > 0 && v.time <= m.points[i - 1].time),
        )
      )
        throw Error("Invalid Volume Motion");
    }
    if (t.plugins !== undefined) {
      const v = t.plugins;
      if (
        !v ||
        typeof v.bypass !== "boolean" ||
        !(v.gateDb === 0 || finite(v.gateDb, -80, -10)) ||
        !finite(v.deEss, 0, 1) ||
        !finite(v.midGain, -12, 12) ||
        !finite(v.midFreq, 200, 8000) ||
        [v.chorus, v.tremolo, v.crush].some(
          (n) => n !== undefined && !finite(n, 0, 1),
        ) ||
        !v.pitch ||
        typeof v.pitch.enabled !== "boolean" ||
        !Number.isInteger(v.pitch.root) ||
        !finite(v.pitch.root, 0, 11) ||
        !["major", "minor", "chromatic"].includes(v.pitch.scale) ||
        !finite(v.pitch.strength, 0, 1) ||
        !finite(v.pitch.retune, 0, 300)
      )
        throw new Error("Invalid stock plugin settings");
    }
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
        !finite(c.duration, 0.001, 14400) ||
        (c.level !== undefined && !finite(c.level, 0, 32)) ||
        (c.muted !== undefined && typeof c.muted !== "boolean") ||
        ((c.takeGroup !== undefined || c.takeId !== undefined) &&
          (!/^[a-f0-9-]{36}$/.test(c.takeGroup ?? "") ||
            !/^[a-f0-9-]{36}$/.test(c.takeId ?? "")))
      )
        throw new Error("Invalid clip");
      ids.add(c.id);
    }
  }
  return p;
}

export function addRecordingTake(track: Track, clip: Clip): Track {
  const group =
    track.clips.find(
      (c) => c.takeGroup && Math.abs(c.start - clip.start) < 0.05,
    )?.takeGroup ?? crypto.randomUUID();
  return {
    ...track,
    clips: [
      ...track.clips.map((c) =>
        c.takeGroup === group ? { ...c, muted: true } : c,
      ),
      { ...clip, takeGroup: group, takeId: crypto.randomUUID(), muted: false },
    ],
  };
}
export function activateTake(
  track: Track,
  group: string,
  takeId: string,
): Track {
  return {
    ...track,
    clips: track.clips.map((c) =>
      c.takeGroup === group ? { ...c, muted: c.takeId !== takeId } : c,
    ),
  };
}
