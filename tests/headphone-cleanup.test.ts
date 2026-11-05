import { test } from "node:test";
import assert from "node:assert/strict";
import { microphoneConstraints } from "../src/lib/voice-input";
test("headphone noise cleanup is optional and does not change device or gain choices", () => {
  const clean = microphoneConstraints("wired", true, true)
    .audio as MediaTrackConstraints;
  assert.equal(clean.noiseSuppression, true);
  assert.equal(clean.echoCancellation, false);
  assert.equal(clean.autoGainControl, true);
  assert.deepEqual(clean.deviceId, { exact: "wired" });
  assert.equal(
    (microphoneConstraints("wired", true, false).audio as MediaTrackConstraints)
      .noiseSuppression,
    false,
  );
});
