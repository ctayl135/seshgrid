"use client";
import { useEffect, useRef, useState } from "react";
import { AudioEngine } from "@/lib/audio";
import { projectEnd, validateProject, type Project } from "@/lib/model";
import { listLocal, loadCloud, type SavedSession } from "@/lib/storage";
import { PlaylistPlayer, type PlaylistState } from "@/lib/playlist";
type Entry = {
  id: string;
  name: string;
  date: string;
  source: string;
  load: () => Promise<SavedSession>;
};
export default function ProjectLibrary({
  local,
  cloud,
  userId,
  open,
}: {
  local: SavedSession[];
  cloud: { id: string; name: string; updated_at: string }[];
  userId?: string;
  open: (load: () => Promise<SavedSession>) => void;
}) {
  const entries = new Map<string, Entry>();
  for (const s of local)
    entries.set(s.project.id, {
      id: s.project.id,
      name: s.project.name,
      date: s.project.updatedAt,
      source: "This browser",
      load: async () => {
        const session = (await listLocal()).find(
          (item) => item.project.id === s.project.id,
        );
        if (!session)
          throw new Error("Project is no longer saved in this browser.");
        return session;
      },
    });
  for (const s of cloud)
    if (
      userId &&
      (!entries.has(s.id) ||
        Date.parse(s.updated_at) > Date.parse(entries.get(s.id)!.date))
    )
      entries.set(s.id, {
        id: s.id,
        name: s.name,
        date: s.updated_at,
        source: "Private cloud",
        load: () => loadCloud(s.id, userId),
      });
  const catalog = useRef(entries);
  catalog.current = entries;
  const audio = useRef<AudioEngine | null>(null),
    prepared = useRef<Project | null>(null);
  const [state, setState] = useState<PlaylistState>({
      queue: [],
      index: -1,
      status: "idle",
      error: "",
    }),
    [search, setSearch] = useState("");
  const [player] = useState(
    () =>
      new PlaylistPlayer(
        {
          ready: async () => {
            audio.current ??= new AudioEngine();
            await audio.current.ready();
          },
          prepare: async (item, current) => {
            const entry = catalog.current.get(item.id);
            if (!entry)
              throw new Error(
                "Project is unavailable. Refresh the projects list.",
              );
            const session = await entry.load();
            if (!current()) return;
            const project = validateProject(session.project);
            if (!projectEnd(project))
              throw new Error(
                "This project has no audio yet. Choose another song.",
              );
            const buffers = new Map<string, AudioBuffer>();
            for (const asset of session.assets) {
              const buffer = await audio.current!.context!.decodeAudioData(
                await asset.blob.arrayBuffer(),
              );
              if (!current()) return;
              buffers.set(asset.id, buffer);
            }
            for (const track of project.tracks)
              for (const clip of track.clips) {
                const buffer = buffers.get(clip.assetId);
                if (
                  !buffer ||
                  clip.offset + clip.duration > buffer.duration + 0.01
                )
                  throw new Error(
                    "Project audio is missing or damaged. Open a backup or skip this song.",
                  );
              }
            if (current()) {
              audio.current!.buffers = buffers;
              prepared.current = project;
            }
          },
          play: async (from, ended) => {
            await audio.current!.play(prepared.current!, from, ended);
          },
          stop: () => audio.current?.stop(),
          time: () => audio.current?.time() ?? 0,
        },
        setState,
      ),
  );
  useEffect(
    () => () => {
      player.stop();
      void audio.current?.context?.close();
      audio.current = null;
    },
    [player],
  );
  const songs = [...entries.values()]
      .sort((a, b) => b.date.localeCompare(a.date))
      .filter((s) => s.name.toLowerCase().includes(search.toLowerCase())),
    active = state.status === "playing" || state.status === "loading",
    current = state.queue[state.index];
  return (
    <div className="project-library">
      <section className="library-songs" aria-label="Saved song library">
        <div className="library-heading">
          <div>
            <span className="eyebrow">YOUR MUSIC</span>
            <h3>Saved projects</h3>
          </div>
          <button
            disabled={!songs.length}
            onClick={() => {
              player.replace(songs);
              void player.play(0);
            }}
          >
            ▶ Play all
          </button>
        </div>
        <input
          aria-label="Search projects"
          placeholder="Search your projects"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <p className="library-hint">
          Listen to saved mixes without changing your studio session. The newest
          saved copy of each project appears here.
        </p>
        {songs.map((song) => (
          <article className="library-song" key={song.id}>
            <div>
              <strong>{song.name}</strong>
              <small>
                {song.source} · {new Date(song.date).toLocaleString()}
              </small>
            </div>
            <div className="song-actions">
              <button
                aria-label={"Play " + song.name}
                onClick={() => {
                  player.replace([song]);
                  void player.play(0);
                }}
              >
                ▶
              </button>
              <button
                aria-label={"Queue " + song.name}
                disabled={state.queue.some((q) => q.id === song.id)}
                onClick={() => player.append(song)}
              >
                ＋ Queue
              </button>
              <button
                aria-label={"Open " + song.name + " in studio"}
                onClick={() => {
                  player.stop();
                  open(song.load);
                }}
              >
                Open
              </button>
            </div>
          </article>
        ))}
        {!songs.length && (
          <p>
            {entries.size
              ? "No projects match your search."
              : "Save a project in the studio to start your playlist."}
          </p>
        )}
      </section>
      <section className="playlist-panel" aria-label="Project playlist">
        <span className="eyebrow">LISTEN BACK</span>
        <h3>Your playlist</h3>
        <p role="status">
          {state.status === "loading"
            ? "Loading: "
            : state.status === "paused"
              ? "Paused: "
              : state.status === "playing"
                ? "Now playing: "
                : state.status === "ended"
                  ? "Playlist finished: "
                  : "Ready: "}
          {current?.name ?? "Add your saved songs"}
        </p>
        <div className="playlist-controls">
          <button
            disabled={!state.queue.length || state.status === "loading"}
            onClick={() =>
              state.status === "playing" ? player.pause() : void player.resume()
            }
          >
            {state.status === "playing"
              ? "Pause playlist"
              : state.status === "paused"
                ? "Resume playlist"
                : "Play playlist"}
          </button>
          <button
            disabled={state.index + 1 >= state.queue.length}
            onClick={() => void player.next()}
          >
            Next song
          </button>
          <button
            disabled={state.status === "idle"}
            onClick={() => player.stop()}
          >
            Stop playlist
          </button>
        </div>
        {state.error && (
          <p className="playlist-error" role="alert">
            {state.error} Choose another song, retry, or use Next song to
            continue.
          </p>
        )}
        <ol>
          {state.queue.map((item, index) => (
            <li
              key={item.id}
              aria-current={index === state.index ? "true" : undefined}
            >
              <button
                className="queue-title"
                onClick={() => void player.play(index)}
              >
                {index + 1}. {item.name}
                {index === state.index && state.status === "playing"
                  ? " · Playing"
                  : ""}
              </button>
              <button
                aria-label={"Move " + item.name + " up"}
                disabled={active || index === 0}
                onClick={() => {
                  const q = [...state.queue];
                  [q[index - 1], q[index]] = [q[index], q[index - 1]];
                  player.replace(q);
                }}
              >
                ↑
              </button>
              <button
                aria-label={"Remove " + item.name + " from playlist"}
                disabled={active}
                onClick={() =>
                  player.replace(state.queue.filter((i) => i.id !== item.id))
                }
              >
                ×
              </button>
            </li>
          ))}
        </ol>
        {!state.queue.length && (
          <p>Choose ＋ Queue, or Play all to hear every saved song.</p>
        )}
        <small>
          Automatically plays the next song after the current mix and effect
          tail finish. Closing Projects stops the playlist. Queue order lasts
          while this view is open.
        </small>
      </section>
    </div>
  );
}
