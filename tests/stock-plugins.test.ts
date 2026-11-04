import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PLUGINS,
  processStock,
  detectPitch,
  snapMidi,
  stockPlugins,
} from "../src/lib/stock-plugins";
import {
  newTrack,
  addRecordingTake,
  activateTake,
  projectEnd,
  newProject,
  validateProject,
  splitClip,
} from "../src/lib/model";
const rate = 44100,
  tone = (hz: number, level = 0.2) =>
    Float32Array.from(
      { length: rate },
      (_, i) => level * Math.sin((2 * Math.PI * hz * i) / rate),
    );
test("Pitch Lock moves a detuned monophonic tone toward the selected scale without changing source duration", async () => {
  const input = tone(455),
    before = input.slice(),
    p = stockPlugins();
  p.pitch = { enabled: true, root: 0, scale: "major", strength: 1, retune: 0 };
  const output = (await processStock([input], rate, p))[0];
  const hz = detectPitch(output, rate, rate / 2);
  assert.ok(Math.abs(hz - 440) < 4, `Expected A4, got ${hz}`);
  assert.equal(output.length, input.length);
  assert.deepEqual(input, before);
  assert.ok(output.every(Number.isFinite));
});
test("plugin bypass and zero correction preserve samples; de-esser reduces high frequencies and gate reduces low noise", async () => {
  const input = tone(440);
  assert.deepEqual(
    (
      await processStock([input], rate, { ...DEFAULT_PLUGINS, bypass: true })
    )[0],
    input,
  );
  const zero = stockPlugins();
  zero.pitch.enabled = true;
  zero.pitch.strength = 0;
  assert.deepEqual((await processStock([input], rate, zero))[0], input);
  const clean = stockPlugins();
  clean.deEss = 1;
  const high = tone(8000, 0.5),
    low = tone(200, 0.1),
    h = (await processStock([high], rate, clean))[0],
    l = (await processStock([low], rate, clean))[0];
  const rms = (x: Float32Array) =>
    Math.sqrt(x.slice(4410).reduce((n, v) => n + v * v, 0) / (x.length - 4410));
  assert.ok(rms(h) < rms(high) * 0.6);
  assert.ok(Math.abs(rms(l) - rms(low)) < 0.001);
  clean.deEss = 0;
  clean.gateDb = -40;
  const noise = tone(180, 0.001),
    g = (await processStock([noise], rate, clean))[0];
  assert.ok(rms(g) < rms(noise) * 0.1);
  assert.equal(snapMidi(70, 0, "major"), 69);
});
test("retakes preserve original clips, switching takes selects all split segments, and muted clips do not extend the song", () => {
  let t = newTrack("Vocal");
  const c = {
    id: crypto.randomUUID(),
    assetId: crypto.randomUUID(),
    start: 0,
    offset: 0,
    duration: 2,
  };
  t = addRecordingTake(t, c);
  const first = t.clips[0];
  t = addRecordingTake(t, { ...c, id: crypto.randomUUID(), duration: 3 });
  assert.equal(t.clips[0].muted, true);
  assert.equal(t.clips[1].muted, false);
  t.clips = [...splitClip(t.clips[0], 1), t.clips[1]];
  t = activateTake(t, first.takeGroup!, first.takeId!);
  assert.ok(t.clips.slice(0, 2).every((c) => c.muted === false));
  assert.equal(t.clips[2].muted, true);
  const p = newProject();
  p.tracks = [t];
  assert.equal(projectEnd(p), 2);
  assert.equal(t.clips.length, 3);
  validateProject(p);
});

test("stereo pitch correction keeps opposite-phase channels and leaves unvoiced noise untouched", async () => {
  const left = tone(455),
    right = Float32Array.from(left, (v) => -v),
    p = stockPlugins();
  p.pitch = { enabled: true, root: 0, scale: "major", strength: 1, retune: 0 };
  const out = await processStock([left, right], rate, p);
  assert.ok(Math.abs(detectPitch(out[0], rate, 22050) - 440) < 4);
  assert.ok(out[0].every((v, i) => Math.abs(v + out[1][i]) < 0.000001));
  let seed = 123;
  const noise = Float32Array.from({ length: 4410 }, () => {
    seed = (seed * 16807) % 2147483647;
    return ((seed / 2147483647) * 2 - 1) * 0.1;
  });
  assert.deepEqual((await processStock([noise], rate, p))[0], noise);
});
import { packSession, unpackSession } from "../src/lib/portable";
test("stock settings and take identities round-trip and invalid plugin parameters are rejected", async () => {
  const p = newProject(),
    t = newTrack("Vocal");
  t.plugins = stockPlugins();
  t.plugins.pitch.enabled = true;
  t.plugins.pitch.scale = "minor";
  t.plugins.pitch.root = 9;
  t.plugins.deEss = 0.4;
  t.clips = [
    {
      id: crypto.randomUUID(),
      assetId: crypto.randomUUID(),
      start: 0,
      offset: 0,
      duration: 1,
      takeGroup: crypto.randomUUID(),
      takeId: crypto.randomUUID(),
      muted: false,
    },
  ];
  p.tracks = [t];
  const restored = await unpackSession(
    packSession({
      project: p,
      assets: [
        { id: t.clips[0].assetId, blob: new Blob([new Uint8Array([1, 2, 3])]) },
      ],
    }),
  );
  assert.deepEqual(restored.project, p);
  t.plugins.pitch.root = 12;
  assert.throws(() => validateProject(p));
  t.plugins.pitch.root = 0;
  t.plugins.deEss = NaN;
  assert.throws(() => validateProject(p));
});
