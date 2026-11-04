/* Isolated, single-thread FFmpeg worker. No audio is sent to a server. */
importScripts("/codecs/ffmpeg-core.js");
self.onmessage = async ({ data }) => {
  let core;
  try {
    core = await createFFmpegCore({
      mainScriptUrlOrBlob:
        location.origin +
        "/codecs/ffmpeg-core.js#" +
        btoa(
          JSON.stringify({
            wasmURL: location.origin + "/codecs/ffmpeg-core.wasm",
          }),
        ),
    });
    core.FS.writeFile("input.bin", new Uint8Array(data.bytes));
    const formats = {
      wav: ["pcm_s16le"],
      mp3: ["libmp3lame", "-b:a", "192k"],
      m4a: ["aac", "-b:a", "192k"],
      flac: ["flac"],
      ogg: ["libvorbis", "-q:a", "5"],
      opus: ["libopus", "-b:a", "160k"],
      aac: ["aac", "-b:a", "192k"],
      aiff: ["pcm_s16be"],
    };
    if (!formats[data.format]) throw Error("Unsupported export format");
    const name = "output." + data.format;
    const code = core.exec(
      "-y",
      "-i",
      "input.bin",
      "-vn",
      "-map_metadata",
      "-1",
      "-ac",
      "2",
      "-ar",
      data.format === "opus" ? "48000" : "44100",
      "-c:a",
      ...formats[data.format],
      name,
    );
    if (code !== 0)
      throw Error(
        "This audio file could not be converted. Try another format or a shorter file.",
      );
    const bytes = core.FS.readFile(name);
    const result = bytes.slice().buffer;
    self.postMessage({ bytes: result }, [result]);
  } catch (e) {
    self.postMessage({ error: e.message || "Audio conversion failed" });
  }
};
