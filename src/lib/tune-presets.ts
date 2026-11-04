import type { Track } from "./model";
import { stockPlugins } from "./stock-plugins";
import { DRY_EFFECTS } from "./presets";

export const TUNE_STYLES = [
  {
    name: "Rage Wire",
    description: "Instant tuning, gritty drive and tight slap.",
    retune: 0,
    strength: 1,
    chorus: 0,
    tremolo: 0,
    crush: 0.15,
    drive: 0.35,
    delay: 0.09,
    reverb: 0.05,
  },
  {
    name: "Cloud Halo",
    description: "Soft tuning, lush chorus and floating echoes.",
    retune: 100,
    strength: 0.8,
    chorus: 0.65,
    tremolo: 0,
    crush: 0,
    drive: 0.04,
    delay: 0.2,
    reverb: 0.24,
  },
  {
    name: "Neon Robot",
    description: "Hard tuning with digital crunch and pulsing volume.",
    retune: 0,
    strength: 1,
    chorus: 0.15,
    tremolo: 0.4,
    crush: 0.8,
    drive: 0.18,
    delay: 0.12,
    reverb: 0.08,
  },
  {
    name: "Velvet Lead",
    description: "Gentle correction, clean presence and a small room.",
    retune: 150,
    strength: 0.65,
    chorus: 0,
    tremolo: 0,
    crush: 0,
    drive: 0.02,
    delay: 0.04,
    reverb: 0.07,
  },
  {
    name: "Ghost Adlib",
    description: "Fast tuning, ghostly doubling and wide delay.",
    retune: 20,
    strength: 1,
    chorus: 0.85,
    tremolo: 0.2,
    crush: 0,
    drive: 0.08,
    delay: 0.28,
    reverb: 0.2,
  },
  {
    name: "Basement Phone",
    description: "Narrow telephone tone with hard tuning and grit.",
    retune: 5,
    strength: 1,
    chorus: 0,
    tremolo: 0,
    crush: 0.5,
    drive: 0.4,
    delay: 0.1,
    reverb: 0.04,
  },
] as const;

export function applyTuneStyle(track: Track, name: string): Partial<Track> {
  const s = TUNE_STYLES.find((v) => v.name === name);
  if (!s) throw new Error("Unknown tuning style");
  const plugins = stockPlugins();
  plugins.pitch = {
    ...stockPlugins(track.plugins).pitch,
    enabled: true,
    strength: s.strength,
    retune: s.retune,
  };
  Object.assign(plugins, {
    chorus: s.chorus,
    tremolo: s.tremolo,
    crush: s.crush,
    gateDb: -50,
    deEss: 0.25,
  });
  return {
    plugins,
    low: -2,
    high: 1,
    reverb: s.reverb,
    fx: {
      ...DRY_EFFECTS,
      highpass: name === "Basement Phone" ? 500 : 90,
      lowpass: name === "Basement Phone" ? 3200 : 17000,
      compression: 0.5,
      drive: s.drive,
      delay: s.delay,
      delayTime: 0.23,
      feedback: 0.25,
      width: 0.85,
    },
  };
}
