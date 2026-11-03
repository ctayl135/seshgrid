import { test } from "node:test";
import assert from "node:assert/strict";
import { PlaylistPlayer, type PlaylistItem } from "../src/lib/playlist";
const songs = [
  { id: "one", name: "First song" },
  { id: "two", name: "Second song" },
];
function fixture(
  prepare?: (item: PlaylistItem, current: () => boolean) => Promise<void>,
) {
  let ended = () => {},
    stopped = 0;
  const starts: number[] = [];
  const player = new PlaylistPlayer(
    {
      ready: async () => {},
      prepare: prepare ?? (async () => {}),
      play: async (from, done) => {
        starts.push(from);
        ended = done;
      },
      stop: () => {
        stopped++;
      },
      time: () => 2.5,
    },
    () => {},
  );
  player.replace(songs);
  return {
    player,
    starts,
    end: () => ended(),
    oldEnd: () => ended,
    stopped: () => stopped,
  };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
test("playlist advances exactly once after completion and finishes without looping", async () => {
  const f = fixture();
  await f.player.play();
  assert.equal(f.player.state.index, 0);
  const old = f.oldEnd();
  f.end();
  await tick();
  assert.equal(f.player.state.index, 1);
  old();
  await tick();
  assert.equal(f.starts.length, 2);
  f.end();
  assert.equal(f.player.state.status, "ended");
});
test("pause preserves position and stale end events cannot advance a paused or stopped playlist", async () => {
  const f = fixture();
  await f.player.play();
  const old = f.oldEnd();
  f.player.pause();
  old();
  assert.equal(f.player.state.status, "paused");
  await f.player.resume();
  assert.deepEqual(f.starts, [0, 2.5]);
  f.player.stop();
  f.end();
  assert.equal(f.player.state.status, "idle");
});
test("a late project load cannot start after skipping or closing projects", async () => {
  let release = () => {};
  const f = fixture(async (item) => {
    if (item.id === "one")
      await new Promise<void>((r) => {
        release = r;
      });
  });
  const pending = f.player.play(0);
  await tick();
  await f.player.next();
  release();
  await pending;
  assert.equal(f.player.state.index, 1);
  assert.equal(f.starts.length, 1);
  let cancel = () => {};
  const g = fixture(async () => {
    await new Promise<void>((r) => {
      cancel = r;
    });
  });
  const loading = g.player.play();
  await tick();
  g.player.stop();
  cancel();
  await loading;
  assert.equal(g.starts.length, 0);
});
test("failed songs report an error and can be skipped; queue entries stay unique", async () => {
  const f = fixture(async (item) => {
    if (item.id === "one") throw new Error("Missing audio");
  });
  f.player.append(songs[0]);
  assert.equal(f.player.state.queue.length, 2);
  await f.player.play();
  assert.equal(f.player.state.status, "error");
  assert.equal(f.player.state.error, "Missing audio");
  await f.player.next();
  assert.equal(f.player.state.status, "playing");
  assert.equal(f.player.state.index, 1);
});
