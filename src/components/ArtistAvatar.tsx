"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/storage";
export default function ArtistAvatar({
  path,
  name,
}: {
  path?: string | null;
  name: string;
}) {
  const [url, setURL] = useState("");
  useEffect(() => {
    let active = true;
    setURL("");
    if (path && supabase)
      void supabase.storage
        .from("artist-avatars")
        .createSignedUrl(path, 3600)
        .then(({ data }) => {
          if (active && data) setURL(data.signedUrl);
        });
    return () => {
      active = false;
    };
  }, [path]);
  return url ? (
    <img
      src={url}
      alt={name + " profile photo"}
      width={96}
      height={96}
      style={{ objectFit: "cover", borderRadius: "50%" }}
    />
  ) : (
    <div
      aria-label="Profile initials"
      style={{
        width: 96,
        height: 96,
        borderRadius: "50%",
        background: "#d7d7d7",
        color: "#111111",
        display: "grid",
        placeItems: "center",
        fontSize: 32,
      }}
    >
      {name.slice(0, 2).toUpperCase() || "N"}
    </div>
  );
}
