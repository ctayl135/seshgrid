import { test } from "node:test";
import assert from "node:assert/strict";
import { motionValue, scheduleMotion } from "../src/lib/volume-motion";
import { newProject, newTrack, validateProject } from "../src/lib/model";
import { packSession, unpackSession } from "../src/lib/portable";
const motion = () => ({
  id: crypto.randomUUID(),
  start: 2,
  duration: 4,
  points: [
    { time: 0, value: 0 },
    { time: 4, value: 1 },
  ],
});
test("Volume Motion interpolates, returns unity outside and resumes correctly when seeking", () => {
  const m = motion();
  assert.equal(motionValue(m, 1), 1);
  assert.equal(motionValue(m, 2), 0);
  assert.equal(motionValue(m, 4), 0.5);
  assert.equal(motionValue(m, 6), 1);
  const events: any[] = [];
  const param = {
    setValueAtTime: (...a: any[]) => events.push(["set", ...a]),
    linearRampToValueAtTime: (...a: any[]) => events.push(["ramp", ...a]),
  } as unknown as AudioParam;
  scheduleMotion(param, m, 4, 10);
  assert.deepEqual(events[0], ["set", 0.5, 10]);
  assert.deepEqual(events[1], ["ramp", 1, 12]);
  events.length = 0;
  scheduleMotion(param, m, 0, 0);
  assert.ok(!events.some((e) => e[0] === "ramp" && e[2] === 2));
});
test("Volume Motion persists and rejects unsafe or unordered curve points", async () => {
  const p = newProject(),
    t = newTrack("Voice");
  t.volumeMotion = motion();
  p.tracks = [t];
  validateProject(p);
  assert.deepEqual(
    (await unpackSession(packSession({ project: p, assets: [] }))).project,
    p,
  );
  t.volumeMotion.points[1].value = 2;
  assert.throws(() => validateProject(p));
  t.volumeMotion.points[1].value = 1;
  t.volumeMotion.points[1].time = 0;
  assert.throws(() => validateProject(p));
});
