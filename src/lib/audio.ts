import { audible, projectEnd, type Project, type Track } from "./model";
import { encodeWav } from "./wav";
type Context = AudioContext | OfflineAudioContext;
function impulse(ctx: Context) {
  const b = ctx.createBuffer(2, ctx.sampleRate * 1.5, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let seed = 135 + c;
    for (let i = 0; i < d.length; i++) {
      seed = (seed * 16807) % 2147483647;
      d[i] = ((seed / 2147483647) * 2 - 1) * Math.pow(1 - i / d.length, 3);
    }
  }
  return b;
}
function channel(ctx: Context, t: Track, enabled: boolean, room: AudioBuffer) {
  const input = ctx.createGain(),
    low = ctx.createBiquadFilter(),
    high = ctx.createBiquadFilter(),
    pan = ctx.createStereoPanner(),
    wetPan = ctx.createStereoPanner(),
    gain = ctx.createGain(),
    wet = ctx.createGain(),
    verb = ctx.createConvolver();
  low.type = "lowshelf";
  low.frequency.value = 200;
  low.gain.value = t.low;
  high.type = "highshelf";
  high.frequency.value = 4000;
  high.gain.value = t.high;
  gain.gain.value = enabled ? t.gain : 0;
  pan.pan.value = t.pan;
  wetPan.pan.value = t.pan;
  wet.gain.value = t.reverb;
  verb.buffer = room;
  input.connect(low).connect(high).connect(pan).connect(gain);
  gain.connect(ctx.destination);
  // Pan dry mono audio before summing with the stereo room to avoid doubling it.
  high.connect(verb).connect(wet).connect(wetPan).connect(gain);
  return { input, gain, low, high, pan, wet, wetPan, verb };
}
export class AudioEngine {
  context?: AudioContext;
  buffers = new Map<string, AudioBuffer>();
  private sources: AudioBufferSourceNode[] = [];
  private channels = new Map<string, ReturnType<typeof channel>>();
  private started = 0;
  private position = 0;
  async ready() {
    this.context ??= new AudioContext();
    await this.context.resume();
    return this.context;
  }
  async decode(id: string, blob: Blob) {
    // Decoding must work without playback permission (e.g. opening a saved session).
    const ctx = (this.context ??= new AudioContext());
    const b = await ctx.decodeAudioData(await blob.arrayBuffer());
    this.buffers.set(id, b);
    return b;
  }
  stop() {
    this.sources.forEach((s) => {
      try {
        s.stop();
      } catch {}
      s.disconnect();
    });
    this.sources = [];
    this.channels.forEach((c) =>
      Object.values(c).forEach((n) => n.disconnect()),
    );
    this.channels.clear();
  }
  time() {
    return (
      this.position +
      Math.max(0, (this.context?.currentTime ?? 0) - this.started)
    );
  }
  async play(p: Project, from: number) {
    const ctx = await this.ready();
    this.stop();
    this.position = from;
    try {
      this.started = this.schedule(ctx, p, from, true);
      return this.started;
    } catch (e) {
      this.stop();
      throw e;
    }
  }
  update(p: Project) {
    for (const t of p.tracks) {
      const c = this.channels.get(t.id);
      if (!c) continue;
      c.gain.gain.value = audible(t, p.tracks) ? t.gain : 0;
      c.pan.pan.value = t.pan;
      c.wetPan.pan.value = t.pan;
      c.low.gain.value = t.low;
      c.high.gain.value = t.high;
      c.wet.gain.value = t.reverb;
    }
  }
  private schedule(ctx: Context, p: Project, from: number, live: boolean) {
    const room = impulse(ctx),
      plan: {
        source: AudioBufferSourceNode;
        delay: number;
        offset: number;
        duration: number;
      }[] = [];
    for (const t of p.tracks) {
      const c = channel(ctx, t, audible(t, p.tracks), room);
      if (live) this.channels.set(t.id, c);
      for (const clip of t.clips) {
        const b = this.buffers.get(clip.assetId);
        if (!b) throw new Error("Audio asset missing. Reopen the project.");
        const skip = Math.max(0, from - clip.start),
          duration = Math.min(
            clip.duration - skip,
            b.duration - clip.offset - skip,
          );
        if (duration <= 0) continue;
        const s = ctx.createBufferSource();
        s.buffer = b;
        s.connect(c.input);
        plan.push({
          source: s,
          delay: Math.max(0, clip.start - from),
          offset: clip.offset + skip,
          duration,
        });
        if (live) this.sources.push(s);
      }
    }
    const when = live ? ctx.currentTime + 0.1 : 0;
    for (const step of plan)
      step.source.start(when + step.delay, step.offset, step.duration);
    return when;
  }
  async export(p: Project) {
    const end = projectEnd(p);
    if (!end) throw new Error("Add audio before exporting");
    if (end > 1800)
      throw new Error(
        "Export up to 30 minutes at a time to protect browser memory",
      );
    const ctx = new OfflineAudioContext(
      2,
      Math.ceil((end + 1.5) * 44100),
      44100,
    );
    this.schedule(ctx, p, 0, false);
    const b = await ctx.startRendering();
    return new Blob(
      [encodeWav([b.getChannelData(0), b.getChannelData(1)], b.sampleRate)],
      { type: "audio/wav" },
    );
  }
}
