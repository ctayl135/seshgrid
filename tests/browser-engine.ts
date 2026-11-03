// Runs only in the isolated local test server; never included in the studio build.
import { AudioEngine } from "../src/lib/audio";
import { MicrophoneCapture } from "../src/lib/capture";
import { newProject, newTrack } from "../src/lib/model";
import {
  applyVocalPreset,
  VOCAL_PRESETS,
  DRY_EFFECTS,
} from "../src/lib/presets";
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
      `Export does not preserve capture, gain or pan (L=${peak(0)}, R=${peak(1)})`,
    );
    const dry = mixed.getChannelData(1);
    for (const preset of VOCAL_PRESETS) {
      project.tracks = [applyVocalPreset(track, preset.id)];
      const rendered = await context.decodeAudioData(
        await (await engine.export(project)).arrayBuffer(),
      );
      const data = rendered.getChannelData(1);
      check(
        data.every(Number.isFinite),
        `${preset.name} produced invalid samples`,
      );
      check(
        data.some((x, i) => Math.abs(x - (dry[i] ?? 0)) > 0.001),
        `${preset.name} did not change the rendered audio`,
      );
    }
    // Verify real alternating echo positions independently of preset tonal changes.
    const hit = context.createBuffer(1, 4410, 44100);
    hit.getChannelData(0)[0] = 0.2;
    const hitId = crypto.randomUUID();
    engine.buffers.set(hitId, hit);
    const echo = newTrack("Echo routing");
    echo.fx = {
      ...DRY_EFFECTS,
      delay: 0.5,
      delayTime: 0.05,
      feedback: 0.5,
      width: 1,
    };
    echo.clips = [
      {
        id: crypto.randomUUID(),
        assetId: hitId,
        start: 0,
        offset: 0,
        duration: 0.1,
      },
    ];
    project.tracks = [echo];
    const echoes = await context.decodeAudioData(
      await (await engine.export(project)).arrayBuffer(),
    );
    const windowPeak = (channel: number, time: number) =>
      echoes
        .getChannelData(channel)
        .slice(
          Math.floor((time - 0.004) * 44100),
          Math.ceil((time + 0.004) * 44100),
        )
        .reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    check(
      windowPeak(0, 0.05) > 0.04 && windowPeak(1, 0.05) < 0.001,
      "First echo is not isolated left",
    );
    check(
      windowPeak(1, 0.1) > 0.015 && windowPeak(0, 0.1) < 0.001,
      "Second echo is not isolated right",
    );
    const stereo = context.createBuffer(2, 4410, 44100);
    for (let i = 0; i < 4410; i++) {
      stereo.getChannelData(0)[i] =
        0.2 * Math.sin((2 * Math.PI * 440 * i) / 44100);
      stereo.getChannelData(1)[i] =
        0.1 * Math.sin((2 * Math.PI * 880 * i) / 44100);
    }
    const stereoId = crypto.randomUUID();
    engine.buffers.set(stereoId, stereo);
    const bypass = newTrack("Legacy stereo");
    bypass.gain = 0.5;
    bypass.clips = [
      {
        id: crypto.randomUUID(),
        assetId: stereoId,
        start: 0,
        offset: 0,
        duration: 0.1,
      },
    ];
    project.tracks = [bypass];
    const unchanged = await context.decodeAudioData(
        await (await engine.export(project)).arrayBuffer(),
      ),
      stereoPeak = (channel: number) =>
        unchanged
          .getChannelData(channel)
          .reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    check(
      Math.abs(stereoPeak(0) - 0.1) < 0.001 &&
        Math.abs(stereoPeak(1) - 0.05) < 0.001,
      "Legacy stereo audio was altered by bypassed effects",
    );
    status.textContent = `PASS — actual AudioWorklet capture → PCM WAV → decode → offline mix/export. Take: ${recorded.duration.toFixed(3)}s; RMS: ${rms.toFixed(4)}. All eight vocal/adlib presets changed rendered audio with finite samples. Ping-pong echoes alternate left/right at the expected times. Legacy mono/stereo levels are preserved with effects bypassed. No microphone used.`;
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
