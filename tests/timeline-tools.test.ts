import { test } from "node:test";
import assert from "node:assert/strict";
import { newProject, newTrack, validateProject } from "../src/lib/model";
import {
  snapTime,
  clipsInRange,
  moveClips,
  copyClips,
  pasteClips,
} from "../src/lib/timeline-tools";
const fixture = () => {
  const p = newProject(),
    t = newTrack("Voice");
  t.clips = [
    {
      id: crypto.randomUUID(),
      assetId: crypto.randomUUID(),
      start: 1,
      offset: 0.5,
      duration: 2,
      takeId: crypto.randomUUID(),
      takeGroup: crypto.randomUUID(),
    },
    {
      id: crypto.randomUUID(),
      assetId: crypto.randomUUID(),
      start: 4,
      offset: 0,
      duration: 1,
    },
  ];
  p.tracks = [t];
  return p;
};
test("range highlights overlap, work in reverse and exclude touching endpoints", () => {
  const p = fixture();
  assert.deepEqual(clipsInRange(p, 3, 1), [p.tracks[0].clips[0].id]);
  assert.equal(clipsInRange(p, 3, 4).length, 0);
  assert.equal(clipsInRange(p, 0, 6).length, 2);
});
test("group move clamps at zero while preserving spacing and source trims", () => {
  const p = fixture(),
    ids = p.tracks[0].clips.map((c) => c.id),
    m = moveClips(p, ids, -10);
  assert.deepEqual(
    m.tracks[0].clips.map((c) => c.start),
    [0, 3],
  );
  assert.equal(m.tracks[0].clips[0].offset, 0.5);
  assert.equal(p.tracks[0].clips[0].start, 1);
  validateProject(m);
});
test("copy and paste preserve source edits but get fresh clip and take identities", () => {
  const p = fixture(),
    copies = copyClips(
      p,
      p.tracks[0].clips.map((c) => c.id),
    ),
    m = pasteClips(p, copies, 8);
  assert.deepEqual(
    m.tracks[0].clips.slice(2).map((c) => c.start),
    [8, 11],
  );
  assert.equal(m.tracks[0].clips[2].offset, 0.5);
  assert.equal(m.tracks[0].clips[2].takeId, undefined);
  assert.notEqual(m.tracks[0].clips[0].id, m.tracks[0].clips[2].id);
  assert.equal(p.tracks[0].clips.length, 2);
  validateProject(m);
  assert.throws(() => pasteClips(p, copies, 14400));
});
test("snap uses tempo and subdivisions with off preserving fine positions", () => {
  assert.equal(snapTime(0.7, 120, 1), 0.5);
  assert.equal(snapTime(0.7, 120, 4), 0.75);
  assert.equal(snapTime(0.7, 120, 0), 0.7);
});
