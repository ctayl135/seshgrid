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
  process(inputs, outputs = []) {
    const input = inputs[0];
    if (!this.active || !input?.length) return true;
    // A headset can expose a silent or inverted second channel. Keep the strongest.
    let channel = input[0],
      energy = -1;
    for (const candidate of input) {
      let value = 0;
      for (const sample of candidate) value += sample * sample;
      if (value > energy) {
        energy = value;
        channel = candidate;
      }
    }
    for (let i = 0; i < channel.length; i++) {
      const sample = channel[i];
      if (outputs[0]?.[0]) outputs[0][0][i] = sample;
      if (currentFrame + i < this.startFrame) continue;
      this.chunk[this.used++] = sample;
      if (this.used === this.chunk.length) this.flush();
    }
    return true;
  }
}
registerProcessor("seshgrid-recorder", PCMRecorder);
