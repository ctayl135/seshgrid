"use client";
import type { Track } from "@/lib/model";
import {
  UNDERGROUND_PRESETS,
  applyUndergroundPreset,
} from "@/lib/underground-presets";
import { TUNE_STYLES, applyTuneStyle } from "@/lib/tune-presets";
import {
  stockPlugins,
  DEFAULT_PLUGINS,
  type StockPlugins,
} from "@/lib/stock-plugins";
export default function StockRack({
  track,
  disabled,
  update,
}: {
  track: Track;
  disabled: boolean;
  update: (patch: Partial<Track>) => void;
}) {
  const p = stockPlugins(track.plugins),
    patch = (v: Partial<StockPlugins>) => update({ plugins: { ...p, ...v } }),
    pitch = (v: Partial<StockPlugins["pitch"]>) =>
      patch({ pitch: { ...p.pitch, ...v } }),
    off = disabled || p.bypass;
  return (
    <section className="stock-rack" aria-label="Stock plugin rack">
      <div className="rack-title">
        <strong>STOCK PLUGINS</strong>
        <button
          disabled={disabled}
          aria-pressed={p.bypass}
          onClick={() => patch({ bypass: !p.bypass })}
        >
          Bypass rack
        </button>
      </div>
      <details open>
        <summary>Underground preset library</summary>
        <p>
          Original artist-inspired starting points, not official artist settings
          or endorsements. Choose your song’s key below.
        </p>
        <select
          aria-label="Underground preset"
          disabled={disabled}
          value=""
          onChange={(e) => {
            if (e.target.value)
              update(applyUndergroundPreset(track, e.target.value));
          }}
        >
          <option value="">Choose vocal or adlib preset…</option>
          {(["Vocals", "Adlibs"] as const).map((category) => (
            <optgroup key={category} label={category}>
              {UNDERGROUND_PRESETS.filter((p) => p.category === category).map(
                (p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ),
              )}
            </optgroup>
          ))}
        </select>
        <a href="/presets" target="_blank" rel="noreferrer">
          Browse all presets ↗
        </a>
      </details>
      <details open>
        <summary>Tuning studio · six vocal chains</summary>
        <p>
          Choose a character, then set your song’s key and scale below. These
          chains replace this channel’s effects and preserve its volume and pan.
        </p>
        {TUNE_STYLES.map((s) => (
          <button
            key={s.name}
            disabled={disabled}
            title={s.description}
            onClick={() => update(applyTuneStyle(track, s.name))}
          >
            {s.name}
          </button>
        ))}
      </details>
      <div className="plugin-presets">
        <button
          disabled={disabled}
          onClick={() =>
            patch({
              gateDb: -45,
              deEss: 0.4,
              midGain: 1.5,
              midFreq: 2500,
              bypass: false,
            })
          }
        >
          Vocal clean-up
        </button>
        <button
          disabled={disabled}
          onClick={() =>
            patch({
              bypass: false,
              pitch: {
                ...p.pitch,
                enabled: true,
                scale: "chromatic",
                strength: 1,
                retune: 0,
              },
            })
          }
        >
          Hard tune
        </button>
        <button
          disabled={disabled}
          onClick={() =>
            patch({
              bypass: false,
              pitch: {
                ...p.pitch,
                enabled: true,
                scale: "minor",
                strength: 0.85,
                retune: 90,
              },
            })
          }
        >
          Smooth minor
        </button>
      </div>
      <details open>
        <summary>01 · NOIR Pitch Lock</summary>
        <button
          disabled={off}
          aria-pressed={p.pitch.enabled}
          onClick={() => pitch({ enabled: !p.pitch.enabled })}
        >
          {p.pitch.enabled ? "Pitch correction on" : "Enable pitch correction"}
        </button>
        <label>
          Key
          <select
            aria-label="Pitch key"
            value={p.pitch.root}
            disabled={off}
            onChange={(e) => pitch({ root: Number(e.target.value) })}
          >
            {[
              "C",
              "C♯",
              "D",
              "D♯",
              "E",
              "F",
              "F♯",
              "G",
              "G♯",
              "A",
              "A♯",
              "B",
            ].map((n, i) => (
              <option key={n} value={i}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          Scale
          <select
            aria-label="Pitch scale"
            value={p.pitch.scale}
            disabled={off}
            onChange={(e) =>
              pitch({ scale: e.target.value as StockPlugins["pitch"]["scale"] })
            }
          >
            <option value="chromatic">Chromatic</option>
            <option value="major">Major</option>
            <option value="minor">Natural minor</option>
          </select>
        </label>
        <label>
          Correction <output>{Math.round(p.pitch.strength * 100)}%</output>
          <input
            aria-label="Pitch correction amount"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={p.pitch.strength}
            disabled={off}
            onChange={(e) => pitch({ strength: Number(e.target.value) })}
          />
        </label>
        <label>
          Retune speed <output>{p.pitch.retune} ms</output>
          <input
            aria-label="Retune speed"
            type="range"
            min={0}
            max={300}
            step={5}
            value={p.pitch.retune}
            disabled={off}
            onChange={(e) => pitch({ retune: Number(e.target.value) })}
          />
        </label>
        <p>
          For monophonic vocals. Applies to playback and export; your recorded
          source stays raw.
        </p>
      </details>
      <details>
        <summary>02 · Clean Gate</summary>
        <button
          disabled={off}
          onClick={() => patch({ gateDb: p.gateDb === 0 ? -45 : 0 })}
        >
          {p.gateDb === 0 ? "Enable noise gate" : "Gate on"}
        </button>
        <label>
          Threshold <output>{p.gateDb || -45} dBFS</output>
          <input
            aria-label="Gate threshold"
            type="range"
            min={-80}
            max={-10}
            value={p.gateDb || -45}
            disabled={off || p.gateDb === 0}
            onChange={(e) => patch({ gateDb: Number(e.target.value) })}
          />
        </label>
      </details>
      <details>
        <summary>03 · De-esser</summary>
        <label>
          Sibilance reduction <output>{Math.round(p.deEss * 100)}%</output>
          <input
            aria-label="De-esser amount"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={p.deEss}
            disabled={off}
            onChange={(e) => patch({ deEss: Number(e.target.value) })}
          />
        </label>
      </details>
      <details>
        <summary>04 · Presence EQ</summary>
        <label>
          Mid gain <output>{p.midGain} dB</output>
          <input
            aria-label="Presence gain"
            type="range"
            min={-12}
            max={12}
            step={0.5}
            value={p.midGain}
            disabled={off}
            onChange={(e) => patch({ midGain: Number(e.target.value) })}
          />
        </label>
        <label>
          Frequency <output>{p.midFreq} Hz</output>
          <input
            aria-label="Presence frequency"
            type="range"
            min={200}
            max={8000}
            step={100}
            value={p.midFreq}
            disabled={off}
            onChange={(e) => patch({ midFreq: Number(e.target.value) })}
          />
        </label>
      </details>
      <p>
        Compressor, saturation, reverb and stereo delay are in the vocal/beat
        racks above. Stop playback before changing stock processing. Live
        microphone monitoring stays off.
      </p>
      <details open>
        <summary>05 · Color effects</summary>
        {(["chorus", "tremolo", "crush"] as const).map((name) => (
          <label key={name}>
            {name === "chorus"
              ? "Chorus doubler"
              : name === "tremolo"
                ? "Tremolo pulse"
                : "Digital crusher"}{" "}
            <output>{Math.round((p[name] ?? 0) * 100)}%</output>
            <input
              aria-label={name}
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={p[name] ?? 0}
              disabled={off}
              onChange={(e) => patch({ [name]: Number(e.target.value) })}
            />
          </label>
        ))}
        <p>
          Chorus adds a modulated double; tremolo pulses at 5 Hz; crusher adds
          digital grit. All are included in export.
        </p>
      </details>
      <button
        disabled={disabled}
        onClick={() => update({ plugins: stockPlugins(DEFAULT_PLUGINS) })}
      >
        Reset stock plugins
      </button>
    </section>
  );
}
