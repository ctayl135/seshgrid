"use client";
import { useEffect, useRef, useState } from "react";
import type { Track } from "@/lib/model";
import { detectKey, KEY_NAMES, type KeyAnalysis } from "@/lib/key-detection";
import { stockPlugins } from "@/lib/stock-plugins";
export default function AutoKey({
  tracks,
  track,
  buffers,
  disabled,
  update,
}: {
  tracks: Track[];
  track: Track;
  buffers: Map<string, AudioBuffer>;
  disabled: boolean;
  update: (patch: Partial<Track>) => void;
}) {
  const sources = tracks.flatMap((t) =>
    t.clips
      .filter((c) => c.duration >= 0.75 && buffers.has(c.assetId))
      .map((c, i) => ({
        id: c.id,
        label: `${t.name} · clip ${i + 1}`,
        clip: c,
      })),
  );
  const [source, setSource] = useState(""),
    [result, setResult] = useState<KeyAnalysis | null>(null),
    [working, setWorking] = useState(false),
    [message, setMessage] = useState("");
  const request = useRef(0);
  const chosen =
    sources.find((s) => s.id === source) ??
    sources.find(
      (s) =>
        tracks.find((t) => t.clips.some((c) => c.id === s.id))?.role === "beat",
    ) ??
    sources[0];
  const signature = chosen
    ? `${chosen.id}:${chosen.clip.assetId}:${chosen.clip.offset}:${chosen.clip.duration}`
    : "";
  useEffect(() => {
    request.current++;
    setWorking(false);
    setResult(null);
    setMessage("");
    return () => {
      request.current++;
    };
  }, [signature]);
  return (
    <section className="auto-key" aria-label="NOIR Auto Key">
      <h3>Auto Key</h3>
      <p>
        Find the key of your beat, then tune this vocal to match. Analysis stays
        on your device.
      </p>
      <label>
        Analyze audio
        <select
          aria-label="Key detection source"
          value={chosen?.id ?? ""}
          disabled={disabled || working}
          onChange={(e) => setSource(e.target.value)}
        >
          {!sources.length && (
            <option value="">Upload a beat or record a vocal first</option>
          )}
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <button
        disabled={disabled || working || !chosen}
        onClick={async () => {
          if (!chosen) return;
          const id = ++request.current;
          setWorking(true);
          setResult(null);
          setMessage("Listening for the key…");
          try {
            const b = buffers.get(chosen.clip.assetId);
            if (!b) throw new Error("Reopen this session to load its audio.");
            const found = await detectKey(
              Array.from({ length: b.numberOfChannels }, (_, i) =>
                b.getChannelData(i),
              ),
              b.sampleRate,
              chosen.clip.offset,
              chosen.clip.duration,
            );
            if (id === request.current) {
              setResult(found);
              setMessage(
                found.clarity === "clear"
                  ? "Suggested key. Listen and adjust if needed."
                  : "Several keys fit this audio. Compare the suggestions by ear.",
              );
            }
          } catch (e) {
            if (id === request.current)
              setMessage(
                e instanceof Error ? e.message : "Could not analyze audio.",
              );
          } finally {
            if (id === request.current) setWorking(false);
          }
        }}
      >
        {working ? "Detecting…" : "Detect key"}
      </button>
      <p role="status" aria-live="polite">
        {message}
      </p>
      {result && (
        <div className="key-results">
          {result.candidates.map((k, i) => (
            <button
              key={`${k.root}-${k.scale}`}
              disabled={disabled}
              onClick={() => {
                const p = stockPlugins(track.plugins);
                update({
                  plugins: {
                    ...p,
                    bypass: false,
                    pitch: {
                      ...p.pitch,
                      enabled: true,
                      root: k.root,
                      scale: k.scale,
                    },
                  },
                });
                setMessage(
                  `Applied ${KEY_NAMES[k.root]} ${k.scale} to ${track.name}. Adjust correction and retune speed below, then press Play.`,
                );
              }}
            >
              {i === 0 ? "Suggested: " : "Alternative: "}
              {KEY_NAMES[k.root]} {k.scale} · Apply
            </button>
          ))}
        </div>
      )}
      <small>
        Key estimates can be uncertain on drums, short phrases and changing
        keys. Apply targets only the selected track. Original audio stays
        intact.
      </small>
    </section>
  );
}
