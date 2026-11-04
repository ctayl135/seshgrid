"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/storage";
import ArtistAvatar from "./ArtistAvatar";
import type { ArtistProfile } from "@/lib/social";
type Person = ArtistProfile & { followed: boolean };
export default function DiscoverArtists({
  viewer,
  onChanged,
}: {
  viewer: string;
  onChanged: () => void;
}) {
  const [query, setQuery] = useState(""),
    [results, setResults] = useState<Person[]>([]),
    [suggested, setSuggested] = useState<Person[]>([]),
    [loading, setLoading] = useState(false),
    [pending, setPending] = useState(""),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  const gen = useRef(0),
    lock = useRef(false);
  useEffect(() => {
    const n = ++gen.current;
    setLoading(true);
    setError("");
    const timer = setTimeout(() => {
      if (!supabase) return;
      void Promise.all([
        supabase.rpc("discover_artists", {
          search_text: query.trim().replace(/^@/, ""),
          suggestions: false,
        }),
        supabase.rpc("discover_artists", {
          search_text: "",
          suggestions: true,
        }),
      ])
        .then(([a, b]) => {
          if (n !== gen.current) return;
          if (a.error) throw a.error;
          if (b.error) throw b.error;
          setResults(a.data ?? []);
          setSuggested(b.data ?? []);
        })
        .catch((e) => {
          if (n === gen.current)
            setError(e.message || "Could not find artists");
        })
        .finally(() => {
          if (n === gen.current) setLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      gen.current++;
    };
  }, [query, viewer, revision]);
  const toggle = async (p: Person) => {
    if (!supabase || lock.current) return;
    lock.current = true;
    setPending(p.id);
    setError("");
    try {
      const r = p.followed
        ? await supabase
            .from("artist_follows")
            .delete()
            .eq("follower_id", viewer)
            .eq("artist_id", p.id)
        : await supabase
            .from("artist_follows")
            .upsert(
              { follower_id: viewer, artist_id: p.id },
              { onConflict: "follower_id,artist_id", ignoreDuplicates: true },
            );
      if (r.error) throw r.error;
      setResults((v) =>
        v.map((a) => (a.id === p.id ? { ...a, followed: !p.followed } : a)),
      );
      setSuggested((v) => v.filter((a) => a.id !== p.id));
      setRevision((v) => v + 1);
      onChanged();
    } catch (e) {
      setError(
        typeof e === "object" && e && "code" in e && e.code === "23503"
          ? "Save your artist profile first, then follow artists."
          : "Could not update follow. Please try again.",
      );
    } finally {
      lock.current = false;
      setPending("");
    }
  };
  const card = (p: Person) => (
    <article className="release-card" key={p.id}>
      <ArtistAvatar path={p.avatar_path} name={p.display_name} />
      <h3>
        <Link href={"/profile?artist=" + p.id}>{p.display_name}</Link>
      </h3>
      {p.username && <p>@{p.username}</p>}
      <p>{p.genre}</p>
      <button
        disabled={!!pending || loading}
        aria-pressed={p.followed}
        onClick={() => void toggle(p)}
      >
        {pending === p.id
          ? "Saving…"
          : p.followed
            ? "Following · Unfollow"
            : "Follow " + p.display_name}
      </button>
    </article>
  );
  return (
    <section aria-label="Discover artists">
      <h2>Find your people</h2>
      <label>
        Search artist names or @usernames
        <input
          type="search"
          aria-label="Search artists"
          placeholder="Search a name or @username"
          maxLength={60}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <p role="status">
        {loading
          ? "Finding artists…"
          : query.trim()
            ? results.length + " matching accounts (up to 50)"
            : "Explore artists, or search for someone specific."}
      </p>
      {!loading && query.trim() && !results.length && (
        <p>No accounts match. Try a different name or username.</p>
      )}
      {query.trim() && <div className="release-grid">{results.map(card)}</div>}
      <h2>Suggested accounts</h2>
      <p>Artists you don’t follow yet, with your music genre first.</p>
      <div className="release-grid">{suggested.map(card)}</div>
      {!loading && !suggested.length && (
        <p>You’re caught up. Check back as more artists join.</p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
