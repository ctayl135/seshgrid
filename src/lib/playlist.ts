export type PlaylistItem = { id: string; name: string };
export type PlaylistState = {
  queue: PlaylistItem[];
  index: number;
  status: "idle" | "loading" | "playing" | "paused" | "ended" | "error";
  error: string;
};
export type PlaylistDriver = {
  ready: () => Promise<void>;
  prepare: (item: PlaylistItem, current: () => boolean) => Promise<void>;
  play: (from: number, ended: () => void) => Promise<void>;
  stop: () => void;
  time: () => number;
};
export class PlaylistPlayer {
  state: PlaylistState = { queue: [], index: -1, status: "idle", error: "" };
  private revision = 0;
  private position = 0;
  constructor(
    private driver: PlaylistDriver,
    private changed: (state: PlaylistState) => void,
  ) {}
  private publish(patch: Partial<PlaylistState>) {
    this.state = { ...this.state, ...patch };
    this.changed(this.state);
  }
  replace(queue: PlaylistItem[]) {
    this.stop();
    this.publish({ queue: [...queue], index: -1 });
  }
  append(item: PlaylistItem) {
    if (!this.state.queue.some((i) => i.id === item.id))
      this.publish({ queue: [...this.state.queue, item] });
  }
  async play(index = this.state.index < 0 ? 0 : this.state.index, from = 0) {
    const item = this.state.queue[index];
    if (!item) return;
    const revision = ++this.revision,
      current = () => this.revision === revision;
    this.driver.stop();
    this.position = from;
    this.publish({ index, status: "loading", error: "" });
    try {
      await this.driver.ready();
      if (!current()) return;
      await this.driver.prepare(item, current);
      if (!current()) return;
      await this.driver.play(from, () => {
        if (!current()) return;
        if (index + 1 < this.state.queue.length) void this.play(index + 1);
        else {
          this.position = 0;
          this.publish({ status: "ended" });
        }
      });
      if (current()) this.publish({ status: "playing" });
    } catch (e) {
      if (!current()) return;
      this.driver.stop();
      this.publish({
        status: "error",
        error: e instanceof Error ? e.message : "Song could not be played",
      });
    }
  }
  pause() {
    if (this.state.status !== "playing") return;
    this.position = this.driver.time();
    ++this.revision;
    this.driver.stop();
    this.publish({ status: "paused" });
  }
  resume() {
    return this.play(
      this.state.status === "ended" ? 0 : undefined,
      this.state.status === "paused" ? this.position : 0,
    );
  }
  next() {
    if (this.state.index + 1 < this.state.queue.length)
      return this.play(this.state.index + 1);
    this.stop();
    this.publish({ status: "ended" });
  }
  stop() {
    ++this.revision;
    this.driver.stop();
    this.position = 0;
    this.publish({ status: "idle", error: "" });
  }
}
