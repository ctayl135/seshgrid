import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import VoiceCheck from "../src/components/VoiceCheck";
// This isolated test page supplies synthesized singing; it never requests the user's mic.
Object.defineProperty(navigator, "mediaDevices", {
  configurable: true,
  value: {
    getUserMedia: async () => {
      const ctx = new AudioContext();
      await ctx.resume();
      const osc = ctx.createOscillator(),
        gain = ctx.createGain(),
        dest = ctx.createMediaStreamDestination();
      gain.gain.value = Math.pow(10, -42 / 20);
      osc.connect(gain).connect(dest);
      const notes = [
        60, 60, 60, 64, 67, 60, 62, 64, 65, 67, 69, 71, 60, 60, 60, 60,
      ];
      notes.forEach((n, i) =>
        osc.frequency.setValueAtTime(
          440 * 2 ** ((n - 69) / 12),
          ctx.currentTime + i * 0.5,
        ),
      );
      osc.start();
      dest.stream.getAudioTracks()[0].addEventListener("ended", () => {
        osc.stop();
        void ctx.close();
      });
      return dest.stream;
    },
  },
});
function App() {
  const [busy, setBusy] = useState(false),
    [applied, setApplied] = useState("None");
  return (
    <>
      <h1>Synthetic voice check test</h1>
      <p>No microphone permission or personal audio is used.</p>
      <VoiceCheck
        deviceId=""
        boostDb={18}
        assist
        disabled={busy}
        onBusy={setBusy}
        onApply={(root, scale) => setApplied(`${root} ${scale}`)}
      />
      <button
        onClick={async () => {
          const audio = document.querySelector("audio");
          if (!audio) throw new Error("No recorded preview");
          const ctx = new AudioContext();
          try {
            const buffer = await ctx.decodeAudioData(
              await (await fetch(audio.src)).arrayBuffer(),
            );
            const peak = buffer
              .getChannelData(0)
              .reduce((p, x) => Math.max(p, Math.abs(x)), 0);
            if (Math.abs(20 * Math.log10(peak) + 6) > 0.1)
              throw new Error("Preview level incorrect: " + peak);
            document.getElementById("preview-check")!.textContent =
              "PASS: quiet -42 dBFS source boosted by 18 dB, preview reaches -6 dBFS with level assist.";
          } finally {
            await ctx.close();
          }
        }}
      >
        Verify playback audio
      </button>
      <output id="preview-check">Not checked</output>
      <output id="applied">Applied: {applied}</output>
    </>
  );
}
createRoot(document.getElementById("app")!).render(<App />);
