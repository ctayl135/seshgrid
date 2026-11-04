"use client";
import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { AudioEngine } from "@/lib/audio";
import {
  newProject,
  newTrack,
  projectEnd,
  splitClip,
  validateProject,
  type Project,
  type Track,
  type Asset,
  type Clip,
} from "@/lib/model";
import {
  listLocal,
  saveLocal,
  listCloud,
  loadCloud,
  saveCloud,
  supabase,
  type SavedSession,
} from "@/lib/storage";
import { MicrophoneCapture } from "@/lib/capture";
import { packSession, unpackSession } from "@/lib/portable";
import Waveform from "./Waveform";
import VocalRack from "./VocalRack";
import BeatRack from "./BeatRack";
import PublishPanel from "./PublishPanel";
import InvitePanel from "./InvitePanel";
import { beatSession } from "@/lib/community";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { normalizationLevel } from "@/lib/normalize";
import LevelMeter from "./LevelMeter";
import ProjectLibrary from "./ProjectLibrary";
import MicrophoneInput from "./MicrophoneInput";
import { effectTail } from "@/lib/presets";
import { useProjectEditor } from "./useProjectEditor";
import { useSessionRecovery } from "./useSessionRecovery";
import { loadRecovery } from "@/lib/recovery";
const PX = 32;
const clock = (n: number) =>
  `${Math.floor(n / 60)
    .toString()
    .padStart(2, "0")}:${(n % 60).toFixed(2).padStart(5, "0")}`;
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
export default function Studio({
  initialSession,
  initialDialog,
}: {
  initialSession?: { id: string; source: string };
  initialDialog?: "auth" | "projects";
} = {}) {
  const router = useRouter();
  const cloudMeta = useRef<{
    id: string;
    ownerId?: string;
    cloudRevision?: number;
  }>({ id: "" });
  const [readOnly, setReadOnly] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const openedInitial = useRef(false);
  const editor = useProjectEditor(),
    project = editor.project,
    setProject = editor.reset;
  const [selected, select] = useState<string>(""),
    [clipId, selectClip] = useState(""),
    [position, setPosition] = useState(0),
    [playing, setPlaying] = useState(false),
    [recording, setRecording] = useState(false),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [message, setMessage] = useState(
      "Upload a beat or add a vocal track to start.",
    ),
    [error, setError] = useState(""),
    [user, setUser] = useState<User | null>(null),
    [modal, setModal] = useState<
      "projects" | "auth" | "publish" | "invite" | null
    >(null),
    [local, setLocal] = useState<SavedSession[]>([]),
    [cloud, setCloud] = useState<
      { id: string; name: string; updated_at: string }[]
    >([]),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  const [microphoneId, setMicrophoneId] = useState("");
  const readInputPeak = useRef(
    () => recorder.current?.capture.peak() ?? 0,
  ).current;
  const readMixPeak = useRef(() => engine.current?.peak() ?? 0).current;
  const [confirmation, setConfirmation] = useState<{
    message: string;
    resolve: (answer: boolean) => void;
  } | null>(null);
  const ask = (message: string) =>
    new Promise<boolean>((resolve) => setConfirmation({ message, resolve }));
  const navigate = async (path: string) => {
    if (recording || busy) return;
    if (
      dirty &&
      !(await ask(
        "Leave the studio with unsaved changes? Save or download a backup first if you need a permanent copy.",
      ))
    )
      return;
    router.push(path);
  };
  const engine = useRef<AudioEngine | null>(null),
    assets = useRef(new Map<string, Blob>()),
    fileInput = useRef<HTMLInputElement>(null),
    projectInput = useRef<HTMLInputElement>(null),
    recorder = useRef<{
      capture: MicrophoneCapture;
      track: string;
      start: number;
    } | null>(null),
    latest = useRef(project),
    recordFlag = useRef(false),
    transportFlag = useRef(false);
  latest.current = project;
  const recovery = useSessionRecovery(
    project,
    dirty,
    busy || recording,
    assets,
  );
  useEffect(() => {
    engine.current = new AudioEngine();
    setProject(newProject());
    const s = supabase;
    if (s)
      void s.auth
        .getUser()
        .then(({ data }) => setUser(data.user))
        .catch(() => setUser(null))
        .finally(() => setAuthReady(true));
    else setAuthReady(true);
    const sub = s?.auth.onAuthStateChange((_event, session) =>
      setUser(session?.user ?? null),
    );
    return () => {
      sub?.data.subscription.unsubscribe();
      recorder.current?.capture.dispose();
      engine.current?.stop();
      void engine.current?.context?.close();
    };
  }, []);
  useEffect(() => {
    if (project) engine.current?.update(project);
  }, [project]);
  useEffect(() => {
    const fn = (e: BeforeUnloadEvent) => {
      if (dirty || recordFlag.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", fn);
    return () => window.removeEventListener("beforeunload", fn);
  }, [dirty]);
  useEffect(() => {
    if (!playing) return;
    let frame: number;
    const tick = () => {
      const time = engine.current!.time();
      setPosition(time);
      if (
        !recordFlag.current &&
        time >= projectEnd(latest.current!) + effectTail(latest.current!.tracks)
      ) {
        engine.current?.stop();
        transportFlag.current = false;
        setPlaying(false);
        setPosition(0);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);
  const edit = (fn: (p: Project) => Project, group?: string) => {
    if (readOnly) return;
    editor.edit(fn, group);
    setDirty(true);
  };
  const patchTrack = (id: string, patch: Partial<Track>) => {
    const keys = Object.keys(patch);
    let group = keys.length === 1 ? `track:${id}:${keys[0]}` : undefined;
    if (keys[0] === "fx" && patch.fx) {
      const before = latest.current?.tracks.find((t) => t.id === id)?.fx;
      const changed = Object.keys(patch.fx).filter(
        (k) =>
          patch.fx![k as keyof typeof patch.fx] !==
          before?.[k as keyof typeof before],
      );
      group = changed.length === 1 ? `track:${id}:fx:${changed[0]}` : undefined;
    }
    edit(
      (p) => ({
        ...p,
        tracks: p.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      }),
      group,
    );
  };
  const patchClip = (id: string, fn: (c: Clip) => Clip) => {
    const before = latest.current?.tracks
      .flatMap((t) => t.clips)
      .find((c) => c.id === id);
    if (!before) return;
    const next = fn(before),
      changed = Object.keys(next)
        .filter((k) => next[k as keyof Clip] !== before[k as keyof Clip])
        .sort()
        .join(",");
    edit(
      (p) => ({
        ...p,
        tracks: p.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => (c.id === id ? next : c)),
        })),
      }),
      `clip:${id}:${changed}`,
    );
  };
  const historyAction = (kind: "undo" | "redo") => {
    if (
      busy ||
      readOnly ||
      recordFlag.current ||
      transportFlag.current ||
      modal ||
      confirmation ||
      (kind === "undo" ? !editor.canUndo : !editor.canRedo)
    )
      return;
    const next = kind === "undo" ? editor.undo() : editor.redo();
    if (!next) return;
    setDirty(true);
    if (!next.tracks.some((t) => t.id === selected))
      select(next.tracks[0]?.id ?? "");
    if (!next.tracks.some((t) => t.clips.some((c) => c.id === clipId)))
      selectClip("");
    setMessage(kind === "undo" ? "Last edit undone." : "Edit restored.");
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest('input,textarea,select,[contenteditable="true"]') ||
        modal ||
        confirmation ||
        busy ||
        playing ||
        recording ||
        (!event.ctrlKey && !event.metaKey) ||
        event.altKey
      )
        return;
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        historyAction(event.shiftKey ? "redo" : "undo");
      } else if (event.key.toLowerCase() === "y") {
        event.preventDefault();
        historyAction("redo");
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const stop = () => {
    engine.current?.stop();
    transportFlag.current = false;
    setPlaying(false);
  };
  const addTrack = () => {
    if (project!.tracks.length >= 128) {
      setError("This session has reached the 128-track browser safety limit.");
      return;
    }
    const t = newTrack(`Vocal ${project!.tracks.length + 1}`);
    edit((p) => ({ ...p, tracks: [...p.tracks, t] }));
    select(t.id);
  };
  const upload = (files: FileList | null) =>
    run(async () => {
      if (!files) return;
      if (project!.tracks.length + files.length > 128)
        throw new Error("Import up to 128 tracks per session.");
      const added: Track[] = [];
      const staged: Asset[] = [];
      for (const file of Array.from(files)) {
        if (file.size > 50 * 1024 * 1024)
          throw new Error("Each source file must be under 50 MB.");
        const id = crypto.randomUUID(),
          buffer = await engine.current!.decode(id, file);
        if (buffer.duration > 14400 || buffer.duration < 0.001)
          throw new Error(
            "Source audio must be between 1 millisecond and 4 hours long.",
          );
        const t = newTrack(file.name.replace(/\.[^.]+$/, ""));
        t.role = "beat";
        t.clips = [
          {
            id: crypto.randomUUID(),
            assetId: id,
            start: 0,
            offset: 0,
            duration: buffer.duration,
          },
        ];
        staged.push({ id, blob: file });
        added.push(t);
      }
      staged.forEach((a) => assets.current.set(a.id, a.blob));
      edit((p) => ({ ...p, tracks: [...p.tracks, ...added] }));
      if (added.length) select(added[0].id);
      setMessage("Audio imported. Select a track to mix or record.");
      if (fileInput.current) fileInput.current.value = "";
    });
  const startRecording = () =>
    run(async () => {
      stop();
      const ctx = await engine.current!.ready(),
        capture = new MicrophoneCapture(ctx);
      try {
        await capture.prepare(() => {
          if (recordFlag.current) {
            setMessage(
              "Microphone interrupted or take size limit reached. Finalizing your take.",
            );
            void stopRecording();
          }
        }, microphoneId);
        let track = project!.tracks.find((t) => t.id === selected);
        if (!track) {
          track = newTrack(`Vocal ${project!.tracks.length + 1}`);
          const t = track;
          edit((p) => ({ ...p, tracks: [...p.tracks, t] }));
          select(track.id);
        }
        const when = await engine.current!.play(project!, position);
        capture.start(when);
        recorder.current = { capture, track: track.id, start: position };
        recordFlag.current = true;
        transportFlag.current = true;
        setRecording(true);
        setPlaying(true);
        setMessage("Recording — use headphones to prevent bleed.");
      } catch (e) {
        capture.dispose();
        stop();
        throw e;
      }
    });
  const stopRecording = () => {
    const take = recorder.current;
    if (!take || !recordFlag.current) return;
    recordFlag.current = false;
    stop();
    void run(async () => {
      try {
        const blob = await take.capture.stop(),
          id = crypto.randomUUID();
        const buffer = await engine.current!.decode(id, blob);
        assets.current.set(id, blob);
        const clip = {
          id: crypto.randomUUID(),
          assetId: id,
          start: take.start,
          offset: 0,
          duration: buffer.duration,
        };
        edit((p) => ({
          ...p,
          tracks: p.tracks.map((t) =>
            t.id === take.track ? { ...t, clips: [...t.clips, clip] } : t,
          ),
        }));
        selectClip(clip.id);
        select(take.track);
        setPosition(take.start);
        setMessage("Take captured. Move or trim the clip to adjust timing.");
      } finally {
        recorder.current = null;
        setRecording(false);
      }
    });
  };
  const snapshot = (): SavedSession => {
    const p = { ...project!, updatedAt: new Date().toISOString() };
    const used = new Set(
      p.tracks.flatMap((t) => t.clips.map((c) => c.assetId)),
    );
    if ([...used].some((id) => !assets.current.has(id)))
      throw new Error(
        "Source audio is missing. Reopen a backup before saving.",
      );
    return {
      ...(cloudMeta.current.id === p.id
        ? {
            ownerId: cloudMeta.current.ownerId,
            cloudRevision: cloudMeta.current.cloudRevision,
          }
        : {}),
      project: validateProject(p),
      assets: [...assets.current]
        .filter(([id]) => used.has(id))
        .map(([id, blob]) => ({ id, blob })),
    };
  };
  const backup = () =>
    run(async () => {
      const session = snapshot();
      download(packSession(session), `${session.project.name}.sesh`);
      setMessage(
        "Project file downloaded with source audio and all edits. Keep it as a backup.",
      );
    });
  const save = () =>
    run(async () => {
      if (readOnly)
        throw new Error("Editor access is required to save this shared song");
      const session = snapshot();
      const results = await Promise.allSettled([
        saveLocal(session),
        ...(user ? [saveCloud(session, user.id)] : []),
      ]);
      const localOK = results[0].status === "fulfilled",
        cloudOK = !!user && results[1]?.status === "fulfilled";
      if (!localOK && !cloudOK) {
        download(packSession(session), `${session.project.name}.sesh`);
        throw new Error(
          "Saving to browser/cloud failed. A project backup download was started. Keep it and reopen using Open project file.",
        );
      }
      if (cloudOK) {
        cloudMeta.current = {
          id: session.project.id,
          ownerId: session.ownerId,
          cloudRevision: session.cloudRevision,
        };
        if (localOK) await saveLocal(session).catch(() => {});
      }
      editor.saved(session.project);
      setDirty(false);
      router.replace(
        `/studio?project=${encodeURIComponent(session.project.id)}&source=${localOK ? "local" : "cloud"}`,
        { scroll: false },
      );
      await recovery.clear().catch(() => {});
      setMessage(
        cloudOK
          ? `Saved privately to the cloud${localOK ? " and this browser" : ""}.`
          : "Saved to this browser. Sign in to save to the cloud.",
      );
      if (user && !cloudOK)
        throw new Error(
          "Saved locally, but the cloud save failed: " +
            (results[1]?.status === "rejected"
              ? (results[1].reason?.message ?? "Unknown cloud error")
              : "Unknown cloud error") +
            ". Open the latest cloud version or duplicate your work to keep an independent copy.",
        );
    });
  const openProjects = () => {
    setModal("projects");
    void run(async () => {
      const results = await Promise.allSettled([
        listLocal(),
        user ? listCloud() : Promise.resolve([]),
        recovery.refresh(),
      ]);
      if (results[0].status === "fulfilled") setLocal(results[0].value);
      if (results[1].status === "fulfilled") setCloud(results[1].value);
      else setCloud([]);
      if (results[0].status === "rejected" || results[1].status === "rejected")
        throw new Error(
          "Some saved projects could not be listed. You can still open a downloaded project file.",
        );
    });
  };
  const reopen = (
    get: () => Promise<SavedSession>,
    recoveryId?: string,
    location: "local" | "cloud" | "file" = "file",
  ) =>
    run(async () => {
      if (
        dirty &&
        !(await ask("Discard unsaved changes and open another project?"))
      )
        return;
      const session = await get(),
        p = validateProject(session.project);
      const next = new AudioEngine();
      try {
        for (const a of session.assets) await next.decode(a.id, a.blob);
        for (const t of p.tracks)
          for (const c of t.clips) {
            const b = next.buffers.get(c.assetId);
            if (!b || c.offset + c.duration > b.duration + 0.01)
              throw new Error("Project audio is missing or damaged");
          }
      } catch (e) {
        await next.context?.close();
        throw e;
      }
      stop();
      await engine.current?.context?.close();
      engine.current = next;
      assets.current = new Map(session.assets.map((a) => [a.id, a.blob]));
      await recovery.clear(recoveryId).catch(() => {});
      setProject(p);
      cloudMeta.current = {
        id: p.id,
        ownerId: session.ownerId,
        cloudRevision: session.cloudRevision,
      };
      setReadOnly(session.canEdit === false);
      select(p.tracks[0]?.id ?? "");
      selectClip("");
      setPosition(0);
      setDirty(!!recoveryId || location === "file");
      const address = recoveryId
        ? `/studio?project=${encodeURIComponent(recoveryId)}&source=recovery`
        : location === "file"
          ? "/studio"
          : `/studio?project=${encodeURIComponent(p.id)}&source=${location}`;
      if (window.location.pathname + window.location.search !== address)
        router.replace(address, { scroll: false });
      if (recoveryId) recovery.adopt(recoveryId);
      setModal(null);
      setMessage(
        recoveryId
          ? "Recovered unsaved session. Save when you are ready."
          : "Project reopened with source audio and mix settings.",
      );
    });
  useEffect(() => {
    if (!project || !authReady || openedInitial.current) return;
    openedInitial.current = true;
    if (initialSession) {
      const { id, source } = initialSession;
      void reopen(
        async () => {
          if (source === "beat") return beatSession(id);
          if (source === "recovery") return loadRecovery(id);
          if (source === "cloud") {
            if (!user)
              throw new Error(
                "Sign in to open this cloud session, then return to Sessions.",
              );
            return loadCloud(id, user.id);
          }
          if (source !== "local") throw new Error("Unknown session location");
          const session = (await listLocal()).find((s) => s.project.id === id);
          if (!session)
            throw new Error(
              "This session is not saved at this browser address. Open a backup or return to Sessions.",
            );
          return session;
        },
        source === "recovery" ? id : undefined,
        source === "cloud" ? "cloud" : source === "local" ? "local" : "file",
      );
    } else if (initialDialog === "projects") openProjects();
    else if (initialDialog === "auth") setModal("auth");
  }, [project, authReady, initialSession, initialDialog, user]);
  if (!project) return <main className="loading">Opening NOIR…</main>;
  const track = project.tracks.find((t) => t.id === selected),
    clip = project.tracks.flatMap((t) => t.clips).find((c) => c.id === clipId),
    width = Math.max(900, (projectEnd(project) + 15) * PX),
    locked = busy || recording || playing || readOnly;
  const numberField = (
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    change: (v: number) => void,
  ) => (
    <label className="number-field">
      {label}
      <input
        type="number"
        value={Number(value.toFixed(3))}
        min={min}
        max={max}
        step={step}
        disabled={locked}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n) && n >= min && n <= max) change(n);
        }}
      />
    </label>
  );
  return (
    <main>
      <input
        ref={projectInput}
        type="file"
        accept=".sesh"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void reopen(() => unpackSession(file));
          e.target.value = "";
        }}
      />
      <header>
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            void navigate("/");
          }}
        >
          <span className="logo">▥</span> <span>NOIR</span>
          <small>BY NEW AGE MUSIC</small>
        </a>
        <div className="project-title">
          <input
            aria-label="Project name"
            maxLength={200}
            value={project.name}
            disabled={locked}
            onChange={(e) =>
              edit((p) => ({ ...p, name: e.target.value }), "project:name")
            }
          />
          <span role="status">
            {dirty
              ? recovery.status === "saved"
                ? "Unsaved · recovery saved"
                : recovery.status === "saving"
                  ? "Unsaved · saving recovery"
                  : recovery.status === "unavailable"
                    ? "Unsaved · recovery unavailable"
                    : "Unsaved changes"
              : "Ready to create"}
          </span>
        </div>
        <div className="header-actions">
          <Link
            className="nav-link"
            href="/"
            onClick={(e) => {
              e.preventDefault();
              void navigate("/");
            }}
          >
            Home
          </Link>
          <Link
            className="nav-link"
            href="/sessions"
            onClick={(e) => {
              e.preventDefault();
              void navigate("/sessions");
            }}
          >
            Sessions
          </Link>
          <Link
            className="nav-link"
            href="/fyp"
            onClick={(e) => {
              e.preventDefault();
              void navigate("/fyp");
            }}
          >
            For You
          </Link>
          <Link
            className="nav-link"
            href="/profile"
            onClick={(e) => {
              e.preventDefault();
              void navigate("/profile");
            }}
          >
            Profile
          </Link>
          <button
            disabled={locked || !projectEnd(project)}
            onClick={() => setModal("publish")}
          >
            Publish
          </button>
          <button disabled={locked} onClick={openProjects}>
            Projects
          </button>
          <button
            disabled={busy || recording || playing || !user}
            onClick={() => setModal("invite")}
          >
            Collaborators
          </button>
          <button
            disabled={locked || !project.name.trim()}
            onClick={backup}
            title="Download a project file with all audio and edits"
          >
            Backup
          </button>
          <button disabled={locked || !project.name.trim()} onClick={save}>
            Save{dirty ? " •" : ""}
          </button>
          <button
            className="primary"
            disabled={locked || !projectEnd(project)}
            onClick={() =>
              run(async () => {
                download(
                  await engine.current!.export(project),
                  `${project.name || "NOIR"}.wav`,
                );
                setMessage(
                  "WAV exported at 44.1 kHz, 16-bit stereo. Peaks above 0 dBFS are clipped; lower track levels if distorted.",
                );
              })
            }
          >
            Export WAV ↗
          </button>
          <button
            className="avatar"
            onClick={() => setModal("auth")}
            disabled={locked}
          >
            {user ? user.email?.slice(0, 1).toUpperCase() : "Sign in"}
          </button>
        </div>
      </header>
      {readOnly && (
        <div className="recovery-warning" role="status">
          Listen-only shared session. Editing and saving the shared version
          require editor access from the owner.
        </div>
      )}
      <section className="transport" aria-label="Transport">
        <div className="transport-buttons">
          <button
            title="Return to start"
            disabled={recording || busy}
            onClick={() => {
              stop();
              setPosition(0);
            }}
          >
            │◀
          </button>
          <button
            className="play"
            aria-label={playing ? "Pause" : "Play"}
            disabled={busy || recording || !projectEnd(project)}
            onClick={() =>
              run(async () => {
                if (transportFlag.current) {
                  const at = engine.current!.time();
                  stop();
                  setPosition(at);
                } else {
                  const from =
                    position >= projectEnd(project) + 1.5 ? 0 : position;
                  await engine.current!.play(project, from);
                  transportFlag.current = true;
                  setPlaying(true);
                }
              })
            }
          >
            {playing ? "Ⅱ" : "▶"}
          </button>
          <button
            className={`record ${recording ? "active" : ""}`}
            aria-label={recording ? "Stop recording" : "Record vocals"}
            disabled={busy || readOnly}
            onClick={recording ? stopRecording : startRecording}
          >
            {recording ? "■" : "●"}
          </button>
        </div>
        <output className="time">{clock(position)}</output>
        <div className="tempo">
          {numberField("TEMPO", project.bpm, 30, 300, 1, (bpm) =>
            edit((p) => ({ ...p, bpm })),
          )}
          <span>4 / 4</span>
        </div>
        <div className="transport-note">
          <span className={recording ? "red-dot" : "green-dot"} />
          {recording
            ? "Recording microphone"
            : "Your next great track starts here"}
        </div>
        <span className="free-badge">FREE TO CREATE</span>
      </section>
      <section className="recording-tools" aria-label="Recording setup">
        <MicrophoneInput
          value={microphoneId}
          onChange={setMicrophoneId}
          disabled={locked || playing}
          revision={recording}
        />
        <div className="session-meters">
          <LevelMeter label="Input" active={recording} read={readInputPeak} />
          <LevelMeter label="Mix" active={playing} read={readMixPeak} />
        </div>
      </section>
      <div className="workspace">
        <aside className="track-sidebar">
          <div className="panel-heading">
            <span>
              TRACKS <b>{project.tracks.length.toString().padStart(2, "0")}</b>
            </span>
            <button
              title="Add vocal track"
              disabled={locked}
              onClick={addTrack}
            >
              ＋
            </button>
          </div>
          <div className="sidebar-intro">
            <span className="eyebrow">YOUR SESSION</span>
            <h1>
              Make room
              <br />
              for your sound.
            </h1>
            <p>
              Bring a beat. Find your voice.
              <br />
              Make something yours.
            </p>
            <button
              className="upload-button"
              disabled={locked}
              onClick={() => fileInput.current?.click()}
            >
              ＋ Upload audio
            </button>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac"
              hidden
              onChange={(e) => upload(e.target.files)}
            />
            <button
              className="text-button"
              disabled={locked}
              onClick={addTrack}
            >
              Add empty vocal track
            </button>
          </div>
          <div className="session-track-groups">
            {(["beat", "vocal", "adlib"] as const).map((role) => (
              <section key={role} aria-label={role + " tracks"}>
                <h3>
                  {role === "beat"
                    ? "BEATS"
                    : role === "vocal"
                      ? "VOCALS"
                      : "ADLIBS"}
                </h3>
                {project.tracks
                  .filter((t) => (t.role ?? "vocal") === role)
                  .map((t) => (
                    <button
                      key={t.id}
                      disabled={locked}
                      aria-pressed={selected === t.id}
                      onClick={() => {
                        select(t.id);
                        selectClip("");
                      }}
                    >
                      {t.name}
                    </button>
                  ))}
                {!project.tracks.some((t) => (t.role ?? "vocal") === role) && (
                  <p>No {role} tracks yet</p>
                )}
              </section>
            ))}
          </div>
          <div className="session-info">
            <span>SESSION NOTES</span>
            <p>
              Use headphones when recording.
              <br />
              Select a clip to move, trim, or split it.
            </p>
            <p>
              Tempo guides the grid.
              <br />
              Audio keeps its original speed.
            </p>
          </div>
        </aside>
        <section className="arrangement">
          {recovery.showBanner && recovery.drafts.length > 0 && (
            <div className="recovery-banner" role="status">
              <div>
                <b>Unsaved session found</b>
                <span>
                  {recovery.drafts[0].name} ·{" "}
                  {new Date(recovery.drafts[0].savedAt).toLocaleString()}
                </span>
              </div>
              <button
                disabled={locked}
                onClick={() =>
                  reopen(
                    () => loadRecovery(recovery.drafts[0].id),
                    recovery.drafts[0].id,
                  )
                }
              >
                Restore draft
              </button>
              <button disabled={locked} onClick={recovery.dismiss}>
                Later
              </button>
            </div>
          )}
          {dirty && recovery.status === "unavailable" && (
            <div className="recovery-warning" role="status">
              Automatic recovery is unavailable. Use Save or download a project
              backup.
            </div>
          )}
          <div className="arrangement-heading">
            <div>
              <span className="eyebrow">WORKSPACE</span>
              <h2>Arrangement</h2>
            </div>
            <div className="arrangement-tools">
              <div className="history-buttons">
                <button
                  aria-label="Undo"
                  title="Undo (Ctrl/⌘ Z)"
                  disabled={locked || !editor.canUndo}
                  onClick={() => historyAction("undo")}
                >
                  ↶
                </button>
                <button
                  aria-label="Redo"
                  title="Redo (Ctrl/⌘ Shift Z or Ctrl Y)"
                  disabled={locked || !editor.canRedo}
                  onClick={() => historyAction("redo")}
                >
                  ↷
                </button>
              </div>
              <span>
                {project.tracks.length} tracks · {clock(projectEnd(project))}
              </span>
            </div>
          </div>
          <div className="timeline-scroll">
            <div style={{ width }} className="timeline">
              <div
                className="ruler"
                onClick={(e) => {
                  if (locked) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  setPosition(Math.max(0, (e.clientX - rect.left) / PX));
                }}
              >
                {Array.from({ length: Math.ceil(width / (PX * 5)) }, (_, i) => (
                  <span key={i} style={{ left: i * PX * 5 }}>
                    {clock(i * 5).slice(0, 5)}
                  </span>
                ))}
              </div>
              <div className="playhead" style={{ left: position * PX }}>
                <i />
              </div>
              {project.tracks.map((t, i) => (
                <div
                  key={t.id}
                  className={`track-lane color-${i % 4} ${selected === t.id ? "selected" : ""}`}
                  onClick={() => select(t.id)}
                >
                  <div className="lane-label">
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    <b>{t.name}</b>
                    <small className="role-badge">{t.role ?? "vocal"}</small>
                    <button
                      aria-label={`Mute ${t.name}`}
                      aria-pressed={t.mute}
                      disabled={busy}
                      className={t.mute ? "toggled" : ""}
                      onClick={() => patchTrack(t.id, { mute: !t.mute })}
                    >
                      M
                    </button>
                    <button
                      aria-label={`Solo ${t.name}`}
                      aria-pressed={t.solo}
                      disabled={busy}
                      className={t.solo ? "toggled" : ""}
                      onClick={() => patchTrack(t.id, { solo: !t.solo })}
                    >
                      S
                    </button>
                  </div>
                  {t.clips.map((c) => (
                    <button
                      key={c.id}
                      disabled={locked}
                      aria-label={`Select clip on ${t.name}`}
                      className={`clip ${clipId === c.id ? "chosen" : ""}`}
                      style={{
                        left: c.start * PX,
                        width: Math.max(4, c.duration * PX),
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        select(t.id);
                        selectClip(c.id);
                      }}
                    >
                      <span>{t.name}</span>
                      <Waveform
                        buffer={engine.current?.buffers.get(c.assetId)}
                        offset={c.offset}
                        duration={c.duration}
                      />
                    </button>
                  ))}
                </div>
              ))}
              {!project.tracks.length && (
                <div className="empty-state">
                  <div className="empty-icon">≋</div>
                  <h2>A blank canvas. An open mic.</h2>
                  <p>Upload your instrumental, then record a vocal take.</p>
                  <button
                    className="primary"
                    onClick={() => fileInput.current?.click()}
                  >
                    Upload your first track
                  </button>
                  <span>
                    WAV, MP3, M4A, OGG and other browser-supported audio
                  </span>
                </div>
              )}
              <div className="add-lane">
                <button disabled={locked} onClick={addTrack}>
                  ＋ Add a vocal track
                </button>
              </div>
            </div>
          </div>
          <div className="editor">
            <div className="panel-heading">
              CLIP EDITOR <span>NON-DESTRUCTIVE</span>
            </div>
            {clip ? (
              <div className="clip-controls">
                {numberField(
                  "Cursor (s)",
                  position,
                  0,
                  14400,
                  0.01,
                  setPosition,
                )}
                {numberField("Start (s)", clip.start, 0, 14400, 0.01, (start) =>
                  patchClip(clip.id, (c) => ({ ...c, start })),
                )}
                {numberField(
                  "Trim in (s)",
                  clip.offset,
                  0,
                  clip.offset + clip.duration - 0.001,
                  0.01,
                  (offset) =>
                    patchClip(clip.id, (c) => ({
                      ...c,
                      offset,
                      duration: c.duration + c.offset - offset,
                    })),
                )}
                {numberField(
                  "Length (s)",
                  clip.duration,
                  0.001,
                  (engine.current!.buffers.get(clip.assetId)?.duration ?? 0) -
                    clip.offset,
                  0.01,
                  (duration) => patchClip(clip.id, (c) => ({ ...c, duration })),
                )}
                <button
                  disabled={locked}
                  onClick={() => {
                    try {
                      const b = engine.current!.buffers.get(clip.assetId);
                      if (!b) throw new Error("Clip audio is missing");
                      const level = normalizationLevel(
                        Array.from({ length: b.numberOfChannels }, (_, i) =>
                          b.getChannelData(i),
                        ),
                        b.sampleRate,
                        clip,
                      );
                      patchClip(clip.id, (c) => ({ ...c, level }));
                      setMessage(
                        "Clip normalized toward −1 dBFS before track effects. Source audio is unchanged.",
                      );
                    } catch (e) {
                      setError(e instanceof Error ? e.message : String(e));
                    }
                  }}
                >
                  Normalize clip
                </button>
                <button
                  disabled={locked || clip.level === undefined}
                  onClick={() =>
                    patchClip(clip.id, (c) => ({ ...c, level: undefined }))
                  }
                >
                  Reset clip gain
                </button>
                <span className="hint">
                  Clip gain: {(20 * Math.log10(clip.level ?? 1)).toFixed(1)} dB
                </span>
                <button
                  disabled={locked || clip.start + clip.duration * 2 > 14400}
                  onClick={() =>
                    edit((p) => ({
                      ...p,
                      tracks: p.tracks.map((t) => ({
                        ...t,
                        clips: t.clips.flatMap((c) =>
                          c.id === clip.id
                            ? [
                                c,
                                {
                                  ...c,
                                  id: crypto.randomUUID(),
                                  start: c.start + c.duration,
                                },
                              ]
                            : [c],
                        ),
                      })),
                    }))
                  }
                >
                  Duplicate clip
                </button>
                <button
                  disabled={locked}
                  onClick={() =>
                    patchClip(clip.id, (c) => ({
                      ...c,
                      start: Math.min(
                        14400,
                        Math.round(c.start / (60 / project.bpm)) *
                          (60 / project.bpm),
                      ),
                    }))
                  }
                >
                  Snap start to beat
                </button>
                <button
                  disabled={
                    locked ||
                    position <= clip.start ||
                    position >= clip.start + clip.duration
                  }
                  onClick={() =>
                    edit((p) => ({
                      ...p,
                      tracks: p.tracks.map((t) => ({
                        ...t,
                        clips: t.clips.flatMap((c) =>
                          c.id === clip.id ? splitClip(c, position) : [c],
                        ),
                      })),
                    }))
                  }
                >
                  Split at cursor
                </button>
                <button
                  disabled={locked}
                  className="danger"
                  onClick={() => {
                    edit((p) => ({
                      ...p,
                      tracks: p.tracks.map((t) => ({
                        ...t,
                        clips: t.clips.filter((c) => c.id !== clip.id),
                      })),
                    }));
                    selectClip("");
                  }}
                >
                  Delete clip
                </button>
              </div>
            ) : (
              <p className="hint">
                Select an audio clip to move it, trim its source, or split at
                the timeline cursor.
              </p>
            )}
          </div>
        </section>
        <aside className="mixer">
          <div className="panel-heading">
            CHANNEL STRIP <span>◉</span>
          </div>
          {track ? (
            <>
              <div className="channel-name">
                <span className="eyebrow">SELECTED TRACK</span>
                <input
                  aria-label="Track name"
                  value={track.name}
                  disabled={locked}
                  onChange={(e) =>
                    patchTrack(track.id, { name: e.target.value })
                  }
                />
              </div>
              <div className="mix-buttons">
                <button
                  disabled={busy || readOnly}
                  aria-pressed={track.mute}
                  className={track.mute ? "toggled" : ""}
                  onClick={() => patchTrack(track.id, { mute: !track.mute })}
                >
                  Mute
                </button>
                <button
                  disabled={busy || readOnly}
                  aria-pressed={track.solo}
                  className={track.solo ? "toggled" : ""}
                  onClick={() => patchTrack(track.id, { solo: !track.solo })}
                >
                  Solo
                </button>
              </div>
              <label className="track-role">
                Track type
                <select
                  aria-label="Track type"
                  disabled={locked}
                  value={track.role ?? "vocal"}
                  onChange={(e) =>
                    patchTrack(track.id, {
                      role: e.target.value as Track["role"],
                    })
                  }
                >
                  <option value="beat">Beat / instrumental</option>
                  <option value="vocal">Lead vocal</option>
                  <option value="adlib">Adlib</option>
                </select>
              </label>
              {track.role === "beat" ? (
                <BeatRack
                  track={track}
                  disabled={busy || readOnly}
                  update={(patch) => patchTrack(track.id, patch)}
                />
              ) : (
                <VocalRack
                  track={track}
                  disabled={busy || readOnly}
                  update={(patch) => patchTrack(track.id, patch)}
                />
              )}
              {(
                [
                  [
                    "Volume",
                    "gain",
                    0,
                    2,
                    0.01,
                    `${(20 * Math.log10(track.gain || 0.00001)).toFixed(1)} dB`,
                  ],
                  [
                    "Pan",
                    "pan",
                    -1,
                    1,
                    0.01,
                    track.pan === 0
                      ? "Center"
                      : `${Math.round(Math.abs(track.pan) * 100)}${track.pan < 0 ? " L" : " R"}`,
                  ],
                  ["Low shelf", "low", -12, 12, 0.5, `${track.low} dB`],
                  ["High shelf", "high", -12, 12, 0.5, `${track.high} dB`],
                  [
                    "Reverb",
                    "reverb",
                    0,
                    1,
                    0.01,
                    `${Math.round(track.reverb * 100)}%`,
                  ],
                ] as const
              ).map(([label, key, min, max, step, display]) => (
                <label className="slider" key={key}>
                  <span>
                    {label}
                    <output>{display}</output>
                  </span>
                  <input
                    aria-label={label}
                    disabled={busy || readOnly}
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={track[key]}
                    onChange={(e) =>
                      patchTrack(track.id, { [key]: Number(e.target.value) })
                    }
                  />
                </label>
              ))}
              <p className="hint">
                Mix changes are heard live and included in your WAV export. Keep
                levels low enough to avoid distortion.
              </p>
              <button
                className="delete-track"
                disabled={locked}
                onClick={async () => {
                  if (
                    track.clips.length &&
                    !(await ask("Delete this track and its clips?"))
                  )
                    return;
                  edit((p) => ({
                    ...p,
                    tracks: p.tracks.filter((t) => t.id !== track.id),
                  }));
                  select("");
                  selectClip("");
                }}
              >
                Delete track
              </button>
            </>
          ) : (
            <div className="mixer-empty">
              <span>☷</span>
              <p>
                Select a track
                <br />
                to shape its sound.
              </p>
            </div>
          )}
          <div className="studio-mark">
            MADE FOR THE
            <br />
            <b>independent.</b>
          </div>
        </aside>
      </div>
      <footer>
        <span role="status">{busy ? "Working…" : message}</span>
        <span>NOIR · BY NEW AGE MUSIC</span>
      </footer>
      {error && (
        <div role="alert" className="error">
          {error}
          {user && cloudMeta.current.id === project.id && (
            <button
              disabled={busy}
              onClick={() =>
                reopen(() => loadCloud(project.id, user.id), undefined, "cloud")
              }
            >
              Open latest cloud version
            </button>
          )}
          <button onClick={() => setError("")} aria-label="Dismiss error">
            ×
          </button>
        </div>
      )}
      {modal && (
        <div className="overlay">
          <section
            className={modal === "projects" ? "modal projects-view" : "modal"}
            role="dialog"
            aria-modal="true"
            aria-label={
              modal === "invite"
                ? "Song collaborators"
                : modal === "auth"
                  ? "Account"
                  : modal === "publish"
                    ? "Publish mix"
                    : "Saved projects"
            }
          >
            <button
              className="close"
              disabled={busy}
              onClick={() => setModal(null)}
            >
              ×
            </button>
            {modal === "invite" ? (
              <InvitePanel
                projectId={project.id}
                userId={user?.id}
                navigate={(path) => void navigate(path)}
              />
            ) : modal === "auth" ? (
              <>
                <span className="eyebrow">YOUR SPACE TO CREATE</span>
                <h2>{user ? "Your account" : "Welcome to NOIR"}</h2>
                {!supabase ? (
                  <p>
                    Cloud accounts need Supabase configuration. Local recording,
                    saving, reopening, and WAV export work now. See README for
                    setup.
                  </p>
                ) : user ? (
                  <>
                    <p>{user.email}</p>
                    <button
                      onClick={() =>
                        run(async () => {
                          const { error } = await supabase!.auth.signOut();
                          if (error) throw error;
                          setModal(null);
                          setMessage(
                            "Signed out. Local projects remain on this device.",
                          );
                        })
                      }
                    >
                      Sign out
                    </button>
                  </>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(async () => {
                        const { error } =
                          await supabase!.auth.signInWithPassword({
                            email,
                            password,
                          });
                        if (error) throw error;
                        setModal(null);
                        setMessage(
                          "Signed in. Save to sync this project to your private cloud.",
                        );
                      });
                    }}
                  >
                    <label>
                      Email
                      <input
                        required
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </label>
                    <label>
                      Password
                      <input
                        required
                        minLength={8}
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </label>
                    <button className="primary" disabled={busy}>
                      Sign in
                    </button>
                    <button
                      type="button"
                      disabled={busy || !email || password.length < 8}
                      onClick={() =>
                        run(async () => {
                          const { error } = await supabase!.auth.signUp({
                            email,
                            password,
                            options: {
                              emailRedirectTo: window.location.origin,
                            },
                          });
                          if (error) throw error;
                          setMessage(
                            "Account requested. Check your email to confirm before signing in.",
                          );
                          setModal(null);
                        })
                      }
                    >
                      Create free account
                    </button>
                    <button
                      type="button"
                      disabled={busy || !email}
                      onClick={() =>
                        run(async () => {
                          const { error } = await supabase!.auth.signInWithOtp({
                            email,
                            options: {
                              emailRedirectTo: window.location.origin,
                              shouldCreateUser: false,
                            },
                          });
                          if (error) throw error;
                          setMessage("Check your email for a sign-in link.");
                          setModal(null);
                        })
                      }
                    >
                      Email me a sign-in link
                    </button>
                  </form>
                )}
              </>
            ) : modal === "publish" ? (
              <PublishPanel
                user={user}
                project={project}
                render={() => engine.current!.export(project)}
                onBusy={setBusy}
                navigate={(path) => void navigate(path)}
              />
            ) : (
              <>
                <h2>Your projects</h2>
                <button
                  disabled={busy || !project.name.trim()}
                  onClick={() => {
                    cloudMeta.current = { id: "" };
                    setReadOnly(false);
                    editor.edit((p) => ({
                      ...p,
                      id: crypto.randomUUID(),
                      name: `${p.name.slice(0, 195)} copy`,
                    }));
                    setDirty(true);
                    setModal(null);
                    router.replace("/studio", { scroll: false });
                    setMessage(
                      "Session duplicated. Save to create a separate project.",
                    );
                  }}
                >
                  Duplicate session
                </button>
                <button
                  disabled={busy}
                  onClick={() => projectInput.current?.click()}
                >
                  Open project file
                </button>
                <button
                  disabled={busy}
                  onClick={async () => {
                    if (dirty && !(await ask("Discard unsaved changes?")))
                      return;
                    stop();
                    void recovery.clear().catch(() => {});
                    assets.current.clear();
                    engine.current!.buffers.clear();
                    cloudMeta.current = { id: "" };
                    setReadOnly(false);
                    setProject(newProject());
                    router.replace("/studio", { scroll: false });
                    select("");
                    selectClip("");
                    setPosition(0);
                    setDirty(false);
                    setModal(null);
                  }}
                >
                  ＋ New session
                </button>
                <h3>Unsaved recovery drafts</h3>
                {recovery.drafts.length ? (
                  recovery.drafts.map((d) => (
                    <button
                      className="project-row recovery-row"
                      key={d.id}
                      disabled={busy}
                      aria-label={`Recover ${d.name}`}
                      onClick={() => reopen(() => loadRecovery(d.id), d.id)}
                    >
                      {d.name}
                      <small>
                        {new Date(d.savedAt).toLocaleString()} · {d.tracks}{" "}
                        tracks
                      </small>
                    </button>
                  ))
                ) : (
                  <p>No recovery drafts from earlier sessions.</p>
                )}
                <ProjectLibrary
                  local={local}
                  cloud={cloud}
                  userId={user?.id}
                  open={(load, location) => reopen(load, undefined, location)}
                />
                {!user && (
                  <p className="library-hint">
                    Sign in to include your private cloud projects.
                  </p>
                )}
              </>
            )}
          </section>
        </div>
      )}
      {confirmation && (
        <div className="overlay confirmation">
          <section
            className="modal"
            role="alertdialog"
            aria-modal="true"
            aria-label="Confirm changes"
          >
            <h2>Keep your work?</h2>
            <p>{confirmation.message}</p>
            <button
              autoFocus
              onClick={() => {
                confirmation.resolve(false);
                setConfirmation(null);
              }}
            >
              Keep editing
            </button>
            <button
              className="danger"
              onClick={() => {
                confirmation.resolve(true);
                setConfirmation(null);
              }}
            >
              Continue
            </button>
          </section>
        </div>
      )}
    </main>
  );
}
