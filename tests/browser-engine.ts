// Runs only in the isolated local test server; never included in the studio build.
import { AudioEngine } from "../src/lib/audio";
import { MicrophoneCapture } from "../src/lib/capture";
import { newProject, newTrack } from "../src/lib/model";
const status = document.querySelector<HTMLOutputElement>("#result")!;
const button = document.querySelector<HTMLButtonElement>("#run")!;
const check = (value: boolean, message: string) => {
  if (!value) throw new Error(message);
};
button.onclick = async () => {
  button.disabled = true;
  status.textContent =
    "Running real AudioWorklet capture and offline rendering…";
  const engine = new AudioEngine();
  let capture: MicrophoneCapture | undefined;
  let oscillator: OscillatorNode | undefined;
  try {
    const context = await engine.ready();
    const destination = context.createMediaStreamDestination(),
      signal = context.createGain();
    signal.gain.value = 0.1;
    oscillator = context.createOscillator();
    oscillator.frequency.value = 440;
    oscillator.connect(signal).connect(destination);
    oscillator.start();
    // Substitute an oscillator stream in this test page only. No microphone is requested.
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: async () => destination.stream },
    });
    capture = new MicrophoneCapture(context);
    await capture.prepare(() => {
      throw new Error("Synthetic capture interrupted");
    });
    const project = newProject(),
      track = newTrack("Synthetic take");
    project.tracks = [track];
    const when = await engine.play(project, 0);
    capture.start(when);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const blob = await capture.stop(),
      id = crypto.randomUUID(),
      recorded = await engine.decode(id, blob);
    const samples = recorded.getChannelData(0),
      rms = Math.sqrt(
        samples.reduce((sum, n) => sum + n * n, 0) / samples.length,
      );
    check(
      recorded.duration > 0.75 && recorded.duration < 1.5,
      "Captured take duration is not aligned with scheduled start",
    );
    check(
      rms > 0.05 && rms < 0.09,
      "Captured PCM does not contain the generated signal",
    );
    track.pan = 1;
    track.gain = 0.5;
    track.clips = [
      {
        id: crypto.randomUUID(),
        assetId: id,
        start: 0.25,
        offset: 0,
        duration: recorded.duration,
      },
    ];
    const wav = await engine.export(project),
      header = new DataView(await wav.slice(0, 44).arrayBuffer());
    check(
      header.getUint16(22, true) === 2 &&
        header.getUint32(24, true) === 44100 &&
        header.getUint16(34, true) === 16,
      "Export WAV header is invalid",
    );
    const mixed = await context.decodeAudioData(await wav.arrayBuffer());
    const peak = (c: number) =>
      mixed
        .getChannelData(c)
        .reduce((n, sample) => Math.max(n, Math.abs(sample)), 0);
    check(
      peak(0) < 0.0001 && peak(1) > 0.04 && peak(1) < 0.06,
      "Export does not preserve capture, gain or pan",
    );
    status.textContent = `PASS — actual AudioWorklet capture → PCM WAV → decode → offline mix/export. Take: ${recorded.duration.toFixed(3)}s; RMS: ${rms.toFixed(4)}; exported at 44.1 kHz / 16-bit stereo. Right peak: ${peak(1).toFixed(4)}; left peak: ${peak(0).toFixed(4)}. No microphone used.`;
    status.dataset.passed = "true";
  } catch (error) {
    status.textContent = `FAIL — ${error instanceof Error ? error.message : String(error)}`;
    status.dataset.passed = "false";
  } finally {
    capture?.dispose();
    oscillator?.stop();
    engine.stop();
    await engine.context?.close();
    button.disabled = false;
  }
};
