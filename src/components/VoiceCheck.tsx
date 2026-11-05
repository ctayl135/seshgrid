"use client";
import { useEffect, useRef, useState } from "react";
import { MicrophoneCapture } from "@/lib/capture";
import { detectKey, KEY_NAMES, type KeyAnalysis } from "@/lib/key-detection";
import { voiceNote } from "@/lib/voice-input";
export default function VoiceCheck({
  deviceId,
  assist,
  disabled,
  onBusy,
  onApply,
}: {
  deviceId: string;
  assist: boolean;
  disabled: boolean;
  onBusy: (active: boolean) => void;
  onApply: (root: number, scale: "major" | "minor") => void;
}) {
  const [phase, setPhase] = useState<
      "idle" | "preparing" | "listening" | "analyzing"
    >("idle"),
    [message, setMessage] = useState(""),
    [reading, setReading] = useState({ peak: 0, hz: 0 }),
    [seconds, setSeconds] = useState(8),
    [input, setInput] = useState(""),
    [result, setResult] = useState<KeyAnalysis | null>(null);
  const active = useRef<{
      capture: MicrophoneCapture;
      ctx: AudioContext;
    } | null>(null),
    timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined),
    ending = useRef(false),
    generation = useRef(0);
  const clean = () => {
    clearInterval(timer.current);
    active.current?.capture.dispose();
    void active.current?.ctx.close().catch(() => {});
    active.current = null;
  };
  useEffect(
    () => () => {
      generation.current++;
      clean();
      onBusy(false);
    },
    [onBusy],
  );
  const finish = async () => {
    if (!active.current || ending.current) return;
    ending.current = true;
    clearInterval(timer.current);
    const token = generation.current,
      { capture, ctx } = active.current;
    setPhase("analyzing");
    setMessage("Checking your voice for a key…");
    try {
      const blob = await capture.stop();
      const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
      const found = await detectKey(
        [buffer.getChannelData(0)],
        buffer.sampleRate,
      );
      if (token === generation.current) {
        setResult(found);
        setMessage(
          found.clarity === "clear"
            ? "Your sung phrase suggests this key. Match your beat before applying."
            : "Your voice fits several keys. Compare these suggestions with your beat.",
        );
      }
    } catch (e) {
      if (token === generation.current)
        setMessage(
          (e instanceof Error ? e.message : "Voice check failed.") +
            " Sing or hum several different notes for a better key check.",
        );
    } finally {
      if (token === generation.current) {
        clean();
        setPhase("idle");
        onBusy(false);
      }
    }
  };
  const note = voiceNote(reading.hz),
    db = reading.peak ? 20 * Math.log10(reading.peak) : -60;
  return (
    <details className="voice-check" aria-label="Voice Auto Key and mic check">
      <summary>Check my voice & microphone</summary>
      <h3>Check my voice</h3>
      <p>
        Sing or hum a melody for 8 seconds. See your notes, check your mic
        volume and get key suggestions. Use headphones; your mic is not played
        through speakers.
      </p>
      <button
        disabled={disabled || phase !== "idle"}
        onClick={async () => {
          if (active.current) return;
          const token = ++generation.current;
          ending.current = false;
          onBusy(true);
          setPhase("preparing");
          setResult(null);
          setMessage("Allow microphone access if asked…");
          setReading({ peak: 0, hz: 0 });
          setSeconds(8);
          try {
            const ctx = new AudioContext(),
              capture = new MicrophoneCapture(ctx);
            active.current = { capture, ctx };
            await ctx.resume();
            await capture.prepare(
              () => {
                void finish();
              },
              deviceId,
              assist,
            );
            if (token !== generation.current) return;
            capture.start(ctx.currentTime);
            setInput(capture.inputLabel());
            setPhase("listening");
            setMessage(
              "Sing a phrase with several notes. For a volume check, rap at your normal level.",
            );
            const start = performance.now();
            timer.current = setInterval(() => {
              const remaining = Math.max(
                0,
                8 - (performance.now() - start) / 1000,
              );
              setSeconds(Math.ceil(remaining));
              setReading({ peak: capture.peak(), hz: capture.pitchHz() });
              if (!remaining) void finish();
            }, 125);
          } catch (e) {
            if (token === generation.current) {
              setMessage(
                e instanceof Error ? e.message : "Microphone check failed.",
              );
              clean();
              setPhase("idle");
              onBusy(false);
            }
          }
        }}
      >
        Check mic & voice key
      </button>
      {phase === "listening" && (
        <button onClick={() => void finish()}>Finish voice check</button>
      )}
      {phase !== "idle" && (
        <button
          onClick={() => {
            generation.current++;
            clean();
            setPhase("idle");
            onBusy(false);
            setMessage("Voice check cancelled.");
          }}
        >
          Cancel check
        </button>
      )}
      {input && <p>Microphone: {input}</p>}
      {phase === "listening" && (
        <div className="voice-reading" aria-live="off">
          <strong>
            {seconds}s ·{" "}
            {note
              ? `${KEY_NAMES[note.pitchClass]}${note.octave} (${note.cents > 0 ? "+" : ""}${note.cents} cents)`
              : "Waiting for a sung note"}
          </strong>
          <meter
            aria-label="Voice check input level"
            min={-60}
            max={0}
            value={Math.max(-60, Math.min(0, db))}
          />
          <span>
            {db > -60 ? db.toFixed(1) + " dBFS" : "No input yet"} ·{" "}
            {db > -1
              ? "Too loud: move the mic away"
              : db < -40
                ? "Very quiet: check headphone mic or choose another input"
                : "Mic is picking you up"}
          </span>
        </div>
      )}
      <p role="status">{message}</p>
      {result && (
        <div className="key-results">
          {result.candidates.map((k, i) => (
            <button
              key={`${k.root}${k.scale}`}
              disabled={disabled}
              onClick={() => onApply(k.root, k.scale)}
            >
              {i === 0 ? "Voice suggestion: " : "Alternative: "}
              {KEY_NAMES[k.root]} {k.scale} · Tune my vocal
            </button>
          ))}
        </div>
      )}
      <small>
        Spoken rap may not contain enough sung notes to identify a key. This
        estimates musical pitch, not another plugin’s exact settings. The check
        is discarded; record a take to save your performance.
      </small>
    </details>
  );
}
