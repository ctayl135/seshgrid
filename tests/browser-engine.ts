import { stockPlugins, detectPitch } from "../src/lib/stock-plugins";
import { normalizationLevel } from "../src/lib/normalize";
import { PlaylistPlayer } from "../src/lib/playlist";
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
      value: {
        getUserMedia: async (constraints: MediaStreamConstraints) => {
          check(
            (constraints.audio as MediaTrackConstraints).deviceId !== undefined,
            "Chosen microphone constraint was omitted",
          );
          return destination.stream;
        },
      },
    });
    capture = new MicrophoneCapture(context);
    await capture.prepare(() => {
      throw new Error("Synthetic capture interrupted");
    }, "synthetic-input");
    const project = newProject(),
      track = newTrack("Synthetic take");
    project.tracks = [track];
    const when = await engine.play(project, 0, undefined, {
      countInBeats: 1,
      metronome: true,
    });
    capture.start(when);
    await new Promise((resolve) => setTimeout(resolve, 1600));
    check(
      capture.peak() > 0.09 && capture.peak() < 0.11,
      "Input meter does not measure raw microphone signal",
    );
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
    await engine.play(project, 0);
    await new Promise((resolve) => setTimeout(resolve, 500));
    check(
      engine.peak() > 0.04 && engine.peak() < 0.06,
      "Mix meter does not measure post-fader signal",
    );
    engine.stop();
    check(
      engine.peak() === 0 && capture.peak() === 0,
      "Stopped meters retain live audio nodes",
    );
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
    track.clips[0].level = normalizationLevel(
      [samples],
      recorded.sampleRate,
      track.clips[0],
    );
    const normalized = await context.decodeAudioData(
      await (await engine.export(project)).arrayBuffer(),
    );
    const normalizedPeak = normalized
      .getChannelData(1)
      .reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    check(
      Math.abs(normalizedPeak - Math.pow(10, -1 / 20) * track.gain) < 0.002,
      "Clip normalization not applied before track processing",
    );
    delete track.clips[0].level;
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
          Math.floor((time - 0.004) * echoes.sampleRate),
          Math.ceil((time + 0.004) * echoes.sampleRate),
        )
        .reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    check(
      windowPeak(0, 0.05) > 0.04 && windowPeak(1, 0.05) < 0.001,
      `First echo is not isolated left (L=${windowPeak(0, 0.05)}, R=${windowPeak(1, 0.05)}, rate=${echoes.sampleRate})`,
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
    bypass.clips.push({
      ...bypass.clips[0],
      id: crypto.randomUUID(),
      muted: true,
    });
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
    const phase = context.createBuffer(
      2,
      context.sampleRate,
      context.sampleRate,
    );
    for (let i = 0; i < phase.length; i++) {
      const value =
        0.4 * Math.sin((2 * Math.PI * 440 * i) / context.sampleRate);
      phase.getChannelData(0)[i] = value;
      phase.getChannelData(1)[i] = -value;
    }
    const phaseId = crypto.randomUUID();
    engine.buffers.set(phaseId, phase);
    bypass.clips = [
      {
        id: crypto.randomUUID(),
        assetId: phaseId,
        start: 0,
        offset: 0,
        duration: 1,
      },
    ];
    await engine.play(project, 0);
    await new Promise((resolve) => setTimeout(resolve, 300));
    check(
      engine.peak() > 0.19 && engine.peak() < 0.21,
      "Stereo meter cancels opposite-phase channels",
    );
    engine.stop();
    bypass.clips[0].duration = 0.1;
    const played: string[] = [];
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Real audio playlist did not advance")),
        10000,
      );
      const playlist = new PlaylistPlayer(
        {
          ready: async () => {
            await engine.ready();
          },
          prepare: async (item) => {
            played.push(item.id);
          },
          play: async (from, ended) => {
            await engine.play(project, from, ended);
          },
          stop: () => engine.stop(),
          time: () => engine.time(),
        },
        (state) => {
          if (state.status === "ended") {
            clearTimeout(timeout);
            resolve();
          }
          if (state.status === "error") {
            clearTimeout(timeout);
            reject(new Error(state.error));
          }
        },
      );
      playlist.replace([
        { id: "first", name: "First mix" },
        { id: "second", name: "Second mix" },
      ]);
      void playlist.play();
    });
    check(
      played.join(",") === "first,second",
      "Actual audio completion did not sequence two songs",
    );
    const detunedId = crypto.randomUUID(),
      detuned = context.createBuffer(1, context.sampleRate, context.sampleRate);
    for (let i = 0; i < detuned.length; i++)
      detuned.getChannelData(0)[i] =
        0.2 * Math.sin((2 * Math.PI * 455 * i) / context.sampleRate);
    engine.buffers.set(detunedId, detuned);
    const tuned = newTrack("Pitch Lock integration");
    tuned.pan = 1;
    tuned.gain = 0.5;
    tuned.plugins = stockPlugins();
    tuned.plugins.pitch = {
      enabled: true,
      root: 0,
      scale: "major",
      strength: 1,
      retune: 0,
    };
    tuned.clips = [
      {
        id: crypto.randomUUID(),
        assetId: detunedId,
        start: 0,
        offset: 0,
        duration: 1,
      },
    ];
    project.tracks = [tuned];
    const corrected = await context.decodeAudioData(
        await (await engine.export(project)).arrayBuffer(),
      ),
      hz = detectPitch(
        corrected.getChannelData(1),
        corrected.sampleRate,
        Math.floor(corrected.sampleRate * 0.5),
      );
    check(
      Math.abs(hz - 440) < 4,
      "Pitch Lock was not applied to WAV export: " + hz,
    );
    tuned.plugins.pitch.enabled = false;
    tuned.volumeMotion = {
      id: crypto.randomUUID(),
      start: 0,
      duration: 1,
      points: [
        { time: 0, value: 0 },
        { time: 1, value: 1 },
      ],
    };
    const moving = await context.decodeAudioData(
      await (await engine.export(project)).arrayBuffer(),
    );
    const windowRms = (at: number) => {
      const a = moving
        .getChannelData(1)
        .slice(
          Math.floor(at * moving.sampleRate),
          Math.floor((at + 0.1) * moving.sampleRate),
        );
      return Math.sqrt(a.reduce((n, v) => n + v * v, 0) / a.length);
    };
    check(
      windowRms(0.8) > windowRms(0.1) * 3,
      "Volume Motion did not fade the exported audio",
    );
    await engine.loop(project, 0, 0.25, true);
    await new Promise((r) => setTimeout(r, 450));
    check(
      engine.looping && engine.time() >= 0 && engine.time() < 0.25,
      "Loop preview did not wrap within its region",
    );
    engine.stop();
    check(
      !engine.looping && engine.peak() === 0,
      "Loop stop did not release transport and meters",
    );
    status.textContent = `PASS — actual AudioWorklet capture → PCM WAV → decode → offline mix/export. Take: ${recorded.duration.toFixed(3)}s; RMS: ${rms.toFixed(4)}. All eight vocal/adlib presets changed rendered audio with finite samples. Ping-pong echoes alternate left/right at the expected times. Legacy mono/stereo levels are preserved with effects bypassed. Input selection, input metering, stereo mix metering and stopped-node cleanup passed. Two songs automatically advanced using actual audio completion events. Non-destructive clip normalization reached the expected rendered peak. Count-in capture, muted takes, Pitch Lock export and continuous loop wrap/stop passed. No microphone used.`;
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
