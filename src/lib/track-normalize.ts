import type { Track } from "./model";
import { normalizationLevel } from "./normalize";
export function normalizedTrackClips(
  track: Track,
  buffers: Map<string, AudioBuffer>,
  targetDb = -1,
) {
  return track.clips.map((c) => {
    const b = buffers.get(c.assetId);
    if (!b)
      throw new Error(
        "Source audio is missing. Reopen the project before normalizing.",
      );
    return {
      ...c,
      level: normalizationLevel(
        Array.from({ length: b.numberOfChannels }, (_, i) =>
          b.getChannelData(i),
        ),
        b.sampleRate,
        c,
        targetDb,
      ),
    };
  });
}
