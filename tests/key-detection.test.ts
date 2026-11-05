import { test } from "node:test";
import assert from "node:assert/strict";
import { detectKey, rankKeys } from "../src/lib/key-detection";
const rate = 22050;
function sequence(root: number, minor = false) {
  const notes = minor
    ? [0, 0, 0, 3, 7, 0, 2, 3, 5, 7, 8, 10, 0, 0]
    : [0, 0, 0, 4, 7, 0, 2, 4, 5, 7, 9, 11, 0, 0];
  const out = new Float32Array((rate * notes.length) / 2);
  for (let i = 0; i < out.length; i++) {
    const n = notes[Math.floor(i / (rate / 2))],
      hz = 440 * 2 ** ((48 + root + n - 69) / 12),
      t = i / rate;
    out[i] =
      0.3 * Math.sin(2 * Math.PI * hz * t) +
      0.06 * Math.sin(4 * Math.PI * hz * t);
  }
  return out;
}
test("key analysis recognizes a C major phrase and its transpositions without changing source", async () => {
  for (const root of [0, 2, 7]) {
    const x = sequence(root),
      copy = x.slice();
    const k = await detectKey([x], rate);
    assert.equal(k.candidates[0].root, root, JSON.stringify(k.candidates));
    assert.equal(k.candidates[0].scale, "major");
    assert.deepEqual(x, copy);
  }
});
test("minor phrases and a silent stereo channel are handled", async () => {
  const x = sequence(9, true);
  const k = await detectKey([new Float32Array(x.length), x], rate);
  assert.equal(k.candidates[0].root, 9, JSON.stringify(k.candidates));
  assert.equal(k.candidates[0].scale, "minor");
});
test("silence and a single tone do not invent a song key", async () => {
  await assert.rejects(detectKey([new Float32Array(rate * 2)], rate), /tonal/);
  const tone = Float32Array.from(
    { length: rate * 2 },
    (_, i) => 0.3 * Math.sin((2 * Math.PI * 440 * i) / rate),
  );
  await assert.rejects(detectKey([tone], rate), /tonal/);
});
test("analysis respects clip trim and ranks ambiguous material", async () => {
  const c = sequence(0),
    d = sequence(2),
    both = new Float32Array(c.length + d.length);
  both.set(c);
  both.set(d, c.length);
  const k = await detectKey([both], rate, c.length / rate, d.length / rate);
  assert.equal(k.candidates[0].root, 2);
  assert.equal(rankKeys(Array(12).fill(1)).length, 0);
});
test("polyphonic chord progression identifies its major key", async () => {
  const chords = [
      [48, 52, 55],
      [53, 57, 60],
      [55, 59, 62],
      [48, 52, 55],
    ],
    out = new Float32Array(rate * 8);
  for (let i = 0; i < out.length; i++)
    out[i] = chords[Math.floor(i / (rate * 2))].reduce(
      (sum, m) =>
        sum +
        0.12 * Math.sin((2 * Math.PI * 440 * 2 ** ((m - 69) / 12) * i) / rate),
      0,
    );
  const k = await detectKey([out], rate);
  assert.equal(k.candidates[0].root, 0);
  assert.equal(k.candidates[0].scale, "major");
});
