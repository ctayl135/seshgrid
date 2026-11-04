"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/storage";
export default function CommunityLinks() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (!supabase) return;
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        if (active) setCount(0);
        return;
      }
      const r = await supabase
        .from("notifications")
        .select("id", { head: true, count: "exact" })
        .is("read_at", null);
      if (active) setCount(r.count ?? 0);
    };
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  return (
    <>
      <Link href="/beats">Beats</Link>
      <Link href="/messages">DMs</Link>
      <Link href="/notifications">
        Notifications
        {count > 0 && (
          <b className="unread-badge">{count > 99 ? "99+" : count}</b>
        )}
      </Link>
    </>
  );
}
