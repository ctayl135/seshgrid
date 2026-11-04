"use client";
import type { Track } from "@/lib/model";
export default function VolumeMotion({
  track,
  disabled,
  start,
  end,
  update,
}: {
  track: Track;
  disabled: boolean;
  start: number;
  end: number;
  update: (p: Partial<Track>) => void;
}) {
  const m = track.volumeMotion;
  const create = (shape: "fade-in" | "fade-out" | "duck") => {
    const duration = Math.max(0.25, end - start);
    update({
      volumeMotion: {
        id: m?.id ?? crypto.randomUUID(),
        start,
        duration,
        points:
          shape === "duck"
            ? [
                { time: 0, value: 1 },
                { time: duration * 0.25, value: 0.25 },
                { time: duration * 0.75, value: 0.25 },
                { time: duration, value: 1 },
              ]
            : [
                { time: 0, value: shape === "fade-in" ? 0 : 1 },
                { time: duration, value: shape === "fade-in" ? 1 : 0 },
              ],
      },
    });
  };
  return (
    <section className="stock-rack" aria-label="Volume Motion">
      <h3>Volume Motion</h3>
      <p>
        Make this track fade, swell or duck automatically over time. It
        multiplies the track volume and is included in playback and exports.
      </p>
      <div className="plugin-presets">
        <button disabled={disabled} onClick={() => create("fade-in")}>
          {m ? "Fade in" : "Create Volume Motion"}
        </button>
        <button disabled={disabled} onClick={() => create("fade-out")}>
          Fade out
        </button>
        <button disabled={disabled} onClick={() => create("duck")}>
          Duck and return
        </button>
      </div>
      {m && (
        <>
          <label>
            Motion start (s)
            <input
              aria-label="Motion start"
              type="number"
              min={0}
              max={14400}
              step={0.01}
              value={m.start}
              disabled={disabled}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n >= 0 && n <= 14400)
                  update({ volumeMotion: { ...m, start: n } });
              }}
            />
          </label>
          <label>
            Motion length (s)
            <input
              aria-label="Motion length"
              type="number"
              min={0.25}
              max={14400}
              step={0.25}
              value={m.duration}
              disabled={disabled}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n >= 0.25 && n <= 14400)
                  update({
                    volumeMotion: {
                      ...m,
                      duration: n,
                      points: m.points.map((p) => ({
                        ...p,
                        time: (p.time / m.duration) * n,
                      })),
                    },
                  });
              }}
            />
          </label>
          <svg
            viewBox="0 0 240 100"
            role="img"
            aria-label="Volume Motion curve"
            style={{
              width: "100%",
              background: "#11190e",
              border: "1px solid #50603b",
            }}
            onClick={(e) => {
              if (disabled || m.points.length >= 64) return;
              const r = e.currentTarget.getBoundingClientRect(),
                time = Math.max(
                  0,
                  Math.min(
                    m.duration,
                    ((e.clientX - r.left) / r.width) * m.duration,
                  ),
                ),
                value = Math.max(
                  0,
                  Math.min(1, 1 - (e.clientY - r.top) / r.height),
                );
              if (m.points.some((p) => Math.abs(p.time - time) < 0.01)) return;
              update({
                volumeMotion: {
                  ...m,
                  points: [...m.points, { time, value }].sort(
                    (a, b) => a.time - b.time,
                  ),
                },
              });
            }}
          >
            <polyline
              fill="none"
              stroke="#c4fa70"
              strokeWidth="2"
              points={m.points
                .map(
                  (p) =>
                    `${(p.time / m.duration) * 240},${(1 - p.value) * 100}`,
                )
                .join(" ")}
            />
            {m.points.map((p, i) => (
              <circle
                key={i}
                cx={(p.time / m.duration) * 240}
                cy={(1 - p.value) * 100}
                r={3}
                fill="#c4fa70"
              />
            ))}
          </svg>
          <p>
            Click the curve to add a point, then adjust it below. Outside the
            motion clip, volume returns to 100%.
          </p>
          {m.points.map((p, i) => (
            <div key={i} className="motion-point">
              <label>
                Point {i + 1} time
                <input
                  aria-label={"Motion point " + (i + 1) + " time"}
                  type="number"
                  step={0.01}
                  min={i ? m.points[i - 1].time + 0.001 : 0}
                  max={
                    i < m.points.length - 1
                      ? m.points[i + 1].time - 0.001
                      : m.duration
                  }
                  value={p.time}
                  disabled={disabled || i === 0 || i === m.points.length - 1}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (n > m.points[i - 1].time && n < m.points[i + 1].time)
                      update({
                        volumeMotion: {
                          ...m,
                          points: m.points.map((v, j) =>
                            i === j ? { ...v, time: n } : v,
                          ),
                        },
                      });
                  }}
                />
              </label>
              <label>
                Volume {Math.round(p.value * 100)}%
                <input
                  aria-label={"Motion point " + (i + 1) + " volume"}
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={p.value}
                  disabled={disabled}
                  onChange={(e) =>
                    update({
                      volumeMotion: {
                        ...m,
                        points: m.points.map((v, j) =>
                          i === j ? { ...v, value: Number(e.target.value) } : v,
                        ),
                      },
                    })
                  }
                />
              </label>
              <button
                disabled={disabled || i === 0 || i === m.points.length - 1}
                onClick={() =>
                  update({
                    volumeMotion: {
                      ...m,
                      points: m.points.filter((_, j) => i !== j),
                    },
                  })
                }
              >
                Remove point {i + 1}
              </button>
            </div>
          ))}
          <button
            disabled={disabled}
            onClick={() => update({ volumeMotion: undefined })}
          >
            Remove Volume Motion
          </button>
        </>
      )}
    </section>
  );
}
