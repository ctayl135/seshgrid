import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createHistory,
  recordHistory,
  undoHistory,
  redoHistory,
} from "../src/lib/history";
import { newProject, newTrack } from "../src/lib/model";
import { applyVocalPreset } from "../src/lib/presets";
test("undo and redo restore removed clips, presets and their original source references", () => {
  const original = newProject(),
    track = newTrack("Vocal");
  track.clips = [
    {
      id: crypto.randomUUID(),
      assetId: crypto.randomUUID(),
      start: 1,
      offset: 0.2,
      duration: 2,
    },
  ];
  original.tracks = [track];
  let h = createHistory(original);
  const effect = { ...original, tracks: [applyVocalPreset(track, "rage-cut")] };
  h = recordHistory(h, effect);
  h = recordHistory(h, { ...effect, tracks: [] });
  h = undoHistory(h);
  assert.equal(h.present, effect);
  assert.equal(h.present.tracks[0].clips[0].assetId, track.clips[0].assetId);
  h = undoHistory(h);
  assert.equal(h.present, original);
  h = redoHistory(h);
  assert.equal(h.present, effect);
  assert.equal(h.present.tracks[0].fx?.drive, 0.38);
});
test("rapid slider gestures coalesce but separate controls and preset choices stay separate", () => {
  let h = createHistory(0);
  h = recordHistory(h, 1, "volume", 100);
  h = recordHistory(h, 2, "volume", 200);
  h = recordHistory(h, 3, "pan", 250);
  assert.deepEqual(h.past, [0, 2]);
  h = undoHistory(h);
  assert.equal(h.present, 2);
  h = undoHistory(h);
  assert.equal(h.present, 0);
  let p = createHistory("dry");
  p = recordHistory(p, "rage", undefined, 100);
  p = recordHistory(p, "cloud", undefined, 110);
  assert.equal(p.past.length, 2);
});
test("editing after undo clears redo and long histories stay bounded", () => {
  let h = createHistory(0);
  for (let i = 1; i <= 100; i++) h = recordHistory(h, i);
  assert.equal(h.past.length, 60);
  h = undoHistory(h);
  assert.equal(h.future.length, 1);
  h = recordHistory(h, 101);
  assert.equal(h.future.length, 0);
  assert.equal(redoHistory(h), h);
  assert.equal(undoHistory(createHistory(0)).present, 0);
});
