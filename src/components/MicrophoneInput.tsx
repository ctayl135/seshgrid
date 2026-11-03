"use client";
import { useCallback, useEffect, useState } from "react";
export default function MicrophoneInput({
  value,
  onChange,
  disabled,
  revision,
}: {
  value: string;
  onChange: (id: string) => void;
  disabled: boolean;
  revision: boolean;
}) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]),
    [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices)
        throw new Error(
          "Microphone selection requires HTTPS and a supported browser.",
        );
      const inputs = (await navigator.mediaDevices.enumerateDevices()).filter(
        (d) => d.kind === "audioinput" && d.deviceId,
      );
      setDevices(inputs);
      setError("");
    } catch {
      setError("Could not list microphones. Default input is still available.");
    }
  }, []);
  useEffect(() => {
    void refresh();
    navigator.mediaDevices?.addEventListener?.("devicechange", refresh);
    return () =>
      navigator.mediaDevices?.removeEventListener?.("devicechange", refresh);
  }, [refresh, revision]);
  return (
    <div className="microphone-input">
      <label>
        Microphone
        <select
          aria-label="Recording microphone"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">System default</option>
          {value && !devices.some((d) => d.deviceId === value) && (
            <option value={value}>Selected input unavailable</option>
          )}
          {devices.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || "Microphone " + (i + 1)}
            </option>
          ))}
        </select>
      </label>
      <button
        disabled={disabled}
        onClick={() => void refresh()}
        title="Refresh microphone list"
      >
        Refresh inputs
      </button>
      <small>
        {error ||
          "Device names appear after microphone permission. Use headphones; input is not played through speakers."}
      </small>
    </div>
  );
}
