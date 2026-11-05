import { test } from "node:test";
import assert from "node:assert/strict";
import {
  vocalRecordingLevel,
  voiceNote,
  microphoneConstraints,
} from "../src/lib/voice-input";
import {
  detectPitch,
  processStock,
  stockPlugins,
} from "../src/lib/stock-plugins";
test("level assist lifts quiet takes, caps gain and preserves source", () => {
  const x = new Float32Array([0.01, -0.01]),
    copy = x.slice(),
    r = vocalRecordingLevel(x);
  assert.ok(r.level > 30 && r.level <= 32);
  assert.ok(r.level * r.peak < 0.502);
  assert.deepEqual(x, copy);
  assert.equal(vocalRecordingLevel(x, false).level, 1);
  assert.equal(vocalRecordingLevel(new Float32Array([0.0001])).level, 1);
  assert.equal(vocalRecordingLevel(new Float32Array(10)).level, 1);
  assert.ok(vocalRecordingLevel(new Float32Array([0.9])).level < 1);
});
test("voice input requests mono and optional automatic gain without speech filtering", () => {
  const c = microphoneConstraints("headphones").audio as MediaTrackConstraints;
  assert.deepEqual(c.deviceId, { exact: "headphones" });
  assert.deepEqual(c.channelCount, { ideal: 1 });
  assert.equal(c.autoGainControl, true);
  assert.equal(c.noiseSuppression, false);
  assert.equal(c.echoCancellation, false);
  assert.equal(
    (microphoneConstraints("", false).audio as MediaTrackConstraints)
      .autoGainControl,
    false,
  );
});
test("live voice notes report pitch and cents; quiet singing can still tune", async () => {
  assert.deepEqual(voiceNote(440), {
    midi: 69,
    pitchClass: 9,
    octave: 4,
    cents: 0,
  });
  assert.equal(voiceNote(0), null);
  const rate = 44100,
    x = Float32Array.from(
      { length: rate },
      (_, i) => 0.002 * Math.sin((2 * Math.PI * 455 * i) / rate),
    );
  assert.ok(Math.abs(detectPitch(x, rate) - 455) < 4);
  const p = stockPlugins();
  p.pitch = { enabled: true, root: 0, scale: "major", strength: 1, retune: 0 };
  const out = (await processStock([x], rate, p))[0];
  assert.ok(Math.abs(detectPitch(out, rate, rate / 2) - 440) < 4);
});
