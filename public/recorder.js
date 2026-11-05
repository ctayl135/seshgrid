class PCMRecorder extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.startFrame = Infinity;
    this.gain = 1;
    this.selectedChannel = undefined;
    this.chunk = new Float32Array(4096);
    this.used = 0;
    this.active = true;
    this.port.onmessage = (e) => {
      if (Number.isFinite(e.data?.inputBoostDb))
        this.gain = Math.pow(
          10,
          Math.max(0, Math.min(30, e.data.inputBoostDb)) / 20,
        );
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
    // Lock the input channel; switching each render block can create clicks.
    if (this.selectedChannel === undefined || !input[this.selectedChannel]) {
      let best = 0,
        energy = -1;
      for (let c = 0; c < input.length; c++) {
        let e = 0;
        for (const x of input[c]) e += x * x;
        if (e > energy) {
          best = c;
          energy = e;
        }
      }
      if (energy > 1e-8) this.selectedChannel = best;
    }
    const channel = input[this.selectedChannel ?? 0];
    for (let i = 0; i < channel.length; i++) {
      let sample = channel[i] * this.gain;
      if (this.gain > 1 && Math.abs(sample) > 0.8)
        sample =
          Math.sign(sample) *
          (0.8 + 0.2 * Math.tanh((Math.abs(sample) - 0.8) / 0.2));
      if (outputs[0]?.[0]) outputs[0][0][i] = sample;
      if (currentFrame + i < this.startFrame) continue;
      this.chunk[this.used++] = sample;
      if (this.used === this.chunk.length) this.flush();
    }
    return true;
  }
}
registerProcessor("seshgrid-recorder", PCMRecorder);
