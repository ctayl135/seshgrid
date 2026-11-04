"use client";
import { useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import type { Project } from "@/lib/model";
import { projectEnd } from "@/lib/model";
import { GENRES, getProfile, publishMix } from "@/lib/social";
export default function PublishPanel({
  user,
  project,
  render,
  onBusy,
  navigate,
}: {
  user: User | null;
  project: Project;
  render: () => Promise<Blob>;
  onBusy: (busy: boolean) => void;
  navigate: (path: string) => void;
}) {
  const [title, setTitle] = useState(project.name.slice(0, 120)),
    [genre, setGenre] = useState("Underground"),
    [agree, setAgree] = useState(false),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [error, setError] = useState("");
  return (
    <section>
      <span className="eyebrow">RELEASE YOUR SOUND</span>
      <h2>Publish a mix</h2>
      <p>
        The finished stereo mix will be available to signed-in members on For
        You and your profile. Your project and individual recordings stay
        private.
      </p>
      {!user ? (
        <p>Sign in using the studio account button first.</p>
      ) : done ? (
        <div role="status">
          <h3>Your music is live for members.</h3>
          <Link
            href="/fyp"
            onClick={(e) => {
              e.preventDefault();
              navigate("/fyp");
            }}
          >
            Open For You
          </Link>{" "}
          ·{" "}
          <Link
            href="/profile"
            onClick={(e) => {
              e.preventDefault();
              if (!busy) navigate("/profile");
            }}
          >
            View your profile
          </Link>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!agree || busy) return;
            setBusy(true);
            onBusy(true);
            setError("");
            void (async () => {
              try {
                if (!(await getProfile(user.id)))
                  throw new Error(
                    "Create your artist profile first, then return here to publish.",
                  );
                if (!projectEnd(project) || projectEnd(project) > 240)
                  throw new Error(
                    "Publish songs up to four minutes. Trim or shorten the session first.",
                  );
                await publishMix(user.id, title, genre, await render());
                setDone(true);
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "Publishing failed. Try again.",
                );
              } finally {
                setBusy(false);
                onBusy(false);
              }
            })();
          }}
        >
          <label>
            Song title
            <input
              aria-label="Release title"
              required
              maxLength={120}
              disabled={busy}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            Genre
            <select
              aria-label="Release genre"
              disabled={busy}
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
            >
              {GENRES.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
          <label className="publish-consent">
            <input
              type="checkbox"
              checked={agree}
              disabled={busy}
              onChange={(e) => setAgree(e.target.checked)}
            />
            I have permission to share this music and want this mix visible to
            signed-in members.
          </label>
          <p className="hint">
            Up to four minutes / 50 MB. You can unpublish from your profile.
            Existing playback links expire within one minute.
          </p>
          <Link href="/profile">Create or edit artist profile</Link>
          <button
            className="primary"
            disabled={busy || !agree || !title.trim()}
          >
            {busy ? "Rendering and publishing…" : "Publish to For You"}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="social-error">
          {error}
        </p>
      )}
    </section>
  );
}
