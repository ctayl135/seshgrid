"use client";
import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { AudioEngine } from "@/lib/audio";
import VolumeMotion from "./VolumeMotion";
import {
  snapTime,
  clipsInRange,
  moveClips,
  copyClips,
  pasteClips,
  type TimelineTool,
  type ClipCopy,
} from "@/lib/timeline-tools";
import { convertAudio, EXPORT_FORMATS, type ExportFormat } from "@/lib/codecs";
import {
  UNDERGROUND_PRESETS,
  applyUndergroundPreset,
} from "@/lib/underground-presets";
import {
  newProject,
  newTrack,
  projectEnd,
  splitClip,
  addRecordingTake,
  activateTake,
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
import StockRack from "./StockRack";
import AutoKey from "./AutoKey";
import PublishPanel from "./PublishPanel";
import InvitePanel from "./InvitePanel";
import { beatSession } from "@/lib/community";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { normalizationLevel } from "@/lib/normalize";
import LevelMeter from "./LevelMeter";
import ProjectLibrary from "./ProjectLibrary";
import MicrophoneInput from "./MicrophoneInput";
import VoiceCheck from "./VoiceCheck";
import { vocalRecordingLevel } from "@/lib/voice-input";
import { stockPlugins } from "@/lib/stock-plugins";
import { effectTail } from "@/lib/presets";
import { useProjectEditor } from "./useProjectEditor";
import { useSessionRecovery } from "./useSessionRecovery";
import { loadRecovery } from "@/lib/recovery";
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
  initialPreset,
}: {
  initialSession?: { id: string; source: string };
  initialDialog?: "auth" | "projects";
  initialPreset?: string;
} = {}) {
  const router = useRouter();
  const [mobileMenu, setMobileMenu] = useState(false);
  const [mobileView, setMobileView] = useState("record");
  const [zoom, setZoom] = useState(32);
  const PX = zoom;
  const [tool, setTool] = useState<TimelineTool>("select"),
    [snap, setSnap] = useState(1),
    [range, setRange] = useState<[number, number]>([0, 0]),
    [clipSelection, setClipSelection] = useState<string[]>([]),
    [clipboard, setClipboard] = useState<ClipCopy[]>([]);
  const playheadDragging = useRef(false);
  const rangeAnchor = useRef<number | null>(null),
    clipDrag = useRef<{ x: number; ids: string[]; scroll: number } | null>(
      null,
    ),
    suppressClipClick = useRef(false);
  const [dragPreview, setDragPreview] = useState<{
    ids: string[];
    delta: number;
  } | null>(null);
  const [selectionMenu, setSelectionMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const selectionMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selectionMenu) return;
    const outside = (e: PointerEvent) => {
      if (!selectionMenuRef.current?.contains(e.target as Node))
        setSelectionMenu(null);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectionMenu(null);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [selectionMenu]);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("wav");
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
  useEffect(() => {
    setClipSelection([]);
    setRange([0, 0]);
    setClipboard([]);
  }, [project?.id]);
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
  const [countIn, setCountIn] = useState(1),
    [metronome, setMetronome] = useState(false),
    [armed, setArmed] = useState(""),
    [countdown, setCountdown] = useState(0),
    [rulerBars, setRulerBars] = useState(true),
    [loopEnabled, setLoopEnabled] = useState(false),
    [loopStart, setLoopStart] = useState(0),
    [loopEnd, setLoopEnd] = useState(8);
  const [microphoneId, setMicrophoneId] = useState("");
  const [voiceAssist, setVoiceAssist] = useState(true);
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
    playButton = useRef<HTMLButtonElement>(null),
    fileInput = useRef<HTMLInputElement>(null),
    projectInput = useRef<HTMLInputElement>(null),
    recorder = useRef<{
      capture: MicrophoneCapture;
      track: string;
      start: number;
      when: number;
      assist: boolean;
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
    const fresh = newProject();
    const preset = UNDERGROUND_PRESETS.find((p) => p.id === initialPreset);
    if (preset) {
      const vocal = newTrack(preset.name);
      Object.assign(vocal, applyUndergroundPreset(vocal, preset.id));
      vocal.role = preset.category === "Adlibs" ? "adlib" : "vocal";
      fresh.tracks = [vocal];
      select(vocal.id);
      setArmed(vocal.id);
    }
    setProject(fresh);
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
      setCountdown(
        Math.ceil(
          (engine.current!.secondsUntilStart() * (latest.current?.bpm ?? 120)) /
            60,
        ),
      );
      if (
        !recordFlag.current &&
        !engine.current!.looping &&
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
    setCountdown(0);
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
      if (readOnly) throw new Error("Editor access is required to record");
      if (
        !project!.tracks.some((t) => t.id === armed && t.role !== "beat") &&
        project!.tracks.length >= 128
      )
        throw new Error("This session has reached the 128-track limit");
      stop();
      const ctx = await engine.current!.ready(),
        capture = new MicrophoneCapture(ctx);
      try {
        await capture.prepare(
          () => {
            if (recordFlag.current) {
              setMessage(
                "Microphone interrupted or take size limit reached. Finalizing your take.",
              );
              void stopRecording();
            }
          },
          microphoneId,
          voiceAssist,
        );
        let track = project!.tracks.find(
          (t) => t.id === armed && t.role !== "beat",
        );
        if (!track) {
          track = newTrack(`Vocal ${project!.tracks.length + 1}`);
          const t = track;
          edit((p) => ({ ...p, tracks: [...p.tracks, t] }));
          select(track.id);
        }
        setArmed(track.id);
        const backing = {
          ...project!,
          tracks: project!.tracks.map((t) =>
            t.id === track!.id ? { ...t, clips: [], solo: false } : t,
          ),
        };
        const when = await engine.current!.play(backing, position, undefined, {
          countInBeats: countIn * 4,
          metronome,
        });
        capture.start(when);
        recorder.current = {
          capture,
          track: track.id,
          start: position,
          when,
          assist: voiceAssist,
        };
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
    const cancelled = (engine.current?.context?.currentTime ?? 0) < take.when;
    stop();
    if (cancelled) {
      take.capture.dispose();
      recorder.current = null;
      setRecording(false);
      setMessage("Count-in cancelled. No take was recorded.");
      return;
    }
    void run(async () => {
      try {
        const blob = await take.capture.stop(),
          id = crypto.randomUUID();
        const buffer = await engine.current!.decode(id, blob);
        assets.current.set(id, blob);
        const vocalLevel = vocalRecordingLevel(
          buffer.getChannelData(0),
          take.assist,
        );
        const clip = {
          level: vocalLevel.level,
          id: crypto.randomUUID(),
          assetId: id,
          start: take.start,
          offset: 0,
          duration: buffer.duration,
        };
        edit((p) => ({
          ...p,
          tracks: p.tracks.map((t) =>
            t.id === take.track ? addRecordingTake(t, clip) : t,
          ),
        }));
        selectClip(clip.id);
        select(take.track);
        setPosition(take.start);
        setMessage(
          vocalLevel.peak < 0.001
            ? "Almost no microphone audio was captured. Check your headphone mic in Check my voice or select a different input."
            : vocalLevel.quiet
              ? "Take captured and lifted, but the input was very quiet. Run Check my voice to check your headphone mic. Original audio is preserved."
              : take.assist
                ? "Take captured. Vocal level assist balanced this take; the original recording is preserved."
                : "Take captured. Move or trim the clip to adjust timing.",
        );
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
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        e.repeat ||
        modal ||
        confirmation ||
        busy ||
        target?.closest(
          'input,textarea,select,button,a,[contenteditable="true"]',
        )
      )
        return;
      if (e.code === "Space") {
        e.preventDefault();
        if (recordFlag.current) stopRecording();
        else playButton.current?.click();
      } else if (e.key.toLowerCase() === "r" && !readOnly) {
        e.preventDefault();
        if (recordFlag.current) stopRecording();
        else void startRecording();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  if (!project) return <main className="loading">Opening NOIR…</main>;
  const track = project.tracks.find((t) => t.id === selected),
    clip = project.tracks.flatMap((t) => t.clips).find((c) => c.id === clipId),
    width = Math.max(
      900,
      (Math.max(
        projectEnd(project),
        ...project.tracks.map((t) =>
          t.volumeMotion ? t.volumeMotion.start + t.volumeMotion.duration : 0,
        ),
      ) +
        15) *
        PX,
    ),
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
    <main className={`studio-page mobile-view-${mobileView}`}>
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
        <div
          className={`header-actions ${mobileMenu ? "mobile-menu-open" : ""}`}
        >
          <button
            className="mobile-menu-toggle"
            aria-expanded={mobileMenu}
            onClick={() => setMobileMenu(!mobileMenu)}
          >
            {mobileMenu ? "Less" : "More"}
          </button>
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
          <button
            className="session-shortcut"
            disabled={locked}
            onClick={openProjects}
          >
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
          <button
            className="save-shortcut"
            disabled={locked || !project.name.trim()}
            onClick={save}
          >
            Save{dirty ? " •" : ""}
          </button>
          <select
            aria-label="Export format"
            disabled={locked}
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
          >
            {Object.entries(EXPORT_FORMATS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <button
            className="primary"
            disabled={locked || !projectEnd(project)}
            onClick={() =>
              run(async () => {
                setMessage(
                  "Rendering mix" +
                    (exportFormat === "wav"
                      ? "…"
                      : " and converting locally. First conversion downloads the audio engine…"),
                );
                const wav = await engine.current!.export(project);
                download(
                  exportFormat === "wav"
                    ? wav
                    : await convertAudio(wav, exportFormat),
                  `${project.name || "NOIR"}.${exportFormat}`,
                );
                setMessage(
                  exportFormat.toUpperCase() +
                    " exported. Keep mix levels below clipping; compressed formats use lossy encoding.",
                );
              })
            }
          >
            Export {exportFormat.toUpperCase()} ↗
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
      <nav className="mobile-studio-tabs" aria-label="Studio sections">
        {[
          ["record", "Record"],
          ["edit", "Edit tracks"],
          ["mix", "Mix & effects"],
          ["setup", "Setup"],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-pressed={mobileView === id}
            onClick={() => setMobileView(id)}
          >
            {label}
          </button>
        ))}
      </nav>
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
            ref={playButton}
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
                  if (loopEnabled)
                    await engine.current!.loop(
                      project,
                      loopStart,
                      loopEnd,
                      metronome,
                    );
                  else
                    await engine.current!.play(project, from, undefined, {
                      metronome,
                    });
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
            <span className="mobile-record-label">
              {recording ? "Stop" : "Record"}
            </span>
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
            ? countdown > 0
              ? `Count in: ${countdown}`
              : "Recording microphone"
            : "Your next great track starts here"}
        </div>
        <span className="free-badge">FREE TO CREATE</span>
      </section>
      <section className="recording-workflow" aria-label="Recording workflow">
        <label>
          Record into
          <select
            aria-label="Recording target"
            disabled={locked}
            value={project.tracks.some((t) => t.id === armed) ? armed : ""}
            onChange={(e) => setArmed(e.target.value)}
          >
            <option value="">New vocal track</option>
            {project.tracks
              .filter((t) => t.role !== "beat")
              .map((t) => (
                <option value={t.id} key={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Count-in
          <select
            aria-label="Count-in bars"
            disabled={locked}
            value={countIn}
            onChange={(e) => setCountIn(Number(e.target.value))}
          >
            <option value={0}>Off</option>
            <option value={1}>1 bar</option>
            <option value={2}>2 bars</option>
          </select>
        </label>
        <button
          disabled={locked}
          aria-pressed={metronome}
          onClick={() => setMetronome(!metronome)}
        >
          Metronome
        </button>
        <button
          disabled={locked}
          aria-pressed={loopEnabled}
          onClick={() => setLoopEnabled(!loopEnabled)}
        >
          Loop playback
        </button>
        <button
          disabled={locked || !projectEnd(project)}
          onClick={() => {
            setLoopEnabled(true);
            setLoopStart(0);
            setLoopEnd(Math.min(1800, Math.max(0.25, projectEnd(project))));
          }}
        >
          Loop song
        </button>
        {loopEnabled && (
          <>
            <label>
              Loop start (s)
              <input
                aria-label="Loop start"
                type="number"
                min={0}
                max={1799}
                step={0.25}
                disabled={locked}
                value={loopStart}
                onChange={(e) => setLoopStart(Number(e.target.value))}
              />
            </label>
            <label>
              Loop end (s)
              <input
                aria-label="Loop end"
                type="number"
                min={0.25}
                max={1800}
                step={0.25}
                disabled={locked}
                value={loopEnd}
                onChange={(e) => setLoopEnd(Number(e.target.value))}
              />
            </label>
          </>
        )}
        <button disabled={locked} onClick={() => setRulerBars(!rulerBars)}>
          {rulerBars ? "Bars ruler" : "Seconds ruler"}
        </button>
        <small>
          Space: play/pause · R: record/stop. Count-in clicks stay out of the
          recording. Loop auditions playback only; recording stays linear.
        </small>
      </section>
      <section className="recording-tools" aria-label="Recording setup">
        <label className="voice-assist-toggle">
          <input
            type="checkbox"
            checked={voiceAssist}
            disabled={locked}
            onChange={(e) => setVoiceAssist(e.target.checked)}
          />{" "}
          Vocal level assist
        </label>
        <p className="voice-assist-hint">
          Helps quiet phone/headphone takes reach a usable volume. Original
          audio stays intact. Keep the beat below your voice in Mix & effects.
        </p>
        <VoiceCheck
          deviceId={microphoneId}
          assist={voiceAssist}
          disabled={busy || recording || playing || readOnly}
          onBusy={setBusy}
          onApply={(root, scale) => {
            const existing =
              project.tracks.find(
                (t) => t.id === selected && t.role !== "beat",
              ) ??
              project.tracks.find((t) => t.id === armed && t.role !== "beat");
            if (!existing && project.tracks.length >= 128) {
              setError("Track limit reached. Select an existing vocal track.");
              return;
            }
            const target = existing ?? newTrack("Voice tuned vocal"),
              plugins = stockPlugins(target.plugins);
            const tuned = {
              ...target,
              plugins: {
                ...plugins,
                bypass: false,
                pitch: {
                  ...plugins.pitch,
                  enabled: true,
                  root,
                  scale,
                  strength: 0.85,
                  retune: 50,
                },
              },
            };
            edit((p) => ({
              ...p,
              tracks: existing
                ? p.tracks.map((t) => (t.id === target.id ? tuned : t))
                : [...p.tracks, tuned],
            }));
            select(target.id);
            setArmed(target.id);
            setMobileView("mix");
            setMessage(
              "Voice key applied to your vocal. Check it against the beat and adjust Pitch Lock if needed.",
            );
          }}
        />
        <MicrophoneInput
          value={microphoneId}
          onChange={setMicrophoneId}
          disabled={locked || playing}
          revision={busy ? 1 : recording ? 2 : 0}
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
              accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac,.aac,.opus,.webm,.aif,.aiff,.wma"
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
          <section
            className="timeline-tools"
            aria-label="Timeline editing tools"
          >
            <label>
              Zoom
              <select
                aria-label="Timeline zoom"
                value={zoom}
                disabled={locked}
                onChange={(e) => setZoom(Number(e.target.value))}
              >
                {[16, 32, 64, 128].map((z) => (
                  <option key={z} value={z}>
                    {z / 32}×
                  </option>
                ))}
              </select>
            </label>
            {(
              ["select", "move", "draw", "slice", "mute", "erase"] as const
            ).map((t) => (
              <button
                key={t}
                disabled={locked}
                aria-pressed={tool === t}
                onClick={() => setTool(t)}
              >
                {t === "select"
                  ? "Highlight / Select"
                  : t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
            <label>
              Snap
              <select
                aria-label="Timeline snap"
                disabled={locked}
                value={snap}
                onChange={(e) => setSnap(Number(e.target.value))}
              >
                <option value={0}>Off</option>
                <option value={1}>Beat</option>
                <option value={2}>½ beat</option>
                <option value={4}>¼ beat</option>
              </select>
            </label>
            <label>
              Range start
              <input
                aria-label="Selection start"
                type="number"
                min={0}
                max={14400}
                step={0.01}
                disabled={locked}
                value={range[0]}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n) && n >= 0 && n <= 14400)
                    setRange([n, range[1]]);
                }}
              />
            </label>
            <label>
              Range end
              <input
                aria-label="Selection end"
                type="number"
                min={0}
                max={14400}
                step={0.01}
                disabled={locked}
                value={range[1]}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n) && n >= 0 && n <= 14400)
                    setRange([range[0], n]);
                }}
              />
            </label>
            <button
              disabled={locked || range[0] === range[1]}
              onClick={() => setClipSelection(clipsInRange(project, ...range))}
            >
              Select range clips
            </button>
            <button
              disabled={locked || Math.abs(range[1] - range[0]) < 0.25}
              onClick={() => {
                setLoopStart(Math.min(...range));
                setLoopEnd(Math.max(...range));
                setLoopEnabled(true);
                setPosition(Math.min(...range));
              }}
            >
              Loop selection
            </button>
            <button
              disabled={locked}
              onClick={() =>
                setClipSelection(
                  project.tracks.flatMap((t) => t.clips.map((c) => c.id)),
                )
              }
            >
              Select all clips
            </button>
            <button
              disabled={locked || !clipSelection.length}
              onClick={() => setClipboard(copyClips(project, clipSelection))}
            >
              Copy selected
            </button>
            <button
              disabled={locked || !clipSelection.length}
              onClick={() => {
                setClipboard(copyClips(project, clipSelection));
                edit((p) => ({
                  ...p,
                  tracks: p.tracks.map((t) => ({
                    ...t,
                    clips: t.clips.filter((c) => !clipSelection.includes(c.id)),
                  })),
                }));
                setClipSelection([]);
                selectClip("");
              }}
            >
              Cut selected
            </button>
            <button
              disabled={locked || !clipboard.length}
              onClick={() => {
                try {
                  edit((p) => pasteClips(p, clipboard, position));
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Could not paste clips",
                  );
                }
              }}
            >
              Paste at cursor
            </button>
            <button
              disabled={locked || !clipSelection.length}
              onClick={() =>
                edit((p) => ({
                  ...p,
                  tracks: p.tracks.map((t) => ({
                    ...t,
                    clips: t.clips.map((c) =>
                      clipSelection.includes(c.id)
                        ? { ...c, muted: !c.muted }
                        : c,
                    ),
                  })),
                }))
              }
            >
              Toggle selected mute
            </button>
            <button
              disabled={locked || !clipSelection.length}
              onClick={() => {
                edit((p) => ({
                  ...p,
                  tracks: p.tracks.map((t) => ({
                    ...t,
                    clips: t.clips.filter((c) => !clipSelection.includes(c.id)),
                  })),
                }));
                setClipSelection([]);
                selectClip("");
              }}
            >
              Delete selected
            </button>
            <button
              disabled={locked}
              onClick={() => {
                setClipSelection([]);
                setRange([0, 0]);
              }}
            >
              Clear selection
            </button>
            <span>
              {
                clipSelection.filter((id) =>
                  project.tracks.some((t) => t.clips.some((c) => c.id === id)),
                ).length
              }{" "}
              clips selected
            </span>
            <p>
              Drag the ruler to highlight time; Shift-click clips to add to
              selection. Move drags selected clips together. Draw copies the
              selected clip into a lane. Slice, mute and erase act on clicked
              clips. Undo restores edits.
            </p>
          </section>
          {selectionMenu && !locked && (
            <div
              ref={selectionMenuRef}
              className="selection-menu"
              role="dialog"
              aria-label="Selection actions"
              style={{ left: selectionMenu.x, top: selectionMenu.y }}
            >
              <div>
                <strong>{clipSelection.length} clips selected</strong>
                <button
                  aria-label="Close selection menu"
                  onClick={() => setSelectionMenu(null)}
                >
                  ×
                </button>
              </div>
              <button
                disabled={!clipSelection.length}
                onClick={() => {
                  setClipboard(copyClips(project, clipSelection));
                  setSelectionMenu(null);
                }}
              >
                Copy
              </button>
              <button
                disabled={!clipSelection.length}
                onClick={() => {
                  setClipboard(copyClips(project, clipSelection));
                  edit((p) => ({
                    ...p,
                    tracks: p.tracks.map((t) => ({
                      ...t,
                      clips: t.clips.filter(
                        (c) => !clipSelection.includes(c.id),
                      ),
                    })),
                  }));
                  setClipSelection([]);
                  selectClip("");
                  setSelectionMenu(null);
                }}
              >
                Cut
              </button>
              <button
                disabled={!clipboard.length}
                onClick={() => {
                  try {
                    edit((p) => pasteClips(p, clipboard, Math.min(...range)));
                    setSelectionMenu(null);
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : "Could not paste clips",
                    );
                  }
                }}
              >
                Paste at selection start
              </button>
              <button
                disabled={Math.abs(range[1] - range[0]) < 0.25}
                onClick={() => {
                  setLoopStart(Math.min(...range));
                  setLoopEnd(Math.max(...range));
                  setLoopEnabled(true);
                  setPosition(Math.min(...range));
                  setSelectionMenu(null);
                }}
              >
                Loop selection
              </button>
              <button
                disabled={!clipSelection.length}
                onClick={() => {
                  edit((p) => ({
                    ...p,
                    tracks: p.tracks.map((t) => ({
                      ...t,
                      clips: t.clips.map((c) =>
                        clipSelection.includes(c.id)
                          ? { ...c, muted: !c.muted }
                          : c,
                      ),
                    })),
                  }));
                  setSelectionMenu(null);
                }}
              >
                Mute / unmute selected
              </button>
              <button
                disabled={!clipSelection.length}
                onClick={() => {
                  edit((p) => ({
                    ...p,
                    tracks: p.tracks.map((t) => ({
                      ...t,
                      clips: t.clips.filter(
                        (c) => !clipSelection.includes(c.id),
                      ),
                    })),
                  }));
                  setClipSelection([]);
                  selectClip("");
                  setSelectionMenu(null);
                }}
              >
                Delete selected
              </button>
              <button
                disabled={!selected || Math.abs(range[1] - range[0]) < 0.25}
                onClick={() => {
                  const start = Math.min(...range),
                    duration = Math.abs(range[1] - range[0]);
                  patchTrack(selected, {
                    volumeMotion: {
                      id: crypto.randomUUID(),
                      start,
                      duration,
                      points: [
                        { time: 0, value: 0 },
                        { time: duration, value: 1 },
                      ],
                    },
                  });
                  setSelectionMenu(null);
                }}
              >
                Create Volume Motion
              </button>
              <small>Choose a tool</small>
              <div className="selection-tool-grid">
                {(
                  ["select", "move", "draw", "slice", "mute", "erase"] as const
                ).map((t) => (
                  <button
                    key={t}
                    aria-pressed={tool === t}
                    onClick={() => {
                      setTool(t);
                      setSelectionMenu(null);
                    }}
                  >
                    {t === "select"
                      ? "Highlight"
                      : t[0].toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div
            className="timeline-scroll"
            onContextMenu={(e) => {
              if (locked || !clipSelection.length) return;
              e.preventDefault();
              setSelectionMenu({
                x: Math.max(8, Math.min(e.clientX, window.innerWidth - 230)),
                y: Math.max(8, Math.min(e.clientY, window.innerHeight - 430)),
              });
            }}
          >
            <div style={{ width }} className="timeline">
              {range[0] !== range[1] && (
                <div
                  className="timeline-highlight"
                  style={{
                    left: Math.min(...range) * PX,
                    width: Math.abs(range[1] - range[0]) * PX,
                  }}
                />
              )}
              <div
                className="ruler"
                onPointerDown={(e) => {
                  if (locked || tool !== "select") return;
                  const r = e.currentTarget.getBoundingClientRect();
                  const time = snapTime(
                    (e.clientX - r.left) / PX,
                    project.bpm,
                    snap,
                  );
                  rangeAnchor.current = time;
                  setRange([time, time]);
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (rangeAnchor.current === null) return;
                  const r = e.currentTarget.getBoundingClientRect();
                  setRange([
                    rangeAnchor.current,
                    snapTime((e.clientX - r.left) / PX, project.bpm, snap),
                  ]);
                }}
                onPointerUp={(e) => {
                  if (rangeAnchor.current === null) return;
                  const r = e.currentTarget.getBoundingClientRect(),
                    end = snapTime(
                      (e.clientX - r.left) / PX,
                      project.bpm,
                      snap,
                    );
                  setRange([rangeAnchor.current, end]);
                  if (Math.abs(end - rangeAnchor.current) > 0.001)
                    setSelectionMenu({
                      x: Math.max(
                        8,
                        Math.min(e.clientX, window.innerWidth - 230),
                      ),
                      y: Math.max(
                        8,
                        Math.min(e.clientY + 8, window.innerHeight - 430),
                      ),
                    });
                  setClipSelection(
                    clipsInRange(project, rangeAnchor.current, end),
                  );
                  rangeAnchor.current = null;
                }}
                onPointerCancel={() => {
                  rangeAnchor.current = null;
                }}
                onClick={(e) => {
                  if (locked) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  setPosition(Math.max(0, (e.clientX - rect.left) / PX));
                }}
              >
                {Array.from(
                  {
                    length: Math.ceil(
                      width / (PX * (rulerBars ? 240 / project.bpm : 5)),
                    ),
                  },
                  (_, i) => (
                    <span
                      key={i}
                      style={{
                        left: i * PX * (rulerBars ? 240 / project.bpm : 5),
                      }}
                    >
                      {rulerBars ? String(i + 1) : clock(i * 5).slice(0, 5)}
                    </span>
                  ),
                )}
              </div>
              <div className="playhead" style={{ left: position * PX }}>
                <button
                  className="playhead-handle"
                  aria-label="Song position"
                  title="Drag to move the song position. Playback pauses while moving."
                  disabled={recording || busy}
                  onPointerDown={(e) => {
                    if (e.button !== 0 || recordFlag.current || busy) return;
                    e.preventDefault();
                    e.stopPropagation();
                    stop();
                    setSelectionMenu(null);
                    playheadDragging.current = true;
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={(e) => {
                    if (!playheadDragging.current) return;
                    const timeline = e.currentTarget.closest(".timeline");
                    const scroll = timeline?.parentElement;
                    if (!timeline || !scroll) return;
                    const edge = scroll.getBoundingClientRect();
                    if (e.clientX > edge.right - 28) scroll.scrollLeft += 18;
                    else if (e.clientX < edge.left + 28)
                      scroll.scrollLeft -= 18;
                    const rect = timeline.getBoundingClientRect();
                    setPosition(
                      Math.max(
                        0,
                        Math.min(
                          width / PX,
                          14400,
                          (e.clientX - rect.left) / PX,
                        ),
                      ),
                    );
                  }}
                  onPointerUp={(e) => {
                    playheadDragging.current = false;
                    if (e.currentTarget.hasPointerCapture(e.pointerId))
                      e.currentTarget.releasePointerCapture(e.pointerId);
                  }}
                  onPointerCancel={() => {
                    playheadDragging.current = false;
                  }}
                  onLostPointerCapture={() => {
                    playheadDragging.current = false;
                  }}
                  onKeyDown={(e) => {
                    if (
                      recordFlag.current ||
                      busy ||
                      !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                        e.key,
                      )
                    )
                      return;
                    e.preventDefault();
                    stop();
                    setPosition(
                      e.key === "Home"
                        ? 0
                        : e.key === "End"
                          ? projectEnd(project)
                          : Math.max(
                              0,
                              Math.min(
                                width / PX,
                                position +
                                  (e.key === "ArrowLeft" ? -1 : 1) *
                                    (e.shiftKey ? 5 : 0.1),
                              ),
                            ),
                    );
                  }}
                >
                  <i />
                </button>
              </div>
              {project.tracks.map((t, i) => (
                <div
                  key={t.id}
                  className={`track-lane color-${i % 4} ${selected === t.id ? "selected" : ""}`}
                  onClick={(e) => {
                    select(t.id);
                    if (
                      locked ||
                      tool !== "draw" ||
                      (e.target as HTMLElement).closest(".lane-label,button")
                    )
                      return;
                    const original = copyClips(project, [clipId]);
                    if (original.length) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      edit((p) =>
                        pasteClips(
                          p,
                          original,
                          snapTime(
                            (e.clientX - rect.left) / PX,
                            project.bpm,
                            snap,
                          ),
                          t.id,
                        ),
                      );
                    }
                  }}
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
                      className={`clip ${clipId === c.id || clipSelection.includes(c.id) ? "chosen" : ""} ${c.muted ? "muted-clip" : ""}`}
                      onPointerDown={(e) => {
                        if (
                          locked ||
                          e.shiftKey ||
                          (tool !== "move" && tool !== "select")
                        )
                          return;
                        e.stopPropagation();
                        setSelectionMenu(null);
                        const ids = clipSelection.includes(c.id)
                          ? clipSelection
                          : [c.id];
                        setClipSelection(ids);
                        selectClip(c.id);
                        clipDrag.current = {
                          x: e.clientX,
                          ids,
                          scroll:
                            e.currentTarget.closest(".timeline-scroll")
                              ?.scrollLeft ?? 0,
                        };
                        suppressClipClick.current = false;
                        e.currentTarget.setPointerCapture(e.pointerId);
                      }}
                      onPointerMove={(e) => {
                        const drag = clipDrag.current;
                        if (!drag) return;
                        const scroll =
                          e.currentTarget.closest(".timeline-scroll");
                        if (scroll) {
                          const r = scroll.getBoundingClientRect();
                          if (e.clientX > r.right - 35) scroll.scrollLeft += 18;
                          else if (e.clientX < r.left + 35)
                            scroll.scrollLeft -= 18;
                        }
                        const raw =
                          (e.clientX -
                            drag.x +
                            ((scroll?.scrollLeft ?? 0) - drag.scroll)) /
                          PX;
                        const delta = snap
                          ? snapTime(Math.abs(raw), project.bpm, snap) *
                            Math.sign(raw)
                          : raw;
                        const clips = project.tracks
                          .flatMap((t) => t.clips)
                          .filter((c) => drag.ids.includes(c.id));
                        const bounded = Math.max(
                          -Math.min(...clips.map((c) => c.start)),
                          Math.min(
                            delta,
                            14400 - Math.max(...clips.map((c) => c.start)),
                          ),
                        );
                        setDragPreview({ ids: drag.ids, delta: bounded });
                      }}
                      onPointerUp={(e) => {
                        const drag = clipDrag.current;
                        if (!drag) return;
                        clipDrag.current = null;
                        setDragPreview(null);
                        const raw =
                          (e.clientX -
                            drag.x +
                            ((e.currentTarget.closest(".timeline-scroll")
                              ?.scrollLeft ?? 0) -
                              drag.scroll)) /
                          PX;
                        const delta = snap
                          ? snapTime(Math.abs(raw), project.bpm, snap) *
                            Math.sign(raw)
                          : raw;
                        if (Math.abs(raw) > 0.05) {
                          edit((p) => moveClips(p, drag.ids, delta));
                          suppressClipClick.current = true;
                        }
                      }}
                      onPointerCancel={() => {
                        clipDrag.current = null;
                        setDragPreview(null);
                      }}
                      style={{
                        left:
                          (c.start +
                            (dragPreview?.ids.includes(c.id)
                              ? dragPreview.delta
                              : 0)) *
                          PX,
                        cursor:
                          tool === "select" || tool === "move"
                            ? dragPreview
                              ? "grabbing"
                              : "grab"
                            : undefined,
                        width: Math.max(4, c.duration * PX),
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        select(t.id);
                        selectClip(c.id);
                        if (suppressClipClick.current) {
                          suppressClipClick.current = false;
                          return;
                        }
                        if (tool === "slice") {
                          const r = e.currentTarget.getBoundingClientRect();
                          const at = snapTime(
                            c.start + (e.clientX - r.left) / PX,
                            project.bpm,
                            snap,
                          );
                          edit((p) => ({
                            ...p,
                            tracks: p.tracks.map((t) => ({
                              ...t,
                              clips: t.clips.flatMap((x) =>
                                x.id === c.id ? splitClip(x, at) : [x],
                              ),
                            })),
                          }));
                          return;
                        }
                        if (tool === "mute") {
                          patchClip(c.id, (x) => ({ ...x, muted: !x.muted }));
                          return;
                        }
                        if (tool === "erase") {
                          edit((p) => ({
                            ...p,
                            tracks: p.tracks.map((t) => ({
                              ...t,
                              clips: t.clips.filter((x) => x.id !== c.id),
                            })),
                          }));
                          return;
                        }
                        setClipSelection((ids) =>
                          e.shiftKey
                            ? ids.includes(c.id)
                              ? ids.filter((id) => id !== c.id)
                              : [...ids, c.id]
                            : [c.id],
                        );
                      }}
                    >
                      <span>
                        {t.name}
                        {c.muted ? " · Muted" : ""}
                      </span>
                      <Waveform
                        buffer={engine.current?.buffers.get(c.assetId)}
                        offset={c.offset}
                        duration={c.duration}
                      />
                    </button>
                  ))}
                  {t.volumeMotion && (
                    <button
                      className="motion-clip"
                      style={{
                        left: t.volumeMotion.start * PX,
                        width: Math.max(12, t.volumeMotion.duration * PX),
                      }}
                      disabled={locked}
                      aria-label={"Edit Volume Motion on " + t.name}
                      onClick={(e) => {
                        e.stopPropagation();
                        select(t.id);
                      }}
                    >
                      ↗ Volume Motion
                    </button>
                  )}
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
                  disabled={locked}
                  onClick={() =>
                    patchClip(clip.id, (c) => ({ ...c, muted: !c.muted }))
                  }
                >
                  {clip.muted ? "Unmute clip" : "Mute clip"}
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
              {track.clips.some((c) => c.takeId) && (
                <section className="take-picker" aria-label="Vocal takes">
                  <h3>Vocal takes</h3>
                  {[
                    ...new Map(
                      track.clips
                        .filter((c) => c.takeId)
                        .map((c) => [c.takeId, c]),
                    ).values(),
                  ].map((c, i) => (
                    <button
                      key={c.takeId}
                      disabled={locked}
                      aria-pressed={!c.muted}
                      onClick={() =>
                        edit((p) => ({
                          ...p,
                          tracks: p.tracks.map((t) =>
                            t.id === track.id
                              ? activateTake(t, c.takeGroup!, c.takeId!)
                              : t,
                          ),
                        }))
                      }
                    >
                      Take {i + 1}
                      {c.muted ? "" : " · Active"}
                    </button>
                  ))}
                  <small>
                    New takes at the same start position keep earlier takes
                    muted, not deleted.
                  </small>
                </section>
              )}
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
              <VolumeMotion
                track={track}
                disabled={locked}
                start={range[0] !== range[1] ? Math.min(...range) : position}
                end={range[0] !== range[1] ? Math.max(...range) : position + 4}
                update={(patch) => patchTrack(track.id, patch)}
              />
              {track.role !== "beat" && (
                <button
                  disabled={locked || !track.clips.length}
                  onClick={() =>
                    run(async () => {
                      const clips = track.clips.map((c) => {
                        const b = engine.current!.buffers.get(c.assetId);
                        if (!b)
                          throw new Error(
                            "Reopen this project to load the vocal audio.",
                          );
                        const level = normalizationLevel(
                          Array.from({ length: b.numberOfChannels }, (_, i) =>
                            b.getChannelData(i),
                          ),
                          b.sampleRate,
                          c,
                          -6,
                        );
                        return { ...c, level };
                      });
                      patchTrack(track.id, { clips });
                      setMessage(
                        "Vocal clip volumes balanced with headroom. Original audio is preserved; lower the beat if it masks your voice.",
                      );
                    })
                  }
                >
                  Balance vocal volume
                </button>
              )}
              <AutoKey
                key={track.id}
                tracks={project.tracks}
                track={track}
                buffers={engine.current!.buffers}
                disabled={locked}
                update={(patch) => patchTrack(track.id, patch)}
              />
              <StockRack
                track={track}
                disabled={locked}
                update={(patch) => patchTrack(track.id, patch)}
              />
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
                {!user && (
                  <p>
                    <Link href="/account" target="_blank" rel="noreferrer">
                      New here? Create your free NOIR account ↗
                    </Link>
                  </p>
                )}
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
                          const { data, error } = await supabase!.auth.signUp({
                            email,
                            password,
                            options: {
                              emailRedirectTo: window.location.origin,
                            },
                          });
                          if (error) throw error;
                          setMessage(
                            data.session
                              ? "Welcome to NOIR! Open Profile to choose your username and photo."
                              : "Check your email to confirm your account. If you already signed up, try signing in.",
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
