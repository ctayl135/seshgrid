import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { newProject, newTrack } from "../src/lib/model";
import { applyVocalPreset } from "../src/lib/presets";
import {
  saveRecovery,
  loadRecovery,
  listRecovery,
  deleteRecovery,
} from "../src/lib/recovery";
import { saveLocal, listLocal } from "../src/lib/storage";
function fixture() {
  const p = newProject(),
    t = applyVocalPreset(newTrack("Recoverable take"), "ghost-whisper"),
    id = crypto.randomUUID();
  t.clips = [
    { id: crypto.randomUUID(), assetId: id, start: 1, offset: 0, duration: 2 },
  ];
  p.tracks = [t];
  return {
    project: p,
    assets: [
      {
        id,
        blob: new Blob([new Uint8Array([0, 1, 255, 9])], { type: "audio/wav" }),
      },
    ],
  };
}
test("recovery preserves source blobs and unsaved edits without replacing a manual save", async () => {
  const id = crypto.randomUUID(),
    session = fixture();
  await saveLocal(session);
  const edited = {
    ...session,
    project: { ...session.project, name: "Unsaved latest take" },
  };
  await saveRecovery(id, edited);
  const restored = await loadRecovery(id);
  assert.deepEqual(restored.project, edited.project);
  assert.deepEqual(
    new Uint8Array(await restored.assets[0].blob.arrayBuffer()),
    new Uint8Array([0, 1, 255, 9]),
  );
  const manual = (await listLocal()).find(
    (s) => s.project.id === session.project.id,
  )!;
  assert.notEqual(manual.project.name, edited.project.name);
  assert.ok(
    (await listRecovery()).some(
      (d) => d.id === id && d.name === edited.project.name,
    ),
  );
  await deleteRecovery(id);
  await assert.rejects(loadRecovery(id), /not found/);
});
test("independent tabs keep independent drafts and clearing one leaves the other recoverable", async () => {
  const a = crypto.randomUUID(),
    b = crypto.randomUUID(),
    session = fixture();
  await saveRecovery(a, session);
  await saveRecovery(b, {
    ...session,
    project: { ...session.project, name: "Other tab" },
  });
  await deleteRecovery(a);
  assert.equal((await loadRecovery(b)).project.name, "Other tab");
  await deleteRecovery(b);
});
test("failed recovery does not overwrite the last good checkpoint and removed audio is not restored", async () => {
  const id = crypto.randomUUID(),
    session = fixture();
  await saveRecovery(id, session);
  await assert.rejects(saveRecovery(id, { ...session, assets: [] }), /missing/);
  assert.equal((await loadRecovery(id)).assets.length, 1);
  await saveRecovery(id, {
    project: { ...session.project, tracks: [] },
    assets: [],
  });
  const restored = await loadRecovery(id);
  assert.equal(restored.project.tracks.length, 0);
  assert.equal(restored.assets.length, 0);
  await deleteRecovery(id);
});
test("switching projects in one tab rewrites a reused asset identity safely", async () => {
  const id = crypto.randomUUID(),
    first = fixture();
  await saveRecovery(id, first);
  const second = {
    project: { ...first.project, id: crypto.randomUUID() },
    assets: [{ id: first.assets[0].id, blob: new Blob(["replacement"]) }],
  };
  await saveRecovery(id, second);
  assert.equal(
    await (await loadRecovery(id)).assets[0].blob.text(),
    "replacement",
  );
  await deleteRecovery(id);
});
