"use client";
import { useEffect, useState } from "react";
import { peakDb } from "@/lib/meter";
export default function LevelMeter({
  label,
  active,
  read,
}: {
  label: string;
  active: boolean;
  read: () => number;
}) {
  const [level, setLevel] = useState({ peak: 0, clipped: false });
  useEffect(() => {
    if (!active) {
      setLevel({ peak: 0, clipped: false });
      return;
    }
    let clipUntil = 0;
    const timer = setInterval(() => {
      const peak = read();
      if (peak >= 0.99) clipUntil = Date.now() + 2000;
      setLevel({ peak, clipped: Date.now() < clipUntil });
    }, 80);
    return () => clearInterval(timer);
  }, [active, read]);
  const db = peakDb(level.peak),
    width = Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
  return (
    <div className="level-meter" aria-label={label + " level"}>
      <span>{label}</span>
      <div
        className="level-bar"
        role="meter"
        aria-label={label + " peak"}
        aria-valuemin={-60}
        aria-valuemax={0}
        aria-valuenow={Math.min(0, Math.max(-60, db))}
      >
        <i style={{ width: width + "%" }} />
      </div>
      <output
        aria-live="off"
        className={level.clipped ? "meter-clip" : undefined}
      >
        {level.clipped
          ? "CLIP"
          : active && db > -60
            ? db.toFixed(1) + " dBFS"
            : "—"}
      </output>
    </div>
  );
}
