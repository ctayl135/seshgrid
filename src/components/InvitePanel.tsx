"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  people,
  invitations,
  communityRPC,
  type Person,
  type Invitation,
} from "@/lib/community";
import { supabase } from "@/lib/storage";
export default function InvitePanel({
  projectId,
  userId,
  navigate,
}: {
  projectId: string;
  userId?: string;
  navigate: (path: string) => void;
}) {
  const [names, setNames] = useState<Record<string, string>>({});
  const [owner, setOwner] = useState(false),
    [rows, setRows] = useState<Invitation[]>([]),
    [artists, setArtists] = useState<Person[]>([]),
    [search, setSearch] = useState(""),
    [member, setMember] = useState(""),
    [role, setRole] = useState("editor"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const refresh = async () => {
    const { data, error } = await supabase!
      .from("projects")
      .select("owner_id")
      .eq("id", projectId)
      .maybeSingle();
    if (error) throw error;
    setOwner(data?.owner_id === userId);
    const rows = await invitations(projectId);
    setRows(rows);
    if (rows.length) {
      const profiles = await supabase!
        .from("artist_profiles")
        .select("id,display_name")
        .in(
          "id",
          rows.map((r) => r.member_id),
        );
      setNames(
        Object.fromEntries(
          (profiles.data ?? []).map((p) => [p.id, p.display_name]),
        ),
      );
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
    if (userId && supabase) void run(refresh);
  }, [projectId, userId]);
  return (
    <section>
      <span className="eyebrow">MAKE IT TOGETHER</span>
      <h2>Song collaborators</h2>
      {!userId ? (
        <p>Sign in and save the song to the cloud before inviting artists.</p>
      ) : (
        <>
          <p>
            Invited artists must accept before they can open this song and its
            source audio. Editors can save changes; listen-only members cannot
            change the shared version. Downloaded copies cannot be recalled.
          </p>
          {owner ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await communityRPC("invite_collaborator", {
                    p_project: projectId,
                    p_member: member,
                    p_role: role,
                  });
                  setMessage(
                    "Invitation sent. They can accept it in Notifications.",
                  );
                  await refresh();
                });
              }}
            >
              <div className="artist-search">
                <input
                  aria-label="Find collaborator"
                  placeholder="Search artist names"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () =>
                      setArtists(
                        (await people(search)).filter((p) => p.id !== userId),
                      ),
                    )
                  }
                >
                  Find artists
                </button>
              </div>
              <label>
                Artist
                <select
                  aria-label="Invite artist"
                  required
                  value={member}
                  onChange={(e) => setMember(e.target.value)}
                >
                  <option value="">Choose an artist</option>
                  {artists.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.display_name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Access
                <select
                  aria-label="Collaborator access"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  <option value="editor">
                    Editor — can save shared changes
                  </option>
                  <option value="viewer">
                    Listen-only — cannot save shared changes
                  </option>
                </select>
              </label>
              <button className="primary" disabled={busy || !member}>
                Send invitation
              </button>
            </form>
          ) : (
            <p>
              Only the cloud session owner can invite artists. Save this song to
              your cloud first, or ask its owner.
            </p>
          )}
          <button disabled={busy} onClick={() => void run(refresh)}>
            Refresh collaborators
          </button>
          {rows.map((r) => (
            <div className="invitation-row" key={r.id}>
              <span>
                {names[r.member_id] ?? "Artist"} · {r.role} · {r.status}
              </span>
              {owner && r.status !== "revoked" && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await communityRPC("revoke_collaborator", { p_id: r.id });
                      await refresh();
                    })
                  }
                >
                  Revoke access
                </button>
              )}
            </div>
          ))}
          <Link
            href="/notifications"
            onClick={(e) => {
              e.preventDefault();
              navigate("/notifications");
            }}
          >
            Open invitations
          </Link>
        </>
      )}
      {error && (
        <p role="alert" className="social-error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
