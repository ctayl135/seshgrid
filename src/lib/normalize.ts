import type { Clip } from "./model";
export function normalizationLevel(
  channels: readonly Float32Array[],
  sampleRate: number,
  clip: Pick<Clip, "offset" | "duration">,
  targetDb = -1,
) {
  if (
    !Number.isFinite(sampleRate) ||
    sampleRate <= 0 ||
    !Number.isFinite(targetDb) ||
    targetDb > 0 ||
    targetDb < -60
  )
    throw new Error("Invalid normalization settings");
  let peak = 0;
  const start = Math.max(0, Math.floor(clip.offset * sampleRate)),
    end = Math.ceil((clip.offset + clip.duration) * sampleRate);
  for (const samples of channels)
    for (let i = start; i < Math.min(end, samples.length); i++) {
      if (!Number.isFinite(samples[i]))
        throw new Error("Source audio contains invalid samples");
      peak = Math.max(peak, Math.abs(samples[i]));
    }
  if (peak < 0.000001)
    throw new Error("This clip is silent. Normalization was not applied.");
  return Math.min(32, Math.pow(10, targetDb / 20) / peak);
}
