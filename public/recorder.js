class PCMRecorder extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.startFrame = Infinity;
    this.chunk = new Float32Array(4096);
    this.used = 0;
    this.active = true;
    this.port.onmessage = (e) => {
      if (typeof e.data?.startFrame === "number")
        this.startFrame = e.data.startFrame;
      if (e.data === "stop") {
        this.active = false;
        this.flush();
        this.port.postMessage({ done: true });
      }
    };
  }
  flush() {
    if (this.used) {
      const samples = this.chunk.slice(0, this.used);
      this.port.postMessage({ samples }, [samples.buffer]);
      this.used = 0;
    }
  }
  process(inputs) {
    const input = inputs[0];
    if (!this.active || !input?.length) return true;
    for (let i = 0; i < input[0].length; i++) {
      if (currentFrame + i < this.startFrame) continue;
      let sample = 0;
      for (const channel of input) sample += channel[i] / input.length;
      this.chunk[this.used++] = sample;
      if (this.used === this.chunk.length) this.flush();
    }
    return true;
  }
}
registerProcessor("seshgrid-recorder", PCMRecorder);
