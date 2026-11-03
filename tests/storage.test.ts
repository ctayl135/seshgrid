import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { newProject, newTrack } from "../src/lib/model";
import { listLocal, saveLocal } from "../src/lib/storage";
import { applyVocalPreset } from "../src/lib/presets";
test("local saves commit audio and edits atomically and replace the same project", async () => {
  const project = newProject(),
    track = applyVocalPreset(newTrack("Lead"), "cloud-float"),
    id = crypto.randomUUID();
  track.clips = [
    { id: crypto.randomUUID(), assetId: id, start: 3, offset: 1, duration: 2 },
  ];
  project.tracks = [track];
  const bytes = new Uint8Array([1, 2, 255]);
  await saveLocal({
    project,
    assets: [{ id, blob: new Blob([bytes], { type: "audio/wav" }) }],
  });
  const sessions = await listLocal();
  const restored = sessions.find((s) => s.project.id === project.id)!;
  assert.deepEqual(restored.project, project);
  assert.deepEqual(
    new Uint8Array(await restored.assets[0].blob.arrayBuffer()),
    bytes,
  );
  project.name = "Updated lead";
  track.pan = -0.5;
  await saveLocal({ ...restored, project });
  const updated = (await listLocal()).filter(
    (s) => s.project.id === project.id,
  );
  assert.equal(updated.length, 1);
  assert.equal(updated[0].project.name, "Updated lead");
  assert.equal(updated[0].project.tracks[0].pan, -0.5);
});
