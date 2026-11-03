import { validateProject, type Asset } from "./model";
import type { SavedSession } from "./storage";
const MAGIC = "SESHGRID";
export function packSession(session: SavedSession): Blob {
  const manifest = new TextEncoder().encode(
    JSON.stringify({
      project: session.project,
      assets: session.assets.map((a) => ({
        id: a.id,
        size: a.blob.size,
        type: a.blob.type,
      })),
    }),
  );
  const header = new Uint8Array(12);
  header.set(new TextEncoder().encode(MAGIC));
  new DataView(header.buffer).setUint32(8, manifest.length, true);
  return new Blob([header, manifest, ...session.assets.map((a) => a.blob)], {
    type: "application/x-seshgrid",
  });
}
export async function unpackSession(file: Blob): Promise<SavedSession> {
  if (file.size > 512 * 1024 * 1024 || file.size < 12)
    throw new Error("Invalid project file size");
  const header = await file.slice(0, 12).arrayBuffer();
  if (new TextDecoder().decode(header.slice(0, 8)) !== MAGIC)
    throw new Error("This is not a SeshGrid project file");
  const manifestSize = new DataView(header).getUint32(8, true);
  if (manifestSize > 4 * 1024 * 1024 || manifestSize + 12 > file.size)
    throw new Error("Invalid project manifest size");
  const manifest = JSON.parse(await file.slice(12, 12 + manifestSize).text()),
    project = validateProject(manifest.project),
    assets: Asset[] = [],
    ids = new Set<string>();
  if (!Array.isArray(manifest.assets))
    throw new Error("Invalid project assets");
  let offset = 12 + manifestSize;
  for (const a of manifest.assets) {
    if (
      !a ||
      typeof a.id !== "string" ||
      !/^[a-f0-9-]{36}$/.test(a.id) ||
      ids.has(a.id) ||
      !Number.isSafeInteger(a.size) ||
      a.size < 1 ||
      a.size > 50 * 1024 * 1024 ||
      typeof a.type !== "string" ||
      offset + a.size > file.size
    )
      throw new Error("Invalid project audio");
    ids.add(a.id);
    assets.push({
      id: a.id,
      blob: file.slice(offset, offset + a.size, a.type),
    });
    offset += a.size;
  }
  if (
    offset !== file.size ||
    project.tracks.some((t) => t.clips.some((c) => !ids.has(c.assetId)))
  )
    throw new Error("Project audio is missing or damaged");
  return { project, assets };
}
