export const KEY_NAMES = [
  "C",
  "C♯ / D♭",
  "D",
  "D♯ / E♭",
  "E",
  "F",
  "F♯ / G♭",
  "G",
  "G♯ / A♭",
  "A",
  "A♯ / B♭",
  "B",
];
export type KeyCandidate = {
  root: number;
  scale: "major" | "minor";
  score: number;
};
export type KeyAnalysis = {
  candidates: KeyCandidate[];
  chroma: number[];
  clarity: "clear" | "ambiguous";
  frames: number;
};
// Krumhansl major/minor pitch-class profiles, compared by Pearson correlation.
const profiles = {
  major: [
    6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
  ],
  minor: [
    6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
  ],
};
function spectrum(real: Float64Array) {
  const n = real.length,
    imag = new Float64Array(n);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) [real[i], real[j]] = [real[j], real[i]];
  }
  for (let len = 2; len <= n; len *= 2) {
    const angle = (-2 * Math.PI) / len,
      cr = Math.cos(angle),
      ci = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let wr = 1,
        wi = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = i + j,
          b = a + len / 2,
          tr = wr * real[b] - wi * imag[b],
          ti = wr * imag[b] + wi * real[b];
        real[b] = real[a] - tr;
        imag[b] = imag[a] - ti;
        real[a] += tr;
        imag[a] += ti;
        const next = wr * cr - wi * ci;
        wi = wr * ci + wi * cr;
        wr = next;
      }
    }
  }
  return Float64Array.from({ length: n / 2 }, (_, i) =>
    Math.hypot(real[i], imag[i]),
  );
}
export function rankKeys(chroma: number[]): KeyCandidate[] {
  const mean = chroma.reduce((a, b) => a + b, 0) / 12;
  const norm = Math.sqrt(chroma.reduce((a, b) => a + (b - mean) ** 2, 0));
  if (norm < 1e-9) return [];
  const result: KeyCandidate[] = [];
  for (const scale of ["major", "minor"] as const)
    for (let root = 0; root < 12; root++) {
      const p = profiles[scale],
        pm = p.reduce((a, b) => a + b, 0) / 12;
      let dot = 0,
        pn = 0;
      for (let i = 0; i < 12; i++) {
        const v = p[(i - root + 12) % 12] - pm;
        dot += (chroma[i] - mean) * v;
        pn += v * v;
      }
      result.push({ root, scale, score: dot / (norm * Math.sqrt(pn)) });
    }
  return result.sort((a, b) => b.score - a.score);
}
/** Bounded, local spectral analysis of evenly spaced windows in the source segment. */
export async function detectKey(
  channels: Float32Array[],
  rate: number,
  offset = 0,
  duration = Infinity,
): Promise<KeyAnalysis> {
  if (!channels.length || !Number.isFinite(rate) || rate < 4000)
    throw new Error("Audio is unavailable for analysis.");
  const length = Math.min(...channels.map((c) => c.length));
  const start = Math.max(0, Math.floor(offset * rate)),
    end = Math.min(
      length,
      Number.isFinite(duration) ? start + Math.floor(duration * rate) : length,
    );
  if (end - start < rate * 0.75)
    throw new Error("Choose at least one second of tonal audio.");
  // Use the strongest source channel; opposite-phase stereo must not cancel the analysis.
  let source = channels[0],
    energy = -1;
  for (const c of channels) {
    let e = 0;
    for (let i = 0; i < 512; i++) {
      const v = c[start + Math.floor((i * (end - start - 1)) / 512)];
      e += v * v;
    }
    if (e > energy) {
      energy = e;
      source = c;
    }
  }
  const step = Math.max(1, Math.floor(rate / 11025)),
    sr = rate / step,
    n = 4096,
    span = n * step;
  const count = Math.min(128, Math.max(8, Math.ceil((end - start) / span)));
  const chroma = Array<number>(12).fill(0);
  let frames = 0;
  for (let f = 0; f < count; f++) {
    const at =
        start +
        Math.floor(
          (f * Math.max(0, end - start - span)) / Math.max(1, count - 1),
        ),
      x = new Float64Array(n);
    let energy = 0;
    for (let i = 0; i < n; i++) {
      let v = 0;
      for (let j = 0; j < step; j++) v += source[at + i * step + j] ?? 0;
      v /= step;
      energy += v * v;
      x[i] = v * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
    }
    if (energy / n < 1e-7) continue;
    const mag = spectrum(x),
      peak = Math.max(...mag),
      frame = Array<number>(12).fill(0);
    for (
      let k = Math.ceil((65 * n) / sr);
      k < Math.min(mag.length - 1, Math.floor((2200 * n) / sr));
      k++
    ) {
      if (mag[k] < peak * 0.08 || mag[k] < mag[k - 1] || mag[k] < mag[k + 1])
        continue;
      const a = Math.log(mag[k - 1] + 1e-12),
        b = Math.log(mag[k] + 1e-12),
        c = Math.log(mag[k + 1] + 1e-12);
      const delta = Math.max(
        -0.5,
        Math.min(0.5, (0.5 * (a - c)) / (a - 2 * b + c || 1)),
      );
      const midi = 69 + 12 * Math.log2(((k + delta) * sr) / n / 440),
        note = Math.round(midi);
      if (Math.abs(midi - note) > 0.4) continue;
      frame[((note % 12) + 12) % 12] += Math.sqrt(mag[k]);
    }
    const sum = frame.reduce((a, b) => a + b, 0);
    if (sum) {
      for (let i = 0; i < 12; i++) chroma[i] += frame[i] / sum;
      frames++;
    }
    if (f % 8 === 0) await new Promise<void>((r) => setTimeout(r, 0));
  }
  const max = Math.max(...chroma);
  if (frames < 4 || chroma.filter((v) => v > max * 0.12).length < 3)
    throw new Error(
      "Not enough tonal information. Try a melodic beat or a longer vocal phrase.",
    );
  const candidates = rankKeys(chroma).slice(0, 3);
  if (!candidates.length || candidates[0].score < 0.25)
    throw new Error(
      "No reliable key found. Set the key manually or choose a more melodic clip.",
    );
  return {
    candidates,
    chroma,
    frames,
    clarity:
      candidates[0].score > 0.65 &&
      candidates[0].score - candidates[1].score > 0.12
        ? "clear"
        : "ambiguous",
  };
}
