import { test } from "node:test";
import assert from "node:assert/strict";
import { TransportClicks } from "../src/lib/transport-clicks";
test("one-bar count-in schedules four beats before capture time and cancellation releases clicks", () => {
  const starts: number[] = [],
    disconnected: number[] = [];
  const context = {
    currentTime: 10,
    destination: {},
    createOscillator() {
      const o = {
        frequency: { value: 0 },
        connect(g: unknown) {
          return g;
        },
        onended: null,
        start(t: number) {
          starts.push(t);
        },
        stop() {},
        disconnect() {},
      };
      return o;
    },
    createGain() {
      return {
        gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {
          return {};
        },
        disconnect() {
          disconnected.push(1);
        },
      };
    },
  } as unknown as AudioContext;
  const clock = new TransportClicks(context);
  clock.start(12, 120, 0, 4, false);
  assert.deepEqual(starts, [10, 10.5, 11, 11.5]);
  clock.stop();
  assert.equal(disconnected.length, 4);
});
