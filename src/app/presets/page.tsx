"use client";
import { useState } from "react";
import Link from "next/link";
import { UNDERGROUND_PRESETS } from "@/lib/underground-presets";
export default function Presets() {
  const [kind, setKind] = useState("All"),
    [search, setSearch] = useState("");
  const matches = UNDERGROUND_PRESETS.filter(
    (p) =>
      (kind === "All" || p.category === kind) &&
      (p.name + " " + p.description)
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <main className="social-page">
      <nav className="social-nav">
        <Link className="brand" href="/">
          NOIR
        </Link>
        <div>
          <Link href="/sessions">Sessions</Link>
          <Link href="/fyp">For You</Link>
          <Link href="/profile">Profile</Link>
        </div>
      </nav>
      <header className="social-hero">
        <span className="eyebrow">FREE VOCALS & ADLIBS</span>
        <h1>Find your signature.</h1>
        <p>
          16 underground starting points. Artist-inspired chains are original
          interpretations, not official presets, exact matches or endorsements.
          Tune the key and scale for your song.
        </p>
      </header>
      <section className="social-card">
        <label>
          Search presets
          <input
            aria-label="Search presets"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          Preset type
          <select
            aria-label="Preset type"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option>All</option>
            <option>Vocals</option>
            <option>Adlibs</option>
          </select>
        </label>
        <p>{matches.length} presets</p>
      </section>
      <section className="release-grid">
        {matches.map((p) => (
          <article className="release-card" key={p.id}>
            <span className="eyebrow">
              {p.category} · {p.artist ? "ARTIST-INSPIRED" : "NOIR ORIGINAL"}
            </span>
            <h2>{p.name}</h2>
            <p>{p.description}</p>
            <p>
              Correction {Math.round(p.strength * 100)}% · Retune {p.retune} ms
            </p>
            <Link className="community-action" href={"/studio?preset=" + p.id}>
              Start session with {p.name}
            </Link>
          </article>
        ))}
      </section>
      {!matches.length && <p>No presets match. Try a different search.</p>}
      <p>
        To apply to existing audio, select its track in the studio and use Stock
        Plugins → Underground preset library. Original recordings are preserved.
        Pitch processing applies on playback and export.
      </p>
    </main>
  );
}
