import { mkdir, writeFile } from "node:fs/promises";
import { newProject, newTrack, addRecordingTake } from "../src/lib/model.ts";
import { stockPlugins } from "../src/lib/stock-plugins.ts";
import { encodeWav } from "../src/lib/wav.ts";
import { packSession } from "../src/lib/portable.ts";
const rate = 44100,
  p = newProject(),
  beat = newTrack("Synthetic beat"),
  vocal = newTrack("Synthetic vocal takes");
p.name = "NOIR stock plugin demo";
beat.role = "beat";
beat.gain = 0.5;
vocal.gain = 0.7;
vocal.plugins = stockPlugins();
vocal.plugins.pitch = {
  enabled: true,
  root: 0,
  scale: "major",
  strength: 1,
  retune: 0,
};
const assets = [];
const asset = (hz, seconds, amp) => {
  const id = crypto.randomUUID(),
    samples = Float32Array.from(
      { length: rate * seconds },
      (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / rate),
    );
  assets.push({
    id,
    blob: new Blob([encodeWav([samples], rate)], { type: "audio/wav" }),
  });
  return id;
};
beat.clips = [
  {
    id: crypto.randomUUID(),
    assetId: asset(110, 4, 0.08),
    start: 0,
    offset: 0,
    duration: 4,
  },
];
let takes = vocal;
for (const hz of [455, 470])
  takes = addRecordingTake(takes, {
    id: crypto.randomUUID(),
    assetId: asset(hz, 2, 0.18),
    start: 0.5,
    offset: 0,
    duration: 2,
  });
p.tracks = [beat, takes];
await mkdir("test-results", { recursive: true });
await writeFile(
  "test-results/noir-plugin-demo.sesh",
  Buffer.from(await packSession({ project: p, assets }).arrayBuffer()),
);
console.log(
  "Generated test-results/noir-plugin-demo.sesh with synthetic audio only.",
);
