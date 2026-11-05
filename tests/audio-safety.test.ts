import { test } from "node:test";
import assert from "node:assert/strict";
import { safeOutputSample } from "../src/lib/audio-safety";
import { normalizedTrackClips } from "../src/lib/track-normalize";
import { newTrack } from "../src/lib/model";
test("output protection preserves normal levels and rounds overload peaks safely", () => {
  for (const n of [-0.8, -0.1, 0, 0.1, 0.8])
    assert.equal(safeOutputSample(n), n);
  for (const n of [-100, -2, -1, 1, 2, 100])
    assert.ok(Math.abs(safeOutputSample(n)) <= 0.98);
  assert.ok(
    Math.abs(safeOutputSample(0.90001) - safeOutputSample(0.89999)) < 0.00003,
  );
});
test("beat normalization respects source trims, is repeatable and leaves source and vocals unchanged", () => {
  const b = newTrack("Beat"),
    v = newTrack("Vocal"),
    samples = new Float32Array([1, 0.25, -0.25, 1]);
  b.role = "beat";
  b.clips = [
    {
      id: crypto.randomUUID(),
      assetId: "asset",
      start: 0,
      offset: 1,
      duration: 2,
    },
  ];
  const raw = samples.slice(),
    before = JSON.stringify(v),
    buffers = new Map([
      [
        "asset",
        {
          numberOfChannels: 1,
          sampleRate: 1,
          getChannelData: () => samples,
        } as unknown as AudioBuffer,
      ],
    ]);
  const clips = normalizedTrackClips(b, buffers);
  assert.ok(Math.abs(clips[0].level! * 0.25 - Math.pow(10, -1 / 20)) < 1e-6);
  assert.deepEqual(normalizedTrackClips({ ...b, clips }, buffers), clips);
  assert.equal(b.clips[0].level, undefined);
  assert.deepEqual(samples, raw);
  assert.equal(JSON.stringify(v), before);
  assert.throws(() => normalizedTrackClips(b, new Map()), /missing/);
});
