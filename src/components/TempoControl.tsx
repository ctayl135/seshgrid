"use client";
import { useEffect, useState } from "react";
export default function TempoControl({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled: boolean;
  onChange: (bpm: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  return (
    <label className="number-field">
      BPM
      <input
        aria-label="Session BPM"
        type="number"
        inputMode="decimal"
        min={30}
        max={300}
        step={0.1}
        disabled={disabled}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value && Number.isFinite(n) && n >= 30 && n <= 300)
            onChange(Math.round(n * 10) / 10);
        }}
        onBlur={() => {
          const n = Number(draft);
          if (!draft || !Number.isFinite(n) || n < 30 || n > 300)
            setDraft(String(value));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(String(value));
            e.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}
