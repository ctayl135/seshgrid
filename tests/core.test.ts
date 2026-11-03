import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeWav } from "../src/lib/wav";
import {
  audible,
  newProject,
  newTrack,
  projectEnd,
  splitClip,
  validateProject,
} from "../src/lib/model";
test("WAV writes stereo PCM, sample rate, interleaving and clipping correctly", () => {
  const wav = encodeWav(
      [new Float32Array([-2, 0.5]), new Float32Array([2, -0.5])],
      44100,
    ),
    view = new DataView(wav);
  assert.equal(new TextDecoder().decode(wav.slice(0, 4)), "RIFF");
  assert.equal(view.getUint32(24, true), 44100);
  assert.equal(view.getUint16(22, true), 2);
  assert.equal(view.getUint32(40, true), 8);
  assert.equal(view.getInt16(44, true), -32768);
  assert.equal(view.getInt16(46, true), 32767);
  assert.equal(view.getInt16(48, true), 16384);
  assert.equal(view.getInt16(50, true), -16384);
});
test("split preserves source range and timeline extent", () => {
  const c = {
    id: "a",
    assetId: crypto.randomUUID(),
    start: 4,
    offset: 2,
    duration: 10,
  };
  const halves = splitClip(c, 7);
  assert.equal(halves.length, 2);
  assert.equal(halves[0].duration, 3);
  assert.equal(halves[1].offset, 5);
  assert.equal(halves[1].duration, 7);
  assert.equal(halves[1].start, 7);
  assert.equal(splitClip(c, 4).length, 1);
});
test("solo respects mute and project extent includes moved clips", () => {
  const a = newTrack("Beat"),
    b = newTrack("Vocal");
  b.solo = true;
  assert.equal(audible(a, [a, b]), false);
  assert.equal(audible(b, [a, b]), true);
  b.mute = true;
  assert.equal(audible(b, [a, b]), false);
  const p = newProject();
  a.clips = [
    {
      id: "a",
      assetId: crypto.randomUUID(),
      start: 10,
      offset: 0,
      duration: 3,
    },
  ];
  p.tracks = [a, b];
  assert.equal(projectEnd(p), 13);
  assert.equal(validateProject(p), p);
});
test("reject malformed projects and unsafe cloud paths", () => {
  const p = newProject(),
    t = newTrack("test");
  t.clips = [
    { id: "a", assetId: "../other-user", start: 0, offset: 0, duration: 1 },
  ];
  p.tracks = [t];
  assert.throws(() => validateProject(p));
  t.clips = [];
  t.gain = NaN;
  assert.throws(() => validateProject(p));
});
