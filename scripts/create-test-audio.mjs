import { mkdir, writeFile } from "node:fs/promises";
await mkdir("test-results", { recursive: true });
for (const [name, freq] of [
  ["test-beat", 220],
  ["test-vocal", 440],
]) {
  const frames = 44100 * 3,
    b = Buffer.alloc(44 + frames * 2);
  b.write("RIFF");
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WAVE", 8);
  b.write("fmt ", 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(44100, 24);
  b.writeUInt32LE(88200, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++)
    b.writeInt16LE(
      Math.round(
        Math.sin((2 * Math.PI * freq * i) / 44100) *
          6000 *
          Math.min(1, i / 441, (frames - i) / 441),
      ),
      44 + i * 2,
    );
  await writeFile(`test-results/${name}.wav`, b);
}
console.log("Created two three-second audio fixtures in test-results.");
