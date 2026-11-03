import { test } from "node:test";
import assert from "node:assert/strict";
import { newProject, newTrack, validateProject } from "../src/lib/model";
import {
  VOCAL_PRESETS,
  applyVocalPreset,
  matchingPreset,
  resetVocalEffects,
  trackEffects,
  DRY_EFFECTS,
  effectTail,
} from "../src/lib/presets";
import { packSession, unpackSession } from "../src/lib/portable";
test("all eight underground presets validate and preserve level, pan and source edits", () => {
  const t = newTrack("Lead");
  t.gain = 0.37;
  t.pan = -0.4;
  t.clips = [
    {
      id: crypto.randomUUID(),
      assetId: crypto.randomUUID(),
      start: 2,
      offset: 0.2,
      duration: 1,
    },
  ];
  assert.equal(VOCAL_PRESETS.length, 8);
  assert.equal(VOCAL_PRESETS.filter((p) => p.category === "Adlibs").length, 4);
  for (const preset of VOCAL_PRESETS) {
    const applied = applyVocalPreset(t, preset.id),
      p = newProject();
    p.tracks = [applied];
    assert.equal(validateProject(p), p);
    assert.equal(applied.gain, 0.37);
    assert.equal(applied.pan, -0.4);
    assert.equal(applied.clips, t.clips);
    assert.equal(matchingPreset(applied)?.id, preset.id);
    assert.notEqual(applied.fx, preset.fx);
  }
  assert.equal(t.fx, undefined);
});
test("old sessions remain dry and Reset FX restores bypass without moving or unmuting tracks", () => {
  const t = newTrack("Old take");
  t.solo = true;
  t.mute = true;
  t.gain = 0.4;
  t.pan = 0.5;
  assert.deepEqual(trackEffects(t), DRY_EFFECTS);
  const reset = resetVocalEffects(applyVocalPreset(t, "rage-cut"));
  assert.deepEqual(trackEffects(reset), DRY_EFFECTS);
  assert.equal(reset.gain, 0.4);
  assert.equal(reset.pan, 0.5);
  assert.equal(reset.mute, true);
  assert.equal(reset.solo, true);
  assert.equal(reset.reverb, 0);
});
test("presets persist in portable projects and reject unsafe feedback/non-finite controls", async () => {
  const p = newProject();
  p.tracks = [applyVocalPreset(newTrack("Adlib"), "ping-pong")];
  const restored = await unpackSession(packSession({ project: p, assets: [] }));
  assert.deepEqual(restored.project, p);
  assert.equal(matchingPreset(restored.project.tracks[0])?.id, "ping-pong");
  p.tracks[0].fx!.feedback = 0.99;
  assert.throws(() => validateProject(p), /effects/);
  p.tracks[0].fx!.feedback = 0.4;
  p.tracks[0].fx!.drive = NaN;
  assert.throws(() => validateProject(p), /effects/);
});
test("echo tails extend export beyond legacy reverb tail without unbounded renders", () => {
  assert.equal(effectTail([newTrack("Dry")]), 1.5);
  const t = applyVocalPreset(newTrack("Adlib"), "ping-pong");
  assert.ok(effectTail([t]) > 1.5);
  t.fx!.delayTime = 0.75;
  t.fx!.feedback = 0.65;
  assert.ok(effectTail([t]) <= 15);
  assert.throws(() => applyVocalPreset(t, "missing"));
});
