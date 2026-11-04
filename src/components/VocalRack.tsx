"use client";
import type { Track } from "@/lib/model";
import {
  VOCAL_PRESETS,
  applyVocalPreset,
  matchingPreset,
  resetVocalEffects,
  trackEffects,
  type VocalEffects,
} from "@/lib/presets";
export default function VocalRack({
  track,
  disabled,
  update,
}: {
  track: Track;
  disabled: boolean;
  update: (patch: Partial<Track>) => void;
}) {
  const selected = matchingPreset(track),
    fx = trackEffects(track);
  const dry =
    track.low === 0 &&
    track.high === 0 &&
    track.reverb === 0 &&
    fx.highpass === 20 &&
    fx.lowpass === 22000 &&
    fx.compression === 0 &&
    fx.drive === 0 &&
    fx.delay === 0;
  const apply = (next: Track) =>
    update({
      low: next.low,
      high: next.high,
      reverb: next.reverb,
      fx: next.fx,
    });
  const shape = (key: keyof VocalEffects, value: number) =>
    update({ fx: { ...fx, [key]: value } });
  return (
    <section className="vocal-rack" aria-label="Vocal and adlib presets">
      <div className="rack-title">
        <span>UNDERGROUND</span>
        <small>VOCALS / ADLIBS</small>
      </div>
      <label className="preset-picker">
        Sound preset
        <select
          aria-label="Vocal or adlib preset"
          disabled={disabled}
          value={selected?.id ?? "custom"}
          onChange={(e) => apply(applyVocalPreset(track, e.target.value))}
        >
          <option value="custom" disabled>
            {dry ? "Dry / no effects" : "Custom settings"}
          </option>
          {(["Vocals", "Adlibs"] as const).map((group) => (
            <optgroup
              label={
                group === "Vocals" ? "Lead vocals" : "Adlibs & backing vocals"
              }
              key={group}
            >
              {VOCAL_PRESETS.filter((p) => p.category === group).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <p className="preset-description" role="status">
        {selected?.description ??
          "Choose a sound for this track, then shape it to your voice."}
      </p>
      <div className="rack-footer">
        <span>{selected?.category ?? "CUSTOM SOUND"}</span>
        <button
          disabled={disabled}
          onClick={() => apply(resetVocalEffects(track))}
        >
          Reset FX
        </button>
      </div>
      <details className="fx-details">
        <summary>Shape this sound</summary>
        {(
          [
            [
              "Low cut",
              "highpass",
              20,
              1500,
              5,
              `${Math.round(fx.highpass)} Hz`,
            ],
            [
              "High cut",
              "lowpass",
              2000,
              22000,
              100,
              `${(fx.lowpass / 1000).toFixed(1)} kHz`,
            ],
            [
              "Compression",
              "compression",
              0,
              1,
              0.01,
              `${Math.round(fx.compression * 100)}%`,
            ],
            [
              "Vocal drive",
              "drive",
              0,
              1,
              0.01,
              `${Math.round(fx.drive * 100)}%`,
            ],
            ["Echo mix", "delay", 0, 1, 0.01, `${Math.round(fx.delay * 100)}%`],
            [
              "Echo time",
              "delayTime",
              0.025,
              0.75,
              0.005,
              `${Math.round(fx.delayTime * 1000)} ms`,
            ],
            [
              "Echo feedback",
              "feedback",
              0,
              0.65,
              0.01,
              `${Math.round(fx.feedback * 100)}%`,
            ],
            [
              "Echo width",
              "width",
              0,
              1,
              0.01,
              `${Math.round(fx.width * 100)}%`,
            ],
          ] as const
        ).map(([label, key, min, max, step, display]) => (
          <label className="slider" key={key}>
            <span>
              {label}
              <output>{display}</output>
            </span>
            <input
              aria-label={label}
              type="range"
              min={min}
              max={max}
              step={step}
              value={fx[key]}
              disabled={disabled}
              onChange={(e) => shape(key, Number(e.target.value))}
            />
          </label>
        ))}
      </details>
      <p className="rack-note">
        Applies to the selected track. Original audio stays intact. Use NOIR
        Pitch Lock below for optional pitch correction.
      </p>
    </section>
  );
}
