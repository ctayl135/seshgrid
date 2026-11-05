import { test } from "node:test";
import assert from "node:assert/strict";
import { MicrophoneCapture } from "../src/lib/capture";
test("cancelling while permission is pending stops late microphone streams", async () => {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window"),
    oldNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  let deliver!: (stream: MediaStream) => void,
    stopped = 0,
    loaded = false;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { AudioWorkletNode: class {} },
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia: () =>
          new Promise<MediaStream>((r) => {
            deliver = r;
          }),
      },
    },
  });
  try {
    const ctx = {
      removeEventListener() {},
      audioWorklet: {
        async addModule() {
          loaded = true;
        },
      },
    } as unknown as AudioContext;
    const capture = new MicrophoneCapture(ctx),
      pending = capture.prepare(() => {});
    capture.dispose();
    const track = {
      stop() {
        stopped++;
      },
    };
    deliver({ getTracks: () => [track] } as unknown as MediaStream);
    await assert.rejects(pending, /cancelled/);
    assert.ok(stopped >= 1);
    assert.equal(loaded, false);
  } finally {
    if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (oldNavigator)
      Object.defineProperty(globalThis, "navigator", oldNavigator);
    else Reflect.deleteProperty(globalThis, "navigator");
  }
});
