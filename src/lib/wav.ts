export function encodeWav(
  channels: Float32Array[],
  sampleRate: number,
): ArrayBuffer {
  const frames = channels[0]?.length ?? 0;
  if (!channels.length || channels.some((c) => c.length !== frames))
    throw new Error("Channel lengths differ");
  const buffer = new ArrayBuffer(44 + frames * channels.length * 2),
    view = new DataView(buffer);
  const str = (at: number, s: string) =>
    [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  str(0, "RIFF");
  view.setUint32(4, buffer.byteLength - 8, true);
  str(8, "WAVE");
  str(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels.length, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels.length * 2, true);
  view.setUint16(32, channels.length * 2, true);
  view.setUint16(34, 16, true);
  str(36, "data");
  view.setUint32(40, buffer.byteLength - 44, true);
  for (let f = 0; f < frames; f++)
    for (let c = 0; c < channels.length; c++) {
      const n = Math.max(-1, Math.min(1, channels[c][f]));
      view.setInt16(
        44 + (f * channels.length + c) * 2,
        Math.round(n * (n < 0 ? 32768 : 32767)),
        true,
      );
    }
  return buffer;
}
