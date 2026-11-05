import { samplePeak } from "./meter";
/** Non-destructive take gain; never boosts near-silence or pushes peaks above -6 dBFS. */
export function vocalRecordingLevel(samples: Float32Array, assist = true) {
  const peak = samplePeak(samples);
  if (!assist || peak < 0.001) return { level: 1, peak, quiet: peak < 0.01 };
  return {
    level: Math.min(32, Math.pow(10, -6 / 20) / peak),
    peak,
    quiet: peak < 0.01,
  };
}
export function microphoneConstraints(
  deviceId = "",
  voiceAssist = true,
): MediaStreamConstraints {
  return {
    audio: {
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      channelCount: { ideal: 1 },
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: voiceAssist,
    },
    video: false,
  };
}
export function voiceNote(hz: number) {
  if (!Number.isFinite(hz) || hz <= 0) return null;
  const midi = 69 + 12 * Math.log2(hz / 440),
    note = Math.round(midi);
  return {
    midi: note,
    pitchClass: ((note % 12) + 12) % 12,
    octave: Math.floor(note / 12) - 1,
    cents: Math.round((midi - note) * 100),
  };
}
