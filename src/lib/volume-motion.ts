export type VolumeMotion = {
  id: string;
  start: number;
  duration: number;
  points: { time: number; value: number }[];
};
export function motionValue(m: VolumeMotion, time: number) {
  const x = time - m.start;
  if (x < 0 || x >= m.duration) return 1;
  for (let i = 1; i < m.points.length; i++) {
    const a = m.points[i - 1],
      b = m.points[i];
    if (x <= b.time)
      return a.value + ((b.value - a.value) * (x - a.time)) / (b.time - a.time);
  }
  return m.points[m.points.length - 1].value;
}
export function scheduleMotion(
  param: AudioParam,
  m: VolumeMotion | undefined,
  from: number,
  when: number,
) {
  if (!m) {
    param.setValueAtTime(1, when);
    return;
  }
  param.setValueAtTime(motionValue(m, from), when);
  if (m.start > from) {
    param.setValueAtTime(1, when + m.start - from);
    param.setValueAtTime(m.points[0].value, when + m.start - from);
  }
  for (const p of m.points) {
    const at = m.start + p.time;
    if (at > from && !(m.start > from && p.time === 0))
      param.linearRampToValueAtTime(p.value, when + at - from);
  }
  if (m.start + m.duration > from)
    param.setValueAtTime(1, when + m.start + m.duration - from);
}
