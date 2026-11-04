export class TransportClicks {
  private nodes = new Map<OscillatorNode, GainNode>();
  private timer?: ReturnType<typeof setInterval>;
  constructor(private ctx: AudioContext) {}
  start(
    when: number,
    bpm: number,
    from: number,
    preBeats: number,
    keep: boolean,
  ) {
    this.stop();
    const beat = 60 / bpm;
    for (let i = 0; i < preBeats; i++)
      this.click(when - preBeats * beat + i * beat, i % 4 === 0);
    if (!keep) return;
    let n = Math.ceil((from - 1e-6) / beat),
      time = when + n * beat - from;
    const schedule = () => {
      if (time < this.ctx.currentTime - 0.1) {
        n += Math.ceil((this.ctx.currentTime - time) / beat);
        time = when + n * beat - from;
      }
      while (time < this.ctx.currentTime + 0.15) {
        this.click(time, n % 4 === 0);
        n++;
        time = when + n * beat - from;
      }
    };
    schedule();
    this.timer = setInterval(schedule, 30);
  }
  private click(time: number, strong: boolean) {
    const o = this.ctx.createOscillator(),
      g = this.ctx.createGain();
    o.frequency.value = strong ? 1200 : 850;
    g.gain.setValueAtTime(0.12, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.035);
    o.connect(g).connect(this.ctx.destination);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
      this.nodes.delete(o);
    };
    this.nodes.set(o, g);
    o.start(time);
    o.stop(time + 0.04);
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    for (const [o, g] of this.nodes) {
      try {
        o.stop();
      } catch {}
      o.disconnect();
      g.disconnect();
    }
    this.nodes.clear();
  }
}
