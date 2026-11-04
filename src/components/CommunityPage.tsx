"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMember } from "./useMember";
import CommunityLinks from "./CommunityLinks";
import { supabase } from "@/lib/storage";
import {
  beats,
  messages,
  people,
  notices,
  invitations,
  sendMessage,
  communityRPC,
  conversationHeads,
  type Beat,
  type Message,
  type Person,
  type Notice,
  type Invitation,
} from "@/lib/community";
import { GENRES, getProfile, publishMix, listenURL } from "@/lib/social";
export default function CommunityPage({
  mode,
  artist = "",
}: {
  mode: "beats" | "messages" | "notifications";
  artist?: string;
}) {
  const { user, ready } = useMember(),
    [beatRows, setBeats] = useState<Beat[]>([]),
    [inbox, setInbox] = useState<Message[]>([]),
    [conversation, setConversation] = useState<Message[]>([]),
    [artists, setArtists] = useState<Person[]>([]),
    [notificationRows, setNotices] = useState<Notice[]>([]),
    [invites, setInvites] = useState<Invitation[]>([]),
    [peer, setPeer] = useState(/^[a-f0-9-]{36}$/.test(artist) ? artist : ""),
    [search, setSearch] = useState(""),
    [body, setBody] = useState(""),
    [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false),
    [urls, setURLs] = useState<Record<string, string>>({}),
    [title, setTitle] = useState(""),
    [genre, setGenre] = useState("Underground"),
    [bpm, setBpm] = useState(140),
    [notes, setNotes] = useState(
      "Contact me about usage permission and credits.",
    ),
    [allow, setAllow] = useState(false),
    [rights, setRights] = useState(false),
    [file, setFile] = useState<File | null>(null),
    [filter, setFilter] = useState("All");
  useEffect(() => {
    setPeer(/^[a-f0-9-]{36}$/.test(artist) ? artist : "");
  }, [artist]);
  const audio = useRef(new Map<string, HTMLAudioElement>()),
    generation = useRef(0);
  const refresh = async () => {
    if (!user) return;
    const revision = generation.current,
      valid = () => generation.current === revision;
    if (mode === "beats") {
      const rows = await beats();
      if (valid()) setBeats(rows);
    } else if (mode === "notifications") {
      const [n, i] = await Promise.all([notices(), invitations()]);
      if (!valid()) return;
      setNotices(n);
      setInvites(i);
    } else {
      const [m, p] = await Promise.all([messages(), people()]);
      if (!valid()) return;
      setInbox(m);
      const ids = [
        ...new Set(
          m
            .flatMap((v) => [v.sender_id, v.recipient_id])
            .concat(peer ? [peer] : []),
        ),
      ];
      const extra = ids.length
        ? await supabase!
            .from("artist_profiles")
            .select("id,display_name,genre")
            .in("id", ids)
        : { data: [] };
      if (!valid()) return;
      setArtists([
        ...new Map(
          [...p, ...((extra.data ?? []) as Person[])].map((v) => [v.id, v]),
        ).values(),
      ]);
      if (peer) {
        const rows = await messages(peer, user.id);
        if (!valid()) return;
        setConversation(rows.reverse());
        await communityRPC("read_inbox", { p_sender: peer });
      } else setConversation([]);
    }
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    let active = true;
    generation.current++;
    setInbox([]);
    setConversation([]);
    setArtists([]);
    setNotices([]);
    setInvites([]);
    setURLs({});
    setBody("");
    setTitle("");
    setFile(null);
    setRights(false);
    setAllow(false);
    setError("");
    if (user)
      void refresh().catch((e) => {
        if (active) setError(e.message ?? "Could not load community");
      });
    else {
      setBeats([]);
      setInbox([]);
      setConversation([]);
      setArtists([]);
      setNotices([]);
      setInvites([]);
      setURLs({});
      audio.current.forEach((a) => a.pause());
    }
    const timer = setInterval(() => {
      if (active && user && document.visibilityState === "visible")
        void refresh().catch(() => {});
    }, 15000);
    return () => {
      active = false;
      generation.current++;
      clearInterval(timer);
    };
  }, [user?.id, peer, mode]);
  const names = new Map(artists.map((p) => [p.id, p.display_name])),
    threads = conversationHeads(inbox, user?.id ?? "");
  const selected = names.get(peer) ?? "artist",
    pending = new Map(invites.map((i) => [i.id, i]));
  return (
    <main className="social-page community-page">
      <nav className="social-nav">
        <Link className="home-logo" href="/">
          NOIR
        </Link>
        <div>
          <Link href="/">Home</Link>
          <Link href="/sessions">Sessions</Link>
          <CommunityLinks />
          <Link href="/profile">Profile</Link>
        </div>
      </nav>
      <header className="social-hero">
        <span className="eyebrow">NOIR COMMUNITY · FREE TO CREATE</span>
        <h1>
          {mode === "beats"
            ? "Find your next sound."
            : mode === "messages"
              ? "Direct messages."
              : "Your notifications."}
        </h1>
        <p>
          {mode === "beats"
            ? "Beats from producers. Meet your next collaborator and build something together."
            : mode === "messages"
              ? "Talk directly with artists and producers. Text messages are private to the two participants."
              : "Song invitations, replies and updates in one place."}
        </p>
      </header>
      {!ready ? (
        <p>Loading account…</p>
      ) : !user ? (
        <section className="social-card">
          <h2>Sign in to join in</h2>
          <p>
            Community features are available to signed-in members during private
            testing.
          </p>
          <Link href="/studio?account=1">Sign in</Link>
        </section>
      ) : (
        <>
          <button disabled={busy} onClick={() => void run(refresh)}>
            Refresh {mode}
          </button>
          {mode === "beats" && (
            <>
              <details className="social-card beat-upload">
                <summary>＋ Post a beat</summary>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      if (!rights || !file)
                        throw new Error(
                          "Choose a WAV and confirm sharing permission.",
                        );
                      if (!(await getProfile(user.id)))
                        throw new Error("Create your artist profile first.");
                      if (file.size > 50 * 1024 * 1024)
                        throw new Error("Use a WAV under 50 MB.");
                      const h = new TextDecoder().decode(
                        await file.slice(0, 12).arrayBuffer(),
                      );
                      if (!h.startsWith("RIFF") || !h.endsWith("WAVE"))
                        throw new Error("Upload a valid WAV file.");
                      const ctx = new AudioContext();
                      let duration = 0;
                      try {
                        duration = (
                          await ctx.decodeAudioData(await file.arrayBuffer())
                        ).duration;
                      } finally {
                        await ctx.close();
                      }
                      if (duration > 240)
                        throw new Error("Post beats up to four minutes.");
                      await publishMix(
                        user.id,
                        title,
                        genre,
                        new Blob([file], { type: "audio/wav" }),
                        {
                          bpm,
                          license_notes: notes,
                          allow_session_use: allow,
                          duration,
                        },
                      );
                      setStatus("Beat posted. Artists can find it below.");
                      setTitle("");
                      setRights(false);
                      await refresh();
                    });
                  }}
                >
                  <label>
                    Beat title
                    <input
                      aria-label="Beat title"
                      required
                      maxLength={120}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </label>
                  <label>
                    WAV audio
                    <input
                      aria-label="Beat WAV"
                      type="file"
                      accept=".wav,audio/wav"
                      required
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  <label>
                    BPM
                    <input
                      aria-label="Beat BPM"
                      type="number"
                      required
                      min={30}
                      max={300}
                      value={bpm}
                      onChange={(e) => setBpm(Number(e.target.value))}
                    />
                  </label>
                  <label>
                    Genre
                    <select
                      aria-label="Beat genre"
                      value={genre}
                      onChange={(e) => setGenre(e.target.value)}
                    >
                      {GENRES.map((g) => (
                        <option key={g}>{g}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Usage and credit notes
                    <textarea
                      aria-label="Beat usage notes"
                      maxLength={300}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </label>
                  <label className="publish-consent">
                    <input
                      type="checkbox"
                      checked={allow}
                      onChange={(e) => setAllow(e.target.checked)}
                    />
                    Artists may start sessions with this beat under these usage
                    notes.
                  </label>
                  <label className="publish-consent">
                    <input
                      type="checkbox"
                      checked={rights}
                      onChange={(e) => setRights(e.target.checked)}
                    />
                    I have permission to post this beat and share it with
                    members.
                  </label>
                  <button
                    disabled={busy || !rights || !file}
                    className="primary"
                  >
                    {busy ? "Posting…" : "Post beat"}
                  </button>
                  <Link href="/profile">Create or edit profile</Link>
                </form>
              </details>
              <label>
                Genre
                <select
                  aria-label="Browse beat genre"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option>All</option>
                  {GENRES.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </label>
              <div className="release-grid">
                {beatRows
                  .filter((b) => filter === "All" || b.genre === filter)
                  .map((b) => (
                    <article className="release-card" key={b.id}>
                      <div className="release-art">≋</div>
                      <span className="eyebrow">
                        {b.genre} · {b.bpm ?? "—"} BPM
                      </span>
                      <h3>{b.title}</h3>
                      <Link href={"/profile?artist=" + b.owner_id}>
                        {b.artist_profiles?.display_name ?? "Producer"}
                      </Link>
                      <p>{b.license_notes}</p>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            audio.current.forEach((a) => a.pause());
                            setURLs((v) => ({ ...v }));
                            const url = await listenURL(b.audio_path);
                            setURLs((v) => ({ ...v, [b.id]: url }));
                          })
                        }
                      >
                        {urls[b.id] ? "Refresh player" : "Listen"}
                      </button>
                      {urls[b.id] && (
                        <audio
                          controls
                          preload="none"
                          src={urls[b.id]}
                          ref={(el) => {
                            if (el) audio.current.set(b.id, el);
                            else audio.current.delete(b.id);
                          }}
                          onPlay={() =>
                            audio.current.forEach((a, id) => {
                              if (id !== b.id) a.pause();
                            })
                          }
                        />
                      )}
                      <Link
                        className="community-action"
                        href={"/messages?artist=" + b.owner_id}
                      >
                        Message producer
                      </Link>
                      {b.allow_session_use && (
                        <Link
                          className="community-action"
                          href={"/studio?beat=" + b.id}
                        >
                          Use in session ↗
                        </Link>
                      )}
                    </article>
                  ))}
              </div>
              {!beatRows.length && (
                <p>
                  No beats posted yet. Producers can post the first one above.
                </p>
              )}
            </>
          )}
          {mode === "messages" && (
            <div className="dm-layout">
              <aside className="social-card">
                <h2>Artists & conversations</h2>
                <div className="artist-search">
                  <input
                    aria-label="Search message recipients"
                    placeholder="Artist name"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => setArtists(await people(search)))
                    }
                  >
                    Find artists
                  </button>
                </div>
                {artists
                  .filter((p) => p.id !== user.id)
                  .map((p) => (
                    <button
                      className="dm-person"
                      aria-pressed={peer === p.id}
                      key={p.id}
                      onClick={() => setPeer(p.id)}
                    >
                      {p.display_name}
                    </button>
                  ))}
                <h3>Recent conversations</h3>
                {threads.map((t) => (
                  <button
                    className="dm-person"
                    key={t.id}
                    onClick={() => setPeer(t.id)}
                  >
                    {names.get(t.id) ?? "Artist"}
                    <small>
                      {t.message.body.slice(0, 60)}
                      {t.message.recipient_id === user.id && !t.message.read_at
                        ? " · NEW"
                        : ""}
                    </small>
                  </button>
                ))}
              </aside>
              <section className="social-card dm-conversation">
                <h2>
                  {peer ? "Conversation with " + selected : "Choose an artist"}
                </h2>
                {peer && peer !== user.id ? (
                  <>
                    <div
                      className="message-list"
                      aria-label="Conversation messages"
                    >
                      {conversation.map((m) => (
                        <article
                          className={
                            m.sender_id === user.id
                              ? "message own-message"
                              : "message"
                          }
                          key={m.id}
                        >
                          <strong>
                            {m.sender_id === user.id
                              ? "You"
                              : (names.get(m.sender_id) ?? "Artist")}
                          </strong>
                          <p>{m.body}</p>
                          <small>
                            {new Date(m.created_at).toLocaleString()}
                          </small>
                        </article>
                      ))}
                    </div>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void run(async () => {
                          await sendMessage(user.id, peer, body);
                          setBody("");
                          await refresh();
                        });
                      }}
                    >
                      <label>
                        Message
                        <textarea
                          aria-label="Direct message"
                          required
                          maxLength={2000}
                          value={body}
                          onChange={(e) => setBody(e.target.value)}
                        />
                      </label>
                      <button
                        disabled={busy || !body.trim()}
                        className="primary"
                      >
                        Send message
                      </button>
                    </form>
                    <p className="hint">
                      Recent 200 messages in this conversation. Inbox checks for
                      updates every 15 seconds.
                    </p>
                  </>
                ) : (
                  <p>
                    Select someone from the artist list to start a private
                    conversation.
                  </p>
                )}
              </section>
            </div>
          )}
          {mode === "notifications" && (
            <section className="notification-list">
              <button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await communityRPC("read_inbox", {});
                    await refresh();
                  })
                }
              >
                Mark all read
              </button>
              {notificationRows.map((n) => {
                const inv = n.invite_id ? pending.get(n.invite_id) : undefined;
                return (
                  <article
                    className={
                      n.read_at ? "social-card" : "social-card unread-notice"
                    }
                    key={n.id}
                  >
                    <span className="eyebrow">
                      {n.read_at ? "READ" : "NEW"}
                    </span>
                    <h3>{n.title}</h3>
                    <p>{new Date(n.created_at).toLocaleString()}</p>
                    {inv && (
                      <p>
                        {inv.project_name} · {inv.role} · {inv.status}
                      </p>
                    )}
                    {inv && (
                      <Link href={"/profile?artist=" + inv.invited_by}>
                        View inviting artist ↗
                      </Link>
                    )}
                    {inv?.member_id === user.id && inv.status === "pending" ? (
                      <div>
                        <button
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              await communityRPC("respond_invitation", {
                                p_id: inv.id,
                                p_accept: true,
                              });
                              setStatus(
                                "Invitation accepted. The song is now available in Sessions.",
                              );
                              await refresh();
                            })
                          }
                        >
                          Accept invitation
                        </button>
                        <button
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              await communityRPC("respond_invitation", {
                                p_id: inv.id,
                                p_accept: false,
                              });
                              await refresh();
                            })
                          }
                        >
                          Decline
                        </button>
                        <p className="hint">
                          Accepting grants access to the session’s source audio.
                          Editors can save changes; listen-only members cannot
                          edit the shared version.
                        </p>
                      </div>
                    ) : inv?.status === "accepted" ? (
                      <Link
                        href={
                          "/studio?project=" + inv.project_id + "&source=cloud"
                        }
                      >
                        Open shared song ↗
                      </Link>
                    ) : (
                      !inv && (
                        <Link
                          href={
                            n.link.startsWith("/messages?artist=") ||
                            n.link.startsWith("/studio?project=")
                              ? n.link
                              : "/sessions"
                          }
                        >
                          Open update ↗
                        </Link>
                      )
                    )}
                  </article>
                );
              })}
              {!notificationRows.length && (
                <p>
                  You’re all caught up. Invitations and message notifications
                  will appear here.
                </p>
              )}
            </section>
          )}
        </>
      )}
      {error && (
        <p className="social-error" role="alert">
          {error}
        </p>
      )}
      {status && <p role="status">{status}</p>}
      <footer>NOIR · BY NEW AGE MUSIC · FREE TO CREATE</footer>
    </main>
  );
}
