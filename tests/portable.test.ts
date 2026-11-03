import { test } from "node:test";
import assert from "node:assert/strict";
import { newProject, newTrack } from "../src/lib/model";
import { packSession, unpackSession } from "../src/lib/portable";
test("project backup round trip preserves binary source and non-destructive edits", async () => {
  const project = newProject(),
    track = newTrack("Vocal"),
    id = crypto.randomUUID();
  track.clips = [
    {
      id: crypto.randomUUID(),
      assetId: id,
      start: 2,
      offset: 0.25,
      duration: 1,
    },
  ];
  track.reverb = 0.4;
  project.tracks = [track];
  const original = new Uint8Array([0, 255, 7, 99]);
  const file = packSession({
    project,
    assets: [{ id, blob: new Blob([original], { type: "audio/wav" }) }],
  });
  const restored = await unpackSession(file);
  assert.deepEqual(restored.project, project);
  assert.equal(restored.assets[0].blob.type, "audio/wav");
  assert.deepEqual(
    new Uint8Array(await restored.assets[0].blob.arrayBuffer()),
    original,
  );
});
test("reject truncated backup and missing audio references", async () => {
  const project = newProject(),
    track = newTrack("Beat");
  track.clips = [
    {
      id: crypto.randomUUID(),
      assetId: crypto.randomUUID(),
      start: 0,
      offset: 0,
      duration: 1,
    },
  ];
  project.tracks = [track];
  await assert.rejects(
    unpackSession(packSession({ project, assets: [] })),
    /missing/,
  );
  const file = packSession({ project: newProject(), assets: [] });
  await assert.rejects(unpackSession(file.slice(0, 15)));
});
