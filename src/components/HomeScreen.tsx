"use client";
import CommunityLinks from "./CommunityLinks";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listLocal, listCloud, supabase } from "@/lib/storage";
import { listRecovery, type RecoverySummary } from "@/lib/recovery";
import { validateProject } from "@/lib/model";
type SessionCard = {
  id: string;
  name: string;
  date: string;
  source: "local" | "cloud";
  tracks?: number;
  shared?: boolean;
};
export default function HomeScreen({
  sessions = false,
}: {
  sessions?: boolean;
}) {
  const [items, setItems] = useState<SessionCard[]>([]),
    [drafts, setDrafts] = useState<RecoverySummary[]>([]),
    [signedIn, setSignedIn] = useState(false),
    [loading, setLoading] = useState(true),
    [warning, setWarning] = useState(""),
    [search, setSearch] = useState(""),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setWarning("");
    const load = async () => {
      const user = supabase
        ? await supabase.auth
            .getUser()
            .then((r) => r.data.user)
            .catch(() => null)
        : null;
      const results = await Promise.allSettled([
        listLocal(),
        user ? listCloud() : Promise.resolve([]),
        listRecovery(),
      ]);
      if (!active) return;
      setSignedIn(!!user);
      const combined = new Map<string, SessionCard>();
      if (results[0].status === "fulfilled")
        for (const saved of results[0].value) {
          try {
            const p = validateProject(saved.project);
            combined.set(p.id, {
              id: p.id,
              name: p.name,
              date: p.updatedAt,
              source: "local",
              tracks: p.tracks.length,
            });
          } catch {}
        }
      if (results[1].status === "fulfilled")
        for (const p of results[1].value) {
          const old = combined.get(p.id);
          if (
            !old ||
            p.owner_id !== user?.id ||
            Date.parse(p.updated_at) > Date.parse(old.date)
          )
            combined.set(p.id, {
              id: p.id,
              name: p.name,
              date: p.updated_at,
              source: "cloud",
              shared: p.owner_id !== user?.id,
            });
        }
      setItems(
        [...combined.values()].sort((a, b) => b.date.localeCompare(a.date)),
      );
      if (results[2].status === "fulfilled") setDrafts(results[2].value);
      else setDrafts([]);
      if (results.some((r) => r.status === "rejected"))
        setWarning(
          "Some sessions could not be loaded. Refresh, or open a downloaded project backup.",
        );
      setLoading(false);
    };
    void load();
    const sub = supabase?.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT")
        setRefresh((v) => v + 1);
    });
    return () => {
      active = false;
      sub?.data.subscription.unsubscribe();
    };
  }, [refresh]);
  const matches = items.filter((p) =>
      p.name.toLowerCase().includes(search.toLowerCase()),
    ),
    visible = sessions ? matches : matches.slice(0, 3);
  return (
    <main className="noir-home">
      <nav className="home-nav" aria-label="Main navigation">
        <Link className="home-logo" href="/">
          NOIR<span>BY NEW AGE MUSIC</span>
        </Link>
        <div className="home-tabs">
          <Link href="/" aria-current={!sessions ? "page" : undefined}>
            Home
          </Link>
          <Link href="/sessions" aria-current={sessions ? "page" : undefined}>
            Sessions
          </Link>
          <Link href="/fyp">For You</Link>
          <CommunityLinks />
          <Link href="/profile">Profile</Link>
        </div>
        <Link className="home-account" href="/studio?account=1">
          {signedIn ? "Account" : "Sign in"}
        </Link>
      </nav>
      <section className="home-hero">
        <div>
          <span className="eyebrow">
            {sessions ? "YOUR WORKSPACE" : "INDEPENDENT SOUND. MADE HERE."}
          </span>
          <h1>
            {sessions ? (
              "Your sessions."
            ) : (
              <>
                Make noise.
                <br />
                <em>Leave a mark.</em>
              </>
            )}
          </h1>
          <p>
            {sessions
              ? "Start fresh or pick up where you left off. Your saved audio, edits and mix settings come with you."
              : "A free studio for your beats, vocals and next underground release. Open a session when you’re ready to create."}
          </p>
          <div className="home-actions">
            <Link className="home-primary" href="/studio">
              ＋ New session
            </Link>
            <Link
              className="home-secondary"
              href={sessions ? "/studio?open=projects" : "/sessions"}
            >
              {sessions ? "Open project backup" : "Open existing session"}
            </Link>
          </div>
        </div>
        <div className="home-art" aria-hidden="true">
          <span className="home-art-top">NOIR / STUDIO 01</span>
          <div className="home-wave">
            {Array.from({ length: 35 }, (_, i) => (
              <i
                key={i}
                style={{
                  height:
                    20 +
                    Math.abs(Math.sin(i * 1.7)) * 95 +
                    Math.abs(Math.cos(i * 0.4)) * 35 +
                    "px",
                }}
              />
            ))}
          </div>
          <span className="home-art-bottom">BEATS / VOCALS / YOUR WORLD</span>
        </div>
      </section>
      <section
        className="home-library"
        aria-label={sessions ? "Saved sessions" : "Recent sessions"}
      >
        <div className="home-section-title">
          <div>
            <span className="eyebrow">PICK UP THE SESSION</span>
            <h2>{sessions ? "Saved sessions" : "Recent sessions"}</h2>
          </div>
          <div>
            {!sessions && <Link href="/sessions">All sessions ↗</Link>}
            <button disabled={loading} onClick={() => setRefresh((v) => v + 1)}>
              Refresh sessions
            </button>
          </div>
        </div>
        {sessions && (
          <input
            className="session-search"
            aria-label="Search saved sessions"
            placeholder="Search saved sessions"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}
        {warning && (
          <p role="alert" className="social-error">
            {warning}
          </p>
        )}
        {loading ? (
          <p role="status">Loading your sessions…</p>
        ) : visible.length ? (
          <div className="session-card-grid">
            {visible.map((p) => (
              <Link
                className="session-card"
                key={p.id}
                href={
                  "/studio?project=" +
                  encodeURIComponent(p.id) +
                  "&source=" +
                  p.source
                }
              >
                <span className="session-card-icon">≋</span>
                <small>
                  {p.shared
                    ? "SHARED SESSION"
                    : p.source === "cloud"
                      ? "PRIVATE CLOUD"
                      : "THIS BROWSER"}
                </small>
                <h3>{p.name}</h3>
                <p>
                  {p.tracks !== undefined ? p.tracks + " tracks · " : ""}
                  {new Date(p.date).toLocaleDateString()}
                </p>
                <b>Open session ↗</b>
              </Link>
            ))}
          </div>
        ) : (
          <div className="home-empty">
            <h3>
              {search
                ? "No matching sessions"
                : "Your next song starts with a session."}
            </h3>
            <p>
              {search
                ? "Try a different name."
                : "Save your work in the studio and it will appear here. Browser saves belong to this site address."}
            </p>
            <Link href="/studio">Create a new session ↗</Link>
          </div>
        )}
        {!signedIn && !loading && (
          <p className="home-note">
            Sign in to include your private cloud sessions. Browser projects are
            available without an account.
          </p>
        )}
      </section>
      {drafts.length > 0 && (
        <section className="home-recovery">
          <h2>Unsaved sessions found</h2>
          <p>Restore a recovery draft, then save it in the studio.</p>
          {drafts.map((d) => (
            <Link
              key={d.id}
              href={
                "/studio?project=" +
                encodeURIComponent(d.id) +
                "&source=recovery"
              }
            >
              <strong>{d.name}</strong>
              <span>
                {d.tracks} tracks · {new Date(d.savedAt).toLocaleString()}
              </span>
              <b>Restore draft ↗</b>
            </Link>
          ))}
        </section>
      )}
      {!sessions && (
        <section className="home-destinations">
          <Link href="/fyp">
            <span>DISCOVER</span>
            <h2>Find your next obsession.</h2>
            <p>Listen to music artists choose to share on For You.</p>
            <b>Explore For You ↗</b>
          </Link>
          <Link href="/profile">
            <span>YOUR IDENTITY</span>
            <h2>Build your artist page.</h2>
            <p>Your name, your bio and the releases you put out.</p>
            <b>Open profile ↗</b>
          </Link>
        </section>
      )}
      <footer>NOIR · BY NEW AGE MUSIC · FREE TO CREATE</footer>
    </main>
  );
}
