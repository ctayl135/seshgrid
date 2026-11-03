"use client";
import { useEffect, useRef } from "react";
export default function Waveform({
  buffer,
  offset,
  duration,
}: {
  buffer?: AudioBuffer;
  offset: number;
  duration: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !buffer) return;
    const draw = () => {
      const w = Math.max(1, canvas.clientWidth),
        h = 48;
      canvas.width = w * devicePixelRatio;
      canvas.height = h * devicePixelRatio;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(devicePixelRatio, devicePixelRatio);
      ctx.strokeStyle = "rgba(255,255,255,.75)";
      ctx.lineWidth = 1;
      const data = buffer.getChannelData(0),
        start = Math.floor(offset * buffer.sampleRate),
        length = duration * buffer.sampleRate;
      ctx.beginPath();
      for (let x = 0; x < w; x++) {
        const a = start + Math.floor((x / w) * length),
          b = Math.min(data.length, start + Math.ceil(((x + 1) / w) * length));
        let peak = 0;
        for (let i = a; i < b; i += Math.max(1, Math.floor((b - a) / 64)))
          peak = Math.max(peak, Math.abs(data[i]));
        ctx.moveTo(x, h / 2 - peak * h * 0.45);
        ctx.lineTo(x, h / 2 + peak * h * 0.45);
      }
      ctx.stroke();
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [buffer, offset, duration]);
  return <canvas ref={ref} aria-hidden="true" />;
}
