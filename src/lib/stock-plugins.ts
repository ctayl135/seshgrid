export type StockPlugins = {
  bypass: boolean;
  gateDb: number;
  deEss: number;
  midGain: number;
  midFreq: number;
  chorus?: number;
  tremolo?: number;
  crush?: number;
  pitch: {
    enabled: boolean;
    root: number;
    scale: "chromatic" | "major" | "minor";
    strength: number;
    retune: number;
  };
};
export const DEFAULT_PLUGINS: StockPlugins = {
  bypass: false,
  gateDb: 0,
  deEss: 0,
  midGain: 0,
  midFreq: 1400,
  chorus: 0,
  tremolo: 0,
  crush: 0,
  pitch: {
    enabled: false,
    root: 0,
    scale: "chromatic",
    strength: 1,
    retune: 40,
  },
};
export function stockPlugins(value?: StockPlugins): StockPlugins {
  return {
    ...DEFAULT_PLUGINS,
    ...value,
    pitch: { ...DEFAULT_PLUGINS.pitch, ...value?.pitch },
  };
}
export function snapMidi(
  note: number,
  root: number,
  scale: StockPlugins["pitch"]["scale"],
) {
  const notes =
    scale === "major"
      ? [0, 2, 4, 5, 7, 9, 11]
      : scale === "minor"
        ? [0, 2, 3, 5, 7, 8, 10]
        : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  let best = Math.round(note),
    distance = Infinity;
  for (let n = Math.floor(note) - 12; n <= Math.ceil(note) + 12; n++)
    if (
      notes.includes((((n - root) % 12) + 12) % 12) &&
      Math.abs(n - note) < distance
    ) {
      best = n;
      distance = Math.abs(n - note);
    }
  return best;
}
export function detectPitch(samples: Float32Array, rate: number, start = 0) {
  const step = Math.max(1, Math.floor(rate / 8000)),
    sr = rate / step,
    n = Math.min(
      Math.floor(0.045 * sr),
      Math.floor((samples.length - start) / step),
    );
  if (n < 100) return 0;
  const x = new Float64Array(n);
  let mean = 0,
    energy = 0;
  for (let i = 0; i < n; i++) {
    x[i] = samples[start + i * step];
    mean += x[i];
  }
  mean /= n;
  for (let i = 0; i < n; i++) {
    x[i] -= mean;
    energy += x[i] * x[i];
  }
  if (Math.sqrt(energy / n) < 0.0005) return 0;
  const min = Math.max(2, Math.floor(sr / 1000)),
    max = Math.min(Math.ceil(sr / 70), Math.floor(n / 2)),
    diff = new Float64Array(max + 1);
  let total = 0;
  for (let lag = 1; lag <= max; lag++) {
    let sum = 0;
    for (let i = 0; i < n - max; i++) {
      const d = x[i] - x[i + lag];
      sum += d * d;
    }
    total += sum;
    diff[lag] = total ? (sum * lag) / total : 1;
  }
  for (let lag = min; lag < max - 1; lag++)
    if (diff[lag] < 0.16) {
      while (lag + 1 < max && diff[lag + 1] < diff[lag]) lag++;
      const a = diff[lag - 1],
        b = diff[lag],
        c = diff[lag + 1],
        den = a - 2 * b + c;
      const refined =
        lag + (den ? Math.max(-0.5, Math.min(0.5, (a - c) / (2 * den))) : 0);
      return sr / refined;
    }
  return 0;
}
const yieldUI = () => new Promise<void>((r) => setTimeout(r, 0));
async function colorAudio(
  out: Float32Array<ArrayBuffer>[],
  rate: number,
  p: StockPlugins,
) {
  const chorus = p.chorus ?? 0,
    tremolo = p.tremolo ?? 0,
    crush = p.crush ?? 0;
  if (!chorus && !tremolo && !crush) return out;
  for (let c = 0; c < out.length; c++) {
    const dry = out[c].slice();
    const steps = Math.pow(2, 16 - crush * 12);
    for (let i = 0; i < dry.length; i++) {
      const delay =
        rate *
        (0.018 +
          0.005 * Math.sin((2 * Math.PI * 0.8 * i) / rate + (c * Math.PI) / 2));
      const pos = i - delay,
        j = Math.floor(pos),
        frac = pos - j;
      const wet = j >= 0 ? dry[j] * (1 - frac) + (dry[j + 1] ?? 0) * frac : 0;
      let v = dry[i] * (1 - chorus * 0.5) + wet * chorus * 0.5;
      v *= 1 - tremolo * (0.5 - 0.5 * Math.cos((2 * Math.PI * 5 * i) / rate));
      out[c][i] = crush
        ? v * (1 - crush) + (Math.round(v * steps) / steps) * crush
        : v;
      if (i > 0 && i % 131072 === 0) await yieldUI();
    }
  }
  return out;
}
export async function processStock(
  input: readonly Float32Array[],
  rate: number,
  settings: StockPlugins,
) {
  const p = stockPlugins(settings),
    out = input.map((c) => c.slice());
  if (p.bypass) return out;
  const length = out[0]?.length ?? 0;
  if (p.gateDb !== 0 || p.deEss > 0) {
    const low = out.map(() => 0),
      threshold = Math.pow(10, p.gateDb / 20),
      gateRelease = Math.exp(-1 / (rate * 0.07)),
      gateAttack = Math.exp(-1 / (rate * 0.003)),
      essThreshold = Math.pow(10, (-18 - 20 * p.deEss) / 20),
      essRelease = Math.exp(-1 / (rate * 0.05)),
      filter = Math.exp((-2 * Math.PI * 4500) / rate);
    let env = 0,
      gate = 1,
      essEnv = 0,
      essGain = 1;
    for (let i = 0; i < length; i++) {
      let peak = 0,
        hf = 0;
      for (let c = 0; c < out.length; c++) {
        const v = out[c][i];
        peak = Math.max(peak, Math.abs(v));
        low[c] = (1 - filter) * v + filter * low[c];
        hf = Math.max(hf, Math.abs(v - low[c]));
      }
      env = Math.max(peak, env * gateRelease);
      const target = p.gateDb === 0 || env >= threshold ? 1 : 0;
      gate =
        target + (gate - target) * (target > gate ? gateAttack : gateRelease);
      essEnv = Math.max(hf, essEnv * essRelease);
      const desired =
        p.deEss === 0 || essEnv <= essThreshold
          ? 1
          : Math.max(0.15, Math.pow(essThreshold / essEnv, 0.75));
      essGain =
        desired +
        (essGain - desired) * (desired < essGain ? gateAttack : essRelease);
      for (let c = 0; c < out.length; c++)
        out[c][i] = (low[c] + (out[c][i] - low[c]) * essGain) * gate;
      if (i > 0 && i % 131072 === 0) await yieldUI();
    }
  }
  if (!p.pitch.enabled || p.pitch.strength === 0 || length < rate * 0.08)
    return colorAudio(out, rate, p);
  let reference = out[0],
    bestEnergy = -1;
  for (const c of out) {
    let e = 0;
    for (let i = 0; i < c.length; i += 32) e += c[i] * c[i];
    if (e > bestEnergy) {
      bestEnergy = e;
      reference = c;
    }
  }
  const hop = Math.round(rate * 0.02),
    periods: number[] = [],
    targets: number[] = [];
  let smoothed: number | undefined;
  for (let center = 0; center < length; center += hop) {
    const start = Math.max(
        0,
        Math.min(
          length - Math.ceil(rate * 0.045),
          center - Math.floor(rate * 0.0225),
        ),
      ),
      freq = detectPitch(reference, rate, start);
    if (freq) {
      const midi = 69 + 12 * Math.log2(freq / 440),
        desired = snapMidi(midi, p.pitch.root, p.pitch.scale);
      smoothed =
        smoothed === undefined
          ? desired
          : smoothed +
            (desired - smoothed) *
              (p.pitch.retune === 0 ? 1 : 1 - Math.exp(-20 / p.pitch.retune));
      periods.push(rate / freq);
      targets.push(
        rate /
          (440 *
            Math.pow(
              2,
              (midi + (smoothed - midi) * p.pitch.strength - 69) / 12,
            )),
      );
    } else {
      periods.push(0);
      targets.push(0);
      smoothed = undefined;
    }
    if (periods.length % 32 === 0) await yieldUI();
  }
  const sums = out.map(() => new Float32Array(length)),
    weights = new Float32Array(length);
  for (let center = 0; center < length;) {
    const frame = Math.min(periods.length - 1, Math.floor(center / hop)),
      period = periods[frame];
    if (!period) {
      center += hop;
      continue;
    }
    let source = Math.round(center),
      peak = -Infinity;
    for (
      let i = Math.max(0, Math.round(center - period * 0.55));
      i < Math.min(length, center + period * 0.55);
      i++
    )
      if (reference[i] > peak) {
        peak = reference[i];
        source = i;
      }
    const radius = Math.ceil(period);
    for (let d = -radius; d <= radius; d++) {
      const dst = Math.round(center) + d,
        src = source + d;
      if (dst < 0 || dst >= length || src < 0 || src >= length) continue;
      const w = 0.5 + 0.5 * Math.cos((Math.PI * d) / radius);
      weights[dst] += w;
      for (let c = 0; c < out.length; c++) sums[c][dst] += out[c][src] * w;
    }
    center += targets[frame];
    if (Math.floor(center) % 131072 < targets[frame]) await yieldUI();
  }
  let blend = 0;
  const transition = 1 - Math.exp(-1 / (rate * 0.003));
  for (let i = 0; i < length; i++) {
    const frame = Math.min(periods.length - 1, Math.floor(i / hop));
    blend += ((periods[frame] ? 1 : 0) - blend) * transition;
    const mix = blend * Math.min(1, weights[i] / 0.25);
    if (weights[i] > 0.0001)
      for (let c = 0; c < out.length; c++)
        out[c][i] = out[c][i] * (1 - mix) + (sums[c][i] / weights[i]) * mix;
  }
  return colorAudio(out, rate, p);
}
