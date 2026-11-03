import { test } from "node:test";
import assert from "node:assert/strict";
import { samplePeak, peakDb } from "../src/lib/meter";
test("peak metering measures negative samples and preserves clipping above unity", () => {
  assert.equal(samplePeak(new Float32Array([0, -1.5, 0.25])), 1.5);
  assert.equal(
    samplePeak(new Float32Array([NaN, Infinity, -Infinity, 0.5])),
    0.5,
  );
  assert.equal(peakDb(1), 0);
  assert.ok(Math.abs(peakDb(0.5) + 6.0206) < 0.0001);
  assert.equal(peakDb(0), -60);
  assert.equal(samplePeak(new Float32Array()), 0);
});
