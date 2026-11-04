"use client";
import type { Track } from "@/lib/model";
import { DRY_EFFECTS, trackEffects } from "@/lib/presets";
export default function BeatRack({
  track,
  disabled,
  update,
}: {
  track: Track;
  disabled: boolean;
  update: (patch: Partial<Track>) => void;
}) {
  const fx = trackEffects(track);
  return (
    <section className="beat-rack" aria-label="Beat processing">
      <span className="eyebrow">BEAT LAB</span>
      <h3>Shape the instrumental</h3>
      <div className="beat-presets">
        <button
          disabled={disabled}
          onClick={() =>
            update({ low: 0, high: 0, reverb: 0, fx: { ...DRY_EFFECTS } })
          }
        >
          Clean beat
        </button>
        <button
          disabled={disabled}
          onClick={() =>
            update({
              low: 4,
              high: 1,
              reverb: 0,
              fx: {
                ...DRY_EFFECTS,
                highpass: 25,
                compression: 0.35,
                drive: 0.12,
              },
            })
          }
        >
          808 weight
        </button>
        <button
          disabled={disabled}
          onClick={() =>
            update({
              low: 1,
              high: -3,
              reverb: 0.08,
              fx: {
                ...DRY_EFFECTS,
                highpass: 40,
                lowpass: 7000,
                compression: 0.25,
                drive: 0.28,
              },
            })
          }
        >
          Dusty tape
        </button>
      </div>
      {(
        [
          ["Low cut", "highpass", 20, 1500, 1],
          ["High cut", "lowpass", 2000, 22000, 100],
          ["Glue compression", "compression", 0, 1, 0.01],
          ["Saturation", "drive", 0, 1, 0.01],
        ] as const
      ).map(([label, key, min, max, step]) => (
        <label key={key}>
          {label}
          <output>
            {key.includes("pass")
              ? Math.round(fx[key]) + " Hz"
              : Math.round(fx[key] * 100) + "%"}
          </output>
          <input
            aria-label={"Beat " + label}
            type="range"
            disabled={disabled}
            min={min}
            max={max}
            step={step}
            value={fx[key]}
            onChange={(e) =>
              update({ fx: { ...fx, [key]: Number(e.target.value) } })
            }
          />
        </label>
      ))}
      <p className="hint">
        Only this beat track changes. Vocals keep their own processing.
      </p>
    </section>
  );
}
