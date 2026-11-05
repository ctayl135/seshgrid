"use client";
import type { Track } from "@/lib/model";
export default function BeatLevels({
  tracks,
  volumeDisabled,
  editDisabled,
  onGain,
  onNormalize,
  onReset,
}: {
  tracks: Track[];
  volumeDisabled: boolean;
  editDisabled: boolean;
  onGain: (id: string, gain: number) => void;
  onNormalize: (id: string) => void;
  onReset: (id: string) => void;
}) {
  const beats = tracks.filter((t) => t.role === "beat");
  if (!beats.length) return null;
  return (
    <details className="beat-levels" open>
      <summary>Beat volume & normalization</summary>
      <p>
        Set the instrumental below your voice. Normalize sets clip peaks toward
        −1 dBFS before track volume and effects; it does not change the source
        file.
      </p>
      {beats.map((t) => (
        <div className="beat-level-row" key={t.id}>
          <label>
            {t.name}
            <output>
              {t.gain === 0
                ? "Muted"
                : (20 * Math.log10(t.gain)).toFixed(1) + " dB"}
            </output>
            <input
              aria-label={`Beat volume: ${t.name}`}
              type="range"
              min={0}
              max={2}
              step={0.01}
              value={t.gain}
              disabled={volumeDisabled}
              onChange={(e) => onGain(t.id, Number(e.target.value))}
            />
          </label>
          <button
            disabled={editDisabled || !t.clips.length}
            onClick={() => onNormalize(t.id)}
          >
            Normalize beat
          </button>
          <button
            disabled={
              editDisabled || !t.clips.some((c) => c.level !== undefined)
            }
            onClick={() => onReset(t.id)}
          >
            Reset normalization
          </button>
        </div>
      ))}
    </details>
  );
}
