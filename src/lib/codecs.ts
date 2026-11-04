export const EXPORT_FORMATS = {
  wav: "WAV · lossless PCM",
  mp3: "MP3 · 192 kbps",
  m4a: "M4A · AAC 192 kbps",
  flac: "FLAC · lossless",
  ogg: "OGG · Vorbis",
  aac: "AAC · 192 kbps",
  aiff: "AIFF · lossless PCM",
} as const;
export type ExportFormat = keyof typeof EXPORT_FORMATS;
const MIME: Record<ExportFormat, string> = {
  wav: "audio/wav",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  flac: "audio/flac",
  ogg: "audio/ogg",
  aac: "audio/aac",
  aiff: "audio/aiff",
};
export async function convertAudio(
  blob: Blob,
  format: ExportFormat,
): Promise<Blob> {
  if (!(format in EXPORT_FORMATS))
    throw Error("Choose a supported audio format");
  if (!blob.size || blob.size > 256 * 1024 * 1024)
    throw Error(
      "Conversion supports audio up to 256 MB. Export a shorter song.",
    );
  const bytes = await blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const worker = new Worker("/audio-codec-worker.js");
    const finish = () => {
      clearTimeout(timer);
      worker.terminate();
    };
    const timer = setTimeout(() => {
      finish();
      reject(
        Error("Conversion took too long. Try a shorter song or WAV export."),
      );
    }, 180000);
    worker.onerror = () => {
      finish();
      reject(
        Error(
          "Could not load audio converter. Check your connection and try again.",
        ),
      );
    };
    worker.onmessage = ({ data }) => {
      finish();
      if (data.error) reject(Error(data.error));
      else resolve(new Blob([data.bytes], { type: MIME[format] }));
    };
    worker.postMessage({ bytes, format }, [bytes]);
  });
}
export async function decodeAudio(ctx: BaseAudioContext, blob: Blob) {
  try {
    return await ctx.decodeAudioData(await blob.arrayBuffer());
  } catch {
    const wav = await convertAudio(blob, "wav");
    return ctx.decodeAudioData(await wav.arrayBuffer());
  }
}
