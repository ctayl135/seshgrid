export function samplePeak(samples: Float32Array): number {
  let peak = 0;
  for (const value of samples)
    if (Number.isFinite(value)) peak = Math.max(peak, Math.abs(value));
  return peak;
}
export function peakDb(peak: number): number {
  return peak > 0 && Number.isFinite(peak) ? 20 * Math.log10(peak) : -60;
}
