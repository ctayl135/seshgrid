/** Transparent below -0.9 dBFS; rounded peaks provide output headroom. */
export function safeOutputSample(x: number) {
  if (!Number.isFinite(x)) return 0;
  const a = Math.abs(x);
  return a <= 0.9
    ? x
    : Math.sign(x) * (0.9 + 0.08 * Math.tanh((a - 0.9) / 0.08));
}
let curve: Float32Array<ArrayBuffer> | undefined;
export function protectedOutput(
  ctx: AudioContext | OfflineAudioContext,
  destination: AudioNode,
) {
  const input = ctx.createGain(),
    shape = ctx.createWaveShaper();
  input.gain.value = 1 / 8;
  curve ??= Float32Array.from({ length: 65537 }, (_, i) =>
    safeOutputSample(((i / 65536) * 2 - 1) * 8),
  );
  shape.curve = curve;
  shape.oversample = "none";
  input.connect(shape).connect(destination);
  return { input, nodes: [input, shape] };
}
