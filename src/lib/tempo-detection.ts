export type TempoEstimate = { bpm: number; strength: number };
/** Local onset-envelope autocorrelation. Analyses at most three 30-second windows. */
export async function detectTempo(
  channels: readonly Float32Array[],
  sampleRate: number,
): Promise<TempoEstimate | null> {
  if (!channels.length || !Number.isFinite(sampleRate) || sampleRate < 4000)
    return null;
  const length = Math.min(...channels.map((c) => c.length)),
    duration = length / sampleRate;
  if (duration < 4) return null;
  let source = channels[0],
    bestEnergy = -1;
  for (const c of channels) {
    let e = 0;
    for (let i = 0; i < 1000; i++) {
      const v = c[Math.floor((i * (length - 1)) / 1000)];
      e += v * v;
    }
    if (e > bestEnergy) {
      source = c;
      bestEnergy = e;
    }
  }
  const seconds = Math.min(30, duration),
    starts =
      duration <= 30 ? [0] : [0, (duration - seconds) / 2, duration - seconds],
    fps = 200,
    hop = Math.max(1, Math.round(sampleRate / fps)),
    actualFps = sampleRate / hop;
  const correlations = new Float64Array(Math.ceil((actualFps * 60) / 40) + 2);
  let windows = 0,
    totalPeaks = 0;
  const intervals: number[] = [];
  for (const start of starts) {
    const first = Math.floor(start * sampleRate),
      frames = Math.floor((seconds * sampleRate) / hop),
      onsets = new Float64Array(frames);
    let low = 0,
      previous = 0;
    const step = Math.max(1, Math.floor(sampleRate / 11025)),
      filter = Math.exp(((-2 * Math.PI * 180) / sampleRate) * step);
    for (let f = 0; f < frames; f++) {
      let bass = 0,
        treble = 0,
        count = 0;
      for (let i = 0; i < hop; i += step) {
        const x = source[first + f * hop + i] ?? 0;
        low = (1 - filter) * x + filter * low;
        bass += low * low;
        treble += (x - low) ** 2;
        count++;
      }
      const energy =
        Math.log1p(20 * Math.sqrt(bass / count)) +
        Math.log1p(20 * Math.sqrt(treble / count));
      onsets[f] = Math.max(0, energy - previous);
      previous = energy;
      if (f % 1000 === 0)
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    const mean = onsets.reduce((a, b) => a + b, 0) / frames,
      max = Math.max(...onsets);
    if (max < 0.001) continue;
    let peaks = 0,
      last = -Infinity;
    for (let i = 2; i < frames - 2; i++)
      if (
        onsets[i] > mean * 2 &&
        onsets[i] > max * 0.1 &&
        onsets[i] >= onsets[i - 1] &&
        onsets[i] > onsets[i + 1] &&
        i - last > actualFps * 0.08
      ) {
        const interval = (i - last) / actualFps;
        if (interval >= 0.25 && interval <= 1.5) intervals.push(interval);
        last = i;
        peaks++;
      }
    if (peaks < 6) continue;
    totalPeaks += peaks;
    for (let i = 0; i < frames; i++) onsets[i] = Math.max(0, onsets[i] - mean);
    const raw = onsets.slice();
    for (let i = 2; i < frames - 2; i++)
      onsets[i] =
        (raw[i - 2] +
          2 * raw[i - 1] +
          3 * raw[i] +
          2 * raw[i + 1] +
          raw[i + 2]) /
        9;
    for (
      let lag = Math.floor((actualFps * 60) / 240);
      lag < correlations.length - 1;
      lag++
    ) {
      let dot = 0,
        a = 0,
        b = 0;
      for (let i = lag; i < frames; i++) {
        const x = onsets[i],
          y = onsets[i - lag];
        dot += x * y;
        a += x * x;
        b += y * y;
      }
      correlations[lag] += a && b ? dot / Math.sqrt(a * b) : 0;
    }
    windows++;
  }
  if (!windows || totalPeaks < 6) return null;
  const sorted = intervals.slice().sort((a, b) => a - b),
    hint = sorted.length ? 60 / sorted[Math.floor(sorted.length / 2)] : 120;
  let bestLag = 0,
    bestScore = 0;
  for (
    let lag = Math.ceil((actualFps * 60) / 240);
    lag < correlations.length - 1;
    lag++
  ) {
    const base = correlations[lag] / windows;
    if (
      base < 0.2 ||
      correlations[lag] < correlations[lag - 1] ||
      correlations[lag] < correlations[lag + 1]
    )
      continue;
    const bpm = (60 * actualFps) / lag,
      prior = 0.9 + 0.1 * Math.exp(-(Math.log2(bpm / 120) ** 2) / 2);
    const cadence = 1 + 0.4 * Math.exp(-(Math.log2(bpm / hint) ** 2) / 0.03);
    const score = base * prior * cadence;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  if (!bestLag) return null;
  const a = correlations[bestLag - 1],
    b = correlations[bestLag],
    c = correlations[bestLag + 1],
    delta = Math.max(
      -0.5,
      Math.min(0.5, (0.5 * (a - c)) / (a - 2 * b + c || 1)),
    );
  let bpm = (60 * actualFps) / (bestLag + delta);
  const matching = intervals.filter((v) => Math.abs(60 / v - bpm) < bpm * 0.05);
  if (matching.length >= 4)
    bpm = 60 / (matching.reduce((a, b) => a + b, 0) / matching.length);
  if (Math.abs(bpm - Math.round(bpm)) < 0.2) bpm = Math.round(bpm);
  return { bpm: Math.round(bpm * 10) / 10, strength: bestScore };
}
