import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizationLevel } from "../src/lib/normalize";
import {
  newProject,
  newTrack,
  validateProject,
  splitClip,
} from "../src/lib/model";
import { packSession, unpackSession } from "../src/lib/portable";
import { profileValues } from "../src/lib/social";
test("normalization uses the trimmed region and loudest channel without modifying source", () => {
  const left = new Float32Array([1, 0.25, -0.25, 0]),
    right = new Float32Array([1, 0.5, -0.5, 0]);
  const before = left.slice();
  const level = normalizationLevel([left, right], 1, {
    offset: 1,
    duration: 2,
  });
  assert.ok(Math.abs(level * 0.5 - Math.pow(10, -1 / 20)) < 1e-7);
  assert.deepEqual(left, before);
  assert.equal(
    normalizationLevel([new Float32Array([0.0001])], 1, {
      offset: 0,
      duration: 1,
    }),
    32,
  );
  assert.throws(
    () =>
      normalizationLevel([new Float32Array(5)], 1, { offset: 0, duration: 5 }),
    /silent/,
  );
});
test("clip levels and beat roles persist and split safely in portable projects", async () => {
  const p = newProject(),
    t = newTrack("Beat");
  t.role = "beat";
  t.clips = [
    {
      id: crypto.randomUUID(),
      assetId: crypto.randomUUID(),
      start: 0,
      offset: 0,
      duration: 2,
      level: 1.7,
    },
  ];
  p.tracks = [t];
  const backup = await unpackSession(
    packSession({
      project: p,
      assets: [
        { id: t.clips[0].assetId, blob: new Blob([new Uint8Array([1, 2, 3])]) },
      ],
    }),
  );
  assert.deepEqual(backup.project, p);
  assert.ok(splitClip(t.clips[0], 1).every((c) => c.level === 1.7));
  t.clips[0].level = Infinity;
  assert.throws(() => validateProject(p));
  t.clips[0].level = 33;
  assert.throws(() => validateProject(p));
});
test("artist profile fields are bounded and trimmed", () => {
  assert.deepEqual(profileValues("  New Age Music  ", "bio", "Rage"), {
    display_name: "New Age Music",
    bio: "bio",
    genre: "Rage",
  });
  assert.throws(() => profileValues(" ", "", "Rage"));
  assert.throws(() => profileValues("Artist", "x".repeat(501), "Rage"));
  assert.throws(() => profileValues("Artist", "", "Unknown"));
});
