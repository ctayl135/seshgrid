import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
function processor() {
  let Constructor: new () => {
    port: { onmessage: (e: { data: unknown }) => void };
    process: (inputs: Float32Array[][]) => boolean;
  };
  const messages: { samples?: Float32Array; done?: boolean }[] = [];
  class Base {
    port = {
      onmessage: null,
      postMessage: (data: { samples?: Float32Array; done?: boolean }) =>
        messages.push(data),
    };
  }
  const context = vm.createContext({
    AudioWorkletProcessor: Base,
    currentFrame: 0,
    registerProcessor: (_: string, C: typeof Constructor) => {
      Constructor = C;
    },
  });
  vm.runInContext(readFileSync("public/recorder.js", "utf8"), context);
  return { recorder: new Constructor!(), messages, context };
}
test("capture starts at exact audio frame and flushes final partial chunk", () => {
  const { recorder, messages, context } = processor();
  const input = [new Float32Array(128).fill(0.25)];
  recorder.process([input]);
  assert.equal(messages.length, 0);
  recorder.port.onmessage({ data: { startFrame: 64 } });
  recorder.process([input]);
  context.currentFrame = 128;
  recorder.process([input]);
  recorder.port.onmessage({ data: "stop" });
  assert.equal(messages[0].samples!.length, 192);
  assert.ok(messages[0].samples!.every((x) => x === 0.25));
  assert.equal(messages[1].done, true);
  recorder.process([input]);
  assert.equal(messages.length, 2);
});
test("capture keeps the strongest microphone channel without dropping samples", () => {
  const { recorder, messages, context } = processor();
  recorder.port.onmessage({ data: { startFrame: 0 } });
  for (let i = 0; i < 33; i++) {
    context.currentFrame = i * 128;
    recorder.process([
      [new Float32Array(128).fill(0.75), new Float32Array(128).fill(0.25)],
    ]);
  }
  recorder.port.onmessage({ data: "stop" });
  assert.equal(messages[0].samples!.length, 4096);
  assert.equal(messages[1].samples!.length, 128);
  assert.ok(messages[0].samples!.every((x) => x === 0.75));
  assert.equal(messages[2].done, true);
});

test("headset silent and inverted channels do not attenuate or cancel vocals", () => {
  for (const second of [0, -0.25]) {
    const { recorder, messages } = processor();
    recorder.port.onmessage({ data: { startFrame: 0 } });
    recorder.process([
      [new Float32Array(128).fill(0.25), new Float32Array(128).fill(second)],
    ]);
    recorder.port.onmessage({ data: "stop" });
    assert.ok(messages[0].samples!.every((x) => x === 0.25));
  }
});
