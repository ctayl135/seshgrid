import { samplePeak } from "./meter";
import { encodeWav } from "./wav";
import { detectPitch } from "./stock-plugins";
import { microphoneConstraints } from "./voice-input";
export class MicrophoneCapture {
  private node?: AudioWorkletNode;
  private source?: MediaStreamAudioSourceNode;
  private sink?: GainNode;
  private stream?: MediaStream;
  private analyser?: AnalyserNode;
  private meterSamples?: Float32Array<ArrayBuffer>;
  private chunks: Float32Array<ArrayBuffer>[] = [];
  private frames = 0;
  private disposed = false;
  private finish?: (blob: Blob) => void;
  private fail?: (e: Error) => void;
  private result?: Promise<Blob>;
  private stopRequested = false;
  constructor(private context: AudioContext) {}
  async prepare(
    onInterrupted: () => void,
    deviceId = "",
    voiceAssist = true,
    inputBoostDb = 0,
    noiseCleanup = false,
  ) {
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode)
      throw new Error(
        "Recording requires a modern browser on HTTPS or localhost.",
      );
    try {
      let timedOut = false;
      const request = navigator.mediaDevices.getUserMedia(
        microphoneConstraints(deviceId, voiceAssist, noiseCleanup),
      );
      void request.then(
        (stream) => {
          if (timedOut || this.disposed)
            stream.getTracks().forEach((t) => t.stop());
        },
        () => {},
      );
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        this.stream = await Promise.race([
          request,
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              timedOut = true;
              reject(
                new Error(
                  "Microphone permission timed out. Allow access in your browser and try again.",
                ),
              );
            }, 20000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
      if (this.disposed) throw new Error("Microphone check cancelled.");
      await this.context.audioWorklet.addModule("/recorder.js");
      if (this.disposed) throw new Error("Microphone check cancelled.");
      await this.context.resume();
      if (this.disposed) throw new Error("Microphone check cancelled.");
      this.node = new AudioWorkletNode(this.context, "seshgrid-recorder", {
        outputChannelCount: [1],
      });
      this.node.port.postMessage({
        inputBoostDb: Math.max(
          0,
          Math.min(30, Number.isFinite(inputBoostDb) ? inputBoostDb : 0),
        ),
      });
      this.source = this.context.createMediaStreamSource(this.stream);
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 2048;
      this.meterSamples = new Float32Array(this.analyser.fftSize);

      this.sink = this.context.createGain();
      this.sink.gain.value = 0;
      this.source
        .connect(this.node)
        .connect(this.analyser)
        .connect(this.sink)
        .connect(this.context.destination);
      this.result = new Promise<Blob>((resolve, reject) => {
        this.finish = resolve;
        this.fail = reject;
      });
      // Attach a rejection handler immediately; stop() still propagates the result.
      void this.result.catch(() => {});
      this.node.port.onmessage = (e) => {
        if (e.data.samples) {
          this.chunks.push(e.data.samples);
          this.frames += e.data.samples.length;
          if (this.frames * 2 >= 49 * 1024 * 1024 && !this.stopRequested)
            onInterrupted();
        }
        if (e.data.done) {
          try {
            const samples = new Float32Array(this.frames);
            let offset = 0;
            for (const c of this.chunks) {
              samples.set(c, offset);
              offset += c.length;
            }
            if (!samples.length)
              throw new Error("No audio captured. Check your microphone.");
            this.finish?.(
              new Blob([encodeWav([samples], this.context.sampleRate)], {
                type: "audio/wav",
              }),
            );
          } catch (e) {
            this.fail?.(e instanceof Error ? e : new Error(String(e)));
          } finally {
            this.dispose();
          }
        }
      };
      this.node.onprocessorerror = () => {
        this.fail?.(
          new Error(
            "The microphone processor stopped unexpectedly. Earlier saved takes are safe.",
          ),
        );
        this.dispose();
        onInterrupted();
      };
      this.stream.getAudioTracks().forEach((t) => {
        t.onended = onInterrupted;
        t.onmute = onInterrupted;
      });
      this.context.addEventListener("statechange", this.onStateChange);
      this.onInterrupted = onInterrupted;
    } catch (e) {
      this.dispose();
      if (
        e instanceof DOMException &&
        (e.name === "NotFoundError" || e.name === "OverconstrainedError")
      )
        throw new Error(
          "Selected microphone is unavailable. Choose System default or reconnect it and refresh inputs.",
        );
      throw e;
    }
  }
  private onInterrupted?: () => void;
  private onStateChange = () => {
    if (this.context.state !== "running" && !this.stopRequested)
      this.onInterrupted?.();
  };
  start(when: number) {
    if (!this.node) throw new Error("Microphone is not ready");
    this.node.port.postMessage({
      startFrame: Math.ceil(when * this.context.sampleRate),
    });
  }
  async stop(): Promise<Blob> {
    if (!this.result) throw new Error("No microphone recording in progress");
    this.stopRequested = true;
    this.node?.port.postMessage("stop");
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.result,
        new Promise<Blob>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  "Microphone stopped responding. Try recording again.",
                ),
              ),
            5000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
      this.dispose();
    }
  }
  peak() {
    if (!this.analyser || !this.meterSamples) return 0;
    this.analyser.getFloatTimeDomainData(this.meterSamples);
    return samplePeak(this.meterSamples);
  }
  pitchHz() {
    if (!this.analyser || !this.meterSamples) return 0;
    this.analyser.getFloatTimeDomainData(this.meterSamples);
    return detectPitch(this.meterSamples, this.context.sampleRate);
  }
  inputLabel() {
    return (
      this.stream?.getAudioTracks()[0]?.label || "System default microphone"
    );
  }
  dispose() {
    this.disposed = true;
    this.context.removeEventListener("statechange", this.onStateChange);
    this.stream?.getTracks().forEach((t) => {
      t.onended = null;
      t.onmute = null;
      t.stop();
    });
    this.node?.disconnect();
    this.source?.disconnect();
    this.sink?.disconnect();
    this.analyser?.disconnect();
    this.analyser = undefined;
    this.meterSamples = undefined;
    this.chunks = [];
  }
}
