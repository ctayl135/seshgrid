import { mkdir, copyFile } from "node:fs/promises";
await mkdir("public/codecs", { recursive: true });
for (const file of ["ffmpeg-core.js", "ffmpeg-core.wasm"])
  await copyFile(
    "node_modules/@ffmpeg/core/dist/umd/" + file,
    "public/codecs/" + file,
  );
console.log("Browser audio codecs prepared.");
