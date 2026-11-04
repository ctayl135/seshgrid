"use client";
import CommunityLinks from "./CommunityLinks";
import ArtistNetwork from "./ArtistNetwork";
import ArtistAvatar from "./ArtistAvatar";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/storage";
import {
  GENRES,
  getProfile,
  saveProfile,
  uploadAvatar,
  releases,
  listenURL,
  setPublished,
  type Release,
  type ArtistProfile,
} from "@/lib/social";
export default function SocialPage({
  mode,
  artistId = "",
}: {
  mode: "profile" | "feed";
  artistId?: string;
}) {
  const [user, setUser] = useState<User | null>(null),
    [loaded, setLoaded] = useState(false),
    [artist, setArtist] = useState<ArtistProfile | null>(null),
    [items, setItems] = useState<Release[]>([]),
    [name, setName] = useState(""),
    [username, setUsername] = useState(""),
    [website, setWebsite] = useState(""),
    [photo, setPhoto] = useState<File | null>(null),
    [bio, setBio] = useState(""),
    [genre, setGenre] = useState("Underground"),
    [filter, setFilter] = useState("All"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [urls, setURLs] = useState<Record<string, string>>({}),
    [target, setTarget] = useState("");
  const audio = useRef(new Map<string, HTMLAudioElement>()),
    request = useRef(0);
  const refresh = async (_u: User, id: string) => {
    const revision = request.current;
    const [profile, posts] = await Promise.all([
      getProfile(id),
      releases(mode === "profile" ? id : undefined),
    ]);
    if (revision !== request.current) return;
    setArtist(profile);
    setName(profile?.display_name ?? _u.user_metadata?.display_name ?? "");
    setUsername(profile?.username ?? "");
    setWebsite(profile?.website ?? "");
    setBio(profile?.bio ?? "");
    setGenre(profile?.genre ?? "Underground");
    setItems(posts);
  };
  useEffect(() => {
    let active = true;
    request.current++;
    setLoaded(false);
    setError("");
    setURLs({});
    const load = async () => {
      try {
        const { data, error } = await supabase!.auth.getUser();
        if (error && data.user) throw error;
        if (!active) return;
        setUser(data.user);
        const id = artistId || data.user?.id || "";
        setTarget(id);
        if (data.user && id) await refresh(data.user, id);
      } catch (e) {
        if (active)
          setError(e instanceof Error ? e.message : "Could not load music");
      } finally {
        if (active) setLoaded(true);
      }
    };
    if (supabase) void load();
    else setLoaded(true);
    const sub = supabase?.auth.onAuthStateChange((_event, s) => {
      if (!s) {
        request.current++;
        audio.current.forEach((a) => a.pause());
        setUser(null);
        setItems([]);
        setURLs({});
      }
    });
    return () => {
      active = false;
      request.current++;
      sub?.data.subscription.unsubscribe();
    };
  }, [mode, artistId]);
  const own = user?.id === target,
    run = async (fn: () => Promise<void>) => {
      setBusy(true);
      setError("");
      try {
        await fn();
      } catch (e) {
        setError(
          typeof e === "object" && e && "code" in e && e.code === "23505"
            ? "That username is taken. Try another one."
            : e instanceof Error
              ? e.message
              : "Could not save. Check your details and try again.",
        );
      } finally {
        setBusy(false);
      }
    };
  const play = (post: Release) =>
    void run(async () => {
      const revision = ++request.current;
      audio.current.forEach((a) => a.pause());
      const url = await listenURL(post.audio_path);
      if (revision !== request.current) return;
      setURLs((v) => ({ ...v, [post.id]: url }));
      setMessage(
        "Press play on the player below. Playback links expire after one minute; Listen again refreshes them.",
      );
    });
  const visible = items
    .filter(
      (p) =>
        (mode === "profile" || p.published) &&
        (filter === "All" || p.genre === filter),
    )
    .sort((a, b) =>
      mode === "feed"
        ? Number(b.genre === artist?.genre) -
            Number(a.genre === artist?.genre) ||
          b.created_at.localeCompare(a.created_at)
        : 0,
    );
  return (
    <main className="social-page">
      <nav className="social-nav">
        <Link href="/" className="brand">
          NOIR
        </Link>
        <div>
          <Link href="/">Home</Link>
          <Link href="/sessions">Sessions</Link>
          <Link href="/fyp">For You</Link>
          <CommunityLinks />
          <Link href="/profile">Profile</Link>
        </div>
      </nav>
      {mode === "profile" && user && !own && (
        <Link className="community-action" href={"/messages?artist=" + target}>
          Message artist
        </Link>
      )}
      <header className="social-hero">
        {mode === "profile" && artist && (
          <ArtistAvatar path={artist.avatar_path} name={artist.display_name} />
        )}
        <span className="eyebrow">BY NEW AGE MUSIC · FREE TO CREATE</span>
        <h1>
          {mode === "feed"
            ? "Your next obsession."
            : artist?.display_name || "Your artist profile."}
        </h1>
        <p>
          {mode === "feed"
            ? "Underground music from the artists creating here. Fresh uploads, with your genre first."
            : artist?.bio || "Your name. Your sound. Your own lane."}
        </p>
        {mode === "profile" && artist?.username && <p>@{artist.username}</p>}
        {mode === "profile" && artist?.website && (
          <a
            href={artist.website}
            target="_blank"
            rel="noopener noreferrer nofollow"
          >
            Artist website ↗
          </a>
        )}
      </header>
      {!loaded ? (
        <p>Loading music…</p>
      ) : !user ? (
        <section className="social-card">
          <h2>Join the session</h2>
          <p>
            Create your free account to make your artist profile, follow
            creators and share finished songs.
          </p>
          <Link href="/account">Create account or sign in</Link>
        </section>
      ) : (
        <>
          {mode === "profile" && own && (
            <form
              className="profile-form social-card"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  let path = artist?.avatar_path ?? null;
                  if (photo) path = await uploadAvatar(user.id, photo);
                  try {
                    await saveProfile(user.id, name, bio, genre, {
                      username,
                      website,
                      avatar_path: path,
                    });
                  } catch (e) {
                    if (photo && path)
                      await supabase!.storage
                        .from("artist-avatars")
                        .remove([path]);
                    throw e;
                  }
                  if (photo && artist?.avatar_path)
                    await supabase!.storage
                      .from("artist-avatars")
                      .remove([artist.avatar_path]);
                  setPhoto(null);
                  await refresh(user, user.id);
                  setMessage("Artist profile saved.");
                });
              }}
            >
              <h2>
                {artist
                  ? "Make it yours"
                  : "Welcome to NOIR — make yourself at home"}
              </h2>
              <p>
                Choose your name and photo, then start a session or meet other
                artists. You can edit these anytime.
              </p>
              <label>
                Username
                <input
                  aria-label="Username"
                  required
                  minLength={3}
                  maxLength={24}
                  pattern="[a-z0-9_]{3,24}"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                />
              </label>
              <p>
                3–24 letters, numbers or underscores. Your artist name can be
                different.
              </p>
              <label>
                Profile photo
                <input
                  aria-label="Profile photo"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                />
              </label>
              <p>JPG, PNG or WebP, up to 2 MB. {photo?.name}</p>
              <label>
                Website (optional)
                <input
                  aria-label="Artist website"
                  type="url"
                  placeholder="https://"
                  maxLength={200}
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </label>
              <label>
                Artist name
                <input
                  aria-label="Artist name"
                  required
                  maxLength={60}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                Bio
                <textarea
                  aria-label="Artist bio"
                  maxLength={500}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                />
              </label>
              <label>
                Your sound
                <select
                  aria-label="Profile genre"
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                >
                  {GENRES.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </label>
              <button className="primary" disabled={busy}>
                Save profile
              </button>
              <Link href="/studio">Start a session ↗</Link>{" "}
              <Link href="/presets">Find your sound ↗</Link>
            </form>
          )}
          <ArtistNetwork viewer={user.id} artist={target} />
          <section className="release-section">
            <div className="library-heading">
              <h2>{mode === "feed" ? "For You" : "Releases"}</h2>
              <label>
                Genre
                <select
                  aria-label="Filter music genre"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option>All</option>
                  {GENRES.map((g) => (
                    <option key={g}>{g}</option>
                  ))}
                </select>
              </label>
              <button
                disabled={busy}
                onClick={() => void run(() => refresh(user, target))}
              >
                Refresh music
              </button>
            </div>
            <div className="release-grid">
              {visible.map((post) => (
                <article className="release-card" key={post.id}>
                  <div className="release-art" aria-hidden="true">
                    {post.title.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="eyebrow">
                    {post.genre}
                    {!post.published ? " · UNPUBLISHED" : ""}
                  </span>
                  <h3>{post.title}</h3>
                  <Link href={"/profile?artist=" + post.owner_id}>
                    {post.artist_profiles?.display_name || "Independent artist"}
                  </Link>
                  <p>{new Date(post.created_at).toLocaleDateString()}</p>
                  <button disabled={busy} onClick={() => play(post)}>
                    {urls[post.id] ? "Listen again" : "Listen"}
                  </button>
                  {urls[post.id] && (
                    <audio
                      controls
                      preload="none"
                      src={urls[post.id]}
                      ref={(el) => {
                        if (el) audio.current.set(post.id, el);
                        else audio.current.delete(post.id);
                      }}
                      onPlay={() =>
                        audio.current.forEach((a, id) => {
                          if (id !== post.id) a.pause();
                        })
                      }
                      onError={() =>
                        setMessage(
                          "Playback link expired or audio unavailable. Choose Listen again.",
                        )
                      }
                    />
                  )}
                  {own && mode === "profile" && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await setPublished(post.id, !post.published);
                          await refresh(user, target);
                          setMessage(
                            post.published
                              ? "Release unpublished. Existing playback links expire within one minute."
                              : "Release published to members.",
                          );
                        })
                      }
                    >
                      {post.published ? "Unpublish" : "Republish"}
                    </button>
                  )}
                </article>
              ))}
            </div>
            {!visible.length && (
              <div className="social-card">
                <h3>
                  {mode === "feed"
                    ? "The next wave starts here."
                    : "No releases yet."}
                </h3>
                <p>
                  Publish a mix from the studio to add real music here. Projects
                  and source recordings stay private.
                </p>
                <Link href="/studio">Make a song</Link>
              </div>
            )}
          </section>
        </>
      )}
      {error && (
        <p role="alert" className="social-error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <footer>NOIR · BY NEW AGE MUSIC</footer>
    </main>
  );
}
