import { samplePeak } from "./meter";
import { audible, projectEnd, type Project, type Track } from "./model";
import { encodeWav } from "./wav";
import { trackEffects, effectTail } from "./presets";
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
type Channel = {
  input: GainNode;
  low: BiquadFilterNode;
  high: BiquadFilterNode;
  highpass: BiquadFilterNode;
  lowpass: BiquadFilterNode;
  compressor: DynamicsCompressorNode;
  compressed: GainNode;
  dryCompression: GainNode;
  shape: WaveShaperNode;
  driveGain: GainNode;
  pan: StereoPannerNode;
  wetPan: StereoPannerNode;
  gain: GainNode;
  wet: GainNode;
  echoWet: GainNode;
  left: DelayNode;
  right: DelayNode;
  leftPan: StereoPannerNode;
  rightPan: StereoPannerNode;
  leftFeedback: GainNode;
  rightFeedback: GainNode;
  nodes: AudioNode[];
  driveAmount: number;
};
const curves = new Map<number, Float32Array<ArrayBuffer>>();
function distortionCurve(amount: number) {
  const key = Math.round(amount * 100);
  let curve = curves.get(key);
  if (curve) return curve;
  const k = 1 + amount * 8;
  curve = Float32Array.from(
    { length: 4096 },
    (_, i) => Math.tanh(k * ((i * 2) / 4095 - 1)) / Math.tanh(k),
  );
  curves.set(key, curve);
  return curve;
}
function updateChannel(
  ctx: Context,
  c: Channel,
  t: Track,
  enabled: boolean,
  live = false,
) {
  const fx = trackEffects(t),
    set = (param: AudioParam, value: number) => {
      if (live) param.setTargetAtTime(value, ctx.currentTime, 0.015);
      else param.value = value;
    };
  set(c.gain.gain, enabled ? t.gain : 0);
  set(c.pan.pan, t.pan);
  set(c.wetPan.pan, t.pan);
  set(c.low.gain, t.low);
  set(c.high.gain, t.high);
  set(c.wet.gain, t.reverb);
  set(c.highpass.frequency, fx.highpass === 20 ? 0 : fx.highpass);
  set(
    c.lowpass.frequency,
    fx.lowpass === 22000
      ? ctx.sampleRate / 2
      : Math.min(fx.lowpass, ctx.sampleRate / 2),
  );
  set(c.dryCompression.gain, fx.compression === 0 ? 1 : 0);
  set(c.compressed.gain, fx.compression === 0 ? 0 : 1);
  set(c.compressor.threshold, -12 - fx.compression * 20);
  set(c.compressor.ratio, 1 + fx.compression * 7);
  c.compressor.knee.value = 18;
  c.compressor.attack.value = 0.006;
  c.compressor.release.value = 0.13;
  if (c.driveAmount !== fx.drive) {
    c.shape.curve = fx.drive === 0 ? null : distortionCurve(fx.drive);
    c.shape.oversample = fx.drive === 0 ? "none" : "2x";
    c.driveAmount = fx.drive;
  }
  set(c.driveGain.gain, 1 / (1 + fx.drive * 1.5));
  set(c.echoWet.gain, fx.delay);
  set(c.left.delayTime, fx.delayTime);
  set(c.right.delayTime, fx.delayTime);
  set(c.leftFeedback.gain, fx.feedback);
  set(c.rightFeedback.gain, fx.feedback);
  set(c.leftPan.pan, Math.max(-1, t.pan - fx.width));
  set(c.rightPan.pan, Math.min(1, t.pan + fx.width));
}
function channel(
  ctx: Context,
  t: Track,
  enabled: boolean,
  room: AudioBuffer,
  inputChannels: number,
  destination: AudioNode = ctx.destination,
): Channel {
  const input = ctx.createGain(),
    low = ctx.createBiquadFilter(),
    high = ctx.createBiquadFilter(),
    highpass = ctx.createBiquadFilter(),
    lowpass = ctx.createBiquadFilter(),
    compressor = ctx.createDynamicsCompressor(),
    compressed = ctx.createGain(),
    dryCompression = ctx.createGain(),
    shape = ctx.createWaveShaper(),
    driveGain = ctx.createGain(),
    pan = ctx.createStereoPanner(),
    wetPan = ctx.createStereoPanner(),
    gain = ctx.createGain(),
    wet = ctx.createGain(),
    verb = ctx.createConvolver(),
    echoWet = ctx.createGain(),
    left = ctx.createDelay(1),
    right = ctx.createDelay(1),
    leftPan = ctx.createStereoPanner(),
    rightPan = ctx.createStereoPanner(),
    leftFeedback = ctx.createGain(),
    rightFeedback = ctx.createGain();
  low.type = "lowshelf";
  // A zero-gain compressor branch must not upmix mono vocals before the panner.
  compressor.channelCount = inputChannels;
  compressor.channelCountMode = "clamped-max";
  shape.channelCount = inputChannels;
  shape.channelCountMode = "explicit";
  low.frequency.value = 200;
  high.type = "highshelf";
  high.frequency.value = 4000;
  highpass.type = "highpass";
  highpass.Q.value = 0.707;
  lowpass.type = "lowpass";
  lowpass.Q.value = 0.707;
  verb.buffer = room;
  input.connect(highpass).connect(lowpass).connect(low).connect(high);
  high.connect(dryCompression).connect(shape);
  high.connect(compressor).connect(compressed).connect(shape);
  shape.connect(driveGain);
  driveGain.connect(pan).connect(gain);
  driveGain.connect(verb).connect(wet).connect(wetPan).connect(gain);
  // A real ping-pong loop: echoes alternate left/right and decay below unity.
  driveGain.connect(left);
  left.connect(leftPan).connect(echoWet);
  left.connect(leftFeedback).connect(right);
  right.connect(rightPan).connect(echoWet);
  right.connect(rightFeedback).connect(left);
  echoWet.connect(gain);
  gain.connect(destination);
  const nodes = [
    input,
    low,
    high,
    highpass,
    lowpass,
    compressor,
    compressed,
    dryCompression,
    shape,
    driveGain,
    pan,
    wetPan,
    gain,
    wet,
    verb,
    echoWet,
    left,
    right,
    leftPan,
    rightPan,
    leftFeedback,
    rightFeedback,
  ];
  const c = {
    input,
    low,
    high,
    highpass,
    lowpass,
    compressor,
    compressed,
    dryCompression,
    shape,
    driveGain,
    pan,
    wetPan,
    gain,
    wet,
    echoWet,
    left,
    right,
    leftPan,
    rightPan,
    leftFeedback,
    rightFeedback,
    nodes,
    driveAmount: -1,
  };
  updateChannel(ctx, c, t, enabled);
  return c;
}
export class AudioEngine {
  context?: AudioContext;
  buffers = new Map<string, AudioBuffer>();
  private sources: AudioBufferSourceNode[] = [];
  private channels = new Map<string, ReturnType<typeof channel>>();
  private analysers: AnalyserNode[] = [];
  private master?: GainNode;
  private meterSplit?: ChannelSplitterNode;
  private meterSamples?: Float32Array<ArrayBuffer>;
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
      s.onended = null;
      s.disconnect();
    });
    this.sources = [];
    this.channels.forEach((c) => c.nodes.forEach((n) => n.disconnect()));
    this.channels.clear();
    this.analysers.forEach((a) => a.disconnect());
    this.analysers = [];
    this.master?.disconnect();
    this.meterSplit?.disconnect();
    this.master = undefined;
    this.meterSplit = undefined;
    this.meterSamples = undefined;
  }
  peak() {
    if (!this.meterSamples) return 0;
    let peak = 0;
    for (const analyser of this.analysers) {
      analyser.getFloatTimeDomainData(this.meterSamples);
      peak = Math.max(peak, samplePeak(this.meterSamples));
    }
    return peak;
  }
  time() {
    return (
      this.position +
      Math.max(0, (this.context?.currentTime ?? 0) - this.started)
    );
  }
  async play(p: Project, from: number, onEnded?: () => void) {
    const ctx = await this.ready();
    this.stop();
    this.position = from;
    try {
      this.started = this.schedule(ctx, p, from, true);
      if (onEnded) {
        const end = ctx.createBufferSource();
        end.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
        end.connect(ctx.destination);
        end.onended = () => {
          this.stop();
          onEnded();
        };
        this.sources.push(end);
        end.start(
          this.started +
            Math.max(0, projectEnd(p) + effectTail(p.tracks) - from),
        );
      }
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
      if (this.context)
        updateChannel(this.context, c, t, audible(t, p.tracks), true);
    }
  }
  private schedule(ctx: Context, p: Project, from: number, live: boolean) {
    let destination: AudioNode = ctx.destination;
    if (live) {
      this.master = ctx.createGain();
      this.master.connect(ctx.destination);
      this.meterSplit = ctx.createChannelSplitter(2);
      this.master.connect(this.meterSplit);
      this.analysers = [ctx.createAnalyser(), ctx.createAnalyser()];
      this.analysers.forEach((a, i) => {
        a.fftSize = 2048;
        this.meterSplit!.connect(a, i);
      });
      this.meterSamples = new Float32Array(2048);
      destination = this.master;
    }
    const room = impulse(ctx),
      plan: {
        source: AudioBufferSourceNode;
        delay: number;
        offset: number;
        duration: number;
      }[] = [];
    for (const t of p.tracks) {
      const inputChannels = Math.min(
        2,
        Math.max(
          1,
          ...t.clips.map(
            (clip) => this.buffers.get(clip.assetId)?.numberOfChannels ?? 1,
          ),
        ),
      );
      const c = channel(
        ctx,
        t,
        audible(t, p.tracks),
        room,
        inputChannels,
        destination,
      );
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
        const clipGain = ctx.createGain();
        clipGain.gain.value = clip.level ?? 1;
        s.connect(clipGain).connect(c.input);
        c.nodes.push(clipGain);
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
      Math.ceil((end + effectTail(p.tracks)) * 44100),
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
