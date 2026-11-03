import type { Track } from "./model";
export type VocalEffects = {
  highpass: number;
  lowpass: number;
  compression: number;
  drive: number;
  delay: number;
  delayTime: number;
  feedback: number;
  width: number;
};
export const DRY_EFFECTS: Readonly<VocalEffects> = Object.freeze({
  highpass: 20,
  lowpass: 22000,
  compression: 0,
  drive: 0,
  delay: 0,
  delayTime: 0.25,
  feedback: 0.25,
  width: 0.75,
});
export function trackEffects(track: Track): VocalEffects {
  return { ...DRY_EFFECTS, ...track.fx };
}
export type VocalPreset = {
  id: string;
  name: string;
  category: "Vocals" | "Adlibs";
  description: string;
  low: number;
  high: number;
  reverb: number;
  fx: VocalEffects;
};
const effects = (patch: Partial<VocalEffects>): VocalEffects => ({
  ...DRY_EFFECTS,
  ...patch,
});
export const VOCAL_PRESETS: readonly VocalPreset[] = [
  {
    id: "dark-trap",
    name: "Dark Trap Lead",
    category: "Vocals",
    description: "Close, warm and controlled. A little grit with a short slap.",
    low: -2,
    high: 1,
    reverb: 0.06,
    fx: effects({
      highpass: 90,
      lowpass: 14500,
      compression: 0.55,
      drive: 0.12,
      delay: 0.07,
      delayTime: 0.085,
      feedback: 0.1,
      width: 0.15,
    }),
  },
  {
    id: "rage-cut",
    name: "Rage Cut",
    category: "Vocals",
    description: "Bright, crushed and crunchy for an aggressive lead.",
    low: -3,
    high: 4,
    reverb: 0.08,
    fx: effects({
      highpass: 125,
      lowpass: 16000,
      compression: 0.8,
      drive: 0.38,
      delay: 0.08,
      delayTime: 0.15,
      feedback: 0.2,
      width: 0.3,
    }),
  },
  {
    id: "cloud-float",
    name: "Cloud Float",
    category: "Vocals",
    description: "Airy lead with a hazy room and floating stereo echoes.",
    low: -2,
    high: 3,
    reverb: 0.23,
    fx: effects({
      highpass: 110,
      lowpass: 18000,
      compression: 0.4,
      drive: 0.04,
      delay: 0.17,
      delayTime: 0.3,
      feedback: 0.35,
      width: 0.8,
    }),
  },
  {
    id: "lofi-phone",
    name: "Lo-Fi Phone",
    category: "Vocals",
    description:
      "Narrow, dusty and distorted for an intimate phone-like vocal.",
    low: 0,
    high: -2,
    reverb: 0.09,
    fx: effects({
      highpass: 450,
      lowpass: 3200,
      compression: 0.65,
      drive: 0.3,
      delay: 0.08,
      delayTime: 0.11,
      feedback: 0.12,
      width: 0.1,
    }),
  },
  {
    id: "wide-doubles",
    name: "Wide Doubles",
    category: "Adlibs",
    description: "Short stereo repeats spread a backing take around your lead.",
    low: -4,
    high: 2,
    reverb: 0.14,
    fx: effects({
      highpass: 180,
      lowpass: 14000,
      compression: 0.5,
      drive: 0.07,
      delay: 0.35,
      delayTime: 0.04,
      feedback: 0.08,
      width: 1,
    }),
  },
  {
    id: "ping-pong",
    name: "Ping-Pong Throws",
    category: "Adlibs",
    description: "Alternating left/right echoes that trail into the gaps.",
    low: -4,
    high: 1,
    reverb: 0.16,
    fx: effects({
      highpass: 220,
      lowpass: 12000,
      compression: 0.45,
      drive: 0.1,
      delay: 0.38,
      delayTime: 0.25,
      feedback: 0.48,
      width: 1,
    }),
  },
  {
    id: "ghost-whisper",
    name: "Ghost Whisper",
    category: "Adlibs",
    description: "Thin, dark and distant with a washed-out stereo tail.",
    low: -6,
    high: -2,
    reverb: 0.34,
    fx: effects({
      highpass: 300,
      lowpass: 6500,
      compression: 0.6,
      drive: 0.05,
      delay: 0.27,
      delayTime: 0.35,
      feedback: 0.4,
      width: 0.9,
    }),
  },
  {
    id: "distorted-shout",
    name: "Basement Shout",
    category: "Adlibs",
    description:
      "Hard compression and dirty saturation for raw, punchy shouts.",
    low: -3,
    high: 2,
    reverb: 0.1,
    fx: effects({
      highpass: 160,
      lowpass: 8000,
      compression: 0.85,
      drive: 0.65,
      delay: 0.15,
      delayTime: 0.12,
      feedback: 0.2,
      width: 0.65,
    }),
  },
];
export function applyVocalPreset(track: Track, id: string): Track {
  const preset = VOCAL_PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error("Unknown vocal preset");
  return {
    ...track,
    low: preset.low,
    high: preset.high,
    reverb: preset.reverb,
    fx: { ...preset.fx },
  };
}
export function matchingPreset(track: Track): VocalPreset | undefined {
  const fx = trackEffects(track);
  return VOCAL_PRESETS.find(
    (p) =>
      p.low === track.low &&
      p.high === track.high &&
      p.reverb === track.reverb &&
      (Object.keys(fx) as (keyof VocalEffects)[]).every(
        (key) => p.fx[key] === fx[key],
      ),
  );
}
export function resetVocalEffects(track: Track): Track {
  return { ...track, low: 0, high: 0, reverb: 0, fx: { ...DRY_EFFECTS } };
}
export function effectTail(tracks: Track[]): number {
  return Math.max(
    1.5,
    ...tracks.map((t) => {
      const fx = trackEffects(t);
      if (!fx.delay) return 0;
      const repeats =
        fx.feedback > 0
          ? Math.ceil(Math.log(0.001) / Math.log(fx.feedback))
          : 2;
      return Math.min(15, fx.delayTime * (repeats + 2));
    }),
  );
}
