import { test } from "node:test";
import assert from "node:assert/strict";
import { detectTempo } from "../src/lib/tempo-detection";
import { newProject, newTrack, validateProject } from "../src/lib/model";
import { packSession, unpackSession } from "../src/lib/portable";
const rate = 22050;
function beat(bpm: number, seconds = 20, rate = 22050) {
  const out = new Float32Array(rate * seconds);
  for (let t = 0; t < seconds; t += 60 / bpm) {
    const start = Math.round(t * rate);
    for (let i = 0; i < rate * 0.08 && start + i < out.length; i++)
      out[start + i] +=
        0.6 *
        Math.exp(-i / (rate * 0.015)) *
        Math.sin((2 * Math.PI * 90 * i) / rate);
  }
  return out;
}
test("tempo estimation recognizes steady beats across slow and fast tempos", async () => {
  for (const bpm of [60, 80, 90, 100, 120, 140, 170, 200]) {
    const x = beat(bpm),
      copy = x.slice(),
      found = await detectTempo([x], rate);
    assert.ok(
      found && Math.abs(found.bpm - bpm) < 1,
      `${bpm} -> ${JSON.stringify(found)}`,
    );
    assert.deepEqual(x, copy);
  }
});
test("silence, short clips and sustained notes do not set a tempo", async () => {
  assert.equal(await detectTempo([new Float32Array(rate * 10)], rate), null);
  assert.equal(await detectTempo([beat(120, 2)], rate), null);
  const tone = Float32Array.from(
    { length: rate * 10 },
    (_, i) => 0.2 * Math.sin((2 * Math.PI * 440 * i) / rate),
  );
  assert.equal(await detectTempo([tone], rate), null);
});
test("tempo analysis handles stereo silent channels and leading silence", async () => {
  const x = new Float32Array(rate * 30);
  x.set(beat(130, 20), rate * 10);
  const found = await detectTempo([new Float32Array(x.length), x], rate);
  assert.ok(found && Math.abs(found.bpm - 130) < 1, JSON.stringify(found));
});
test("detected BPM and manual session BPM persist independently", async () => {
  const p = newProject(),
    t = newTrack("Beat");
  t.role = "beat";
  t.detectedBpm = 140;
  p.bpm = 70;
  p.tracks = [t];
  const reopened = await unpackSession(packSession({ project: p, assets: [] }));
  assert.equal(reopened.project.bpm, 70);
  assert.equal(reopened.project.tracks[0].detectedBpm, 140);
  t.detectedBpm = NaN;
  assert.throws(() => validateProject(p));
});

test("tempo detection remains consistent at browser decode sample rates", async () => {
  for (const rate of [44100, 48000])
    for (const bpm of [80, 90, 120, 140, 170]) {
      const found = await detectTempo([beat(bpm, 20, rate)], rate);
      assert.ok(
        found && Math.abs(found.bpm - bpm) < 1,
        JSON.stringify({ rate, bpm, found }),
      );
    }
});
