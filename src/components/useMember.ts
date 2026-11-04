"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/storage";
export function useMember() {
  const [user, setUser] = useState<{ id: string } | null>(null),
    [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    if (supabase)
      void supabase.auth
        .getUser()
        .then((r) => {
          if (active) setUser(r.data.user);
        })
        .catch(() => {})
        .finally(() => {
          if (active) setReady(true);
        });
    else setReady(true);
    const sub = supabase?.auth.onAuthStateChange((_e, s) => {
      if (active) setUser(s?.user ?? null);
    });
    return () => {
      active = false;
      sub?.data.subscription.unsubscribe();
    };
  }, []);
  return { user, ready };
}
