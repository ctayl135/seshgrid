"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/storage";
import type { ArtistProfile } from "@/lib/social";

export default function ArtistNetwork({
  viewer,
  artist,
}: {
  viewer: string;
  artist: string;
}) {
  const [people, setPeople] = useState<ArtistProfile[]>([]),
    [followers, setFollowers] = useState(0),
    [following, setFollowing] = useState(0),
    [active, setActive] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [query, setQuery] = useState("");
  const generation = useRef(0),
    lock = useRef(false);
  useEffect(() => {
    const id = ++generation.current;
    setPeople([]);
    setError("");
    setActive(false);
    setFollowers(0);
    setFollowing(0);
    if (!supabase || !viewer || !artist) return;
    void Promise.all([
      supabase
        .from("artist_profiles")
        .select("id,display_name,bio,genre")
        .order("updated_at", { ascending: false })
        .limit(100),
      supabase
        .from("artist_follows")
        .select("*", { count: "exact", head: true })
        .eq("artist_id", artist),
      supabase
        .from("artist_follows")
        .select("*", { count: "exact", head: true })
        .eq("follower_id", artist),
      supabase
        .from("artist_follows")
        .select("artist_id")
        .eq("follower_id", viewer)
        .eq("artist_id", artist)
        .maybeSingle(),
    ])
      .then((results) => {
        if (id !== generation.current) return;
        for (const r of results) if (r.error) throw r.error;
        setPeople((results[0].data ?? []) as ArtistProfile[]);
        setFollowers(results[1].count ?? 0);
        setFollowing(results[2].count ?? 0);
        setActive(!!results[3].data);
      })
      .catch((e) => {
        if (id === generation.current)
          setError(e.message || "Could not load artists");
      });
    return () => {
      generation.current++;
    };
  }, [viewer, artist]);
  const toggle = async () => {
    if (!supabase || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const id = generation.current;
    try {
      const result = active
        ? await supabase
            .from("artist_follows")
            .delete()
            .eq("follower_id", viewer)
            .eq("artist_id", artist)
        : await supabase
            .from("artist_follows")
            .upsert(
              { follower_id: viewer, artist_id: artist },
              { onConflict: "follower_id,artist_id", ignoreDuplicates: true },
            );
      if (result.error) throw result.error;
      const [count, state] = await Promise.all([
        supabase
          .from("artist_follows")
          .select("*", { head: true, count: "exact" })
          .eq("artist_id", artist),
        supabase
          .from("artist_follows")
          .select("artist_id")
          .eq("follower_id", viewer)
          .eq("artist_id", artist)
          .maybeSingle(),
      ]);
      if (count.error) throw count.error;
      if (state.error) throw state.error;
      if (id === generation.current) {
        setActive(!!state.data);
        setFollowers(count.count ?? 0);
      }
    } catch (e) {
      if (id === generation.current)
        setError(
          e instanceof Error
            ? e.message
            : "Save your artist profile before following artists.",
        );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="social-card" aria-label="Artist network">
      <h2>Artist network</h2>
      <p>
        {followers} followers · {following} following
      </p>
      {viewer !== artist && (
        <button
          className="primary"
          disabled={busy}
          aria-pressed={active}
          onClick={() => void toggle()}
        >
          {active ? "Unfollow artist" : "Follow artist"}
        </button>
      )}
      <p>
        Save your artist profile to follow other creators. Your follows are
        visible to signed-in artists.
      </p>
      <h3>Find artists</h3>
      <label>
        Search artist names
        <input
          aria-label="Search artists"
          value={query}
          maxLength={60}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="release-grid">
        {people
          .filter(
            (p) =>
              p.id !== viewer &&
              p.display_name
                .toLocaleLowerCase()
                .includes(query.trim().toLocaleLowerCase()),
          )
          .map((p) => (
            <article key={p.id}>
              <Link href={"/profile?artist=" + p.id}>{p.display_name}</Link>
              <p>{p.genre}</p>
            </article>
          ))}
      </div>
      <p>
        Showing the 100 most recently updated profiles. Open an artist to listen
        and follow.
      </p>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
