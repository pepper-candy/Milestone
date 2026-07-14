"use client";

import { createClient } from "@/lib/supabase/client";
import type { ActiveSessionState, Session } from "@/types";
import { useEffect, useState } from "react";

export function useActiveSession() {
  const [active, setActive] = useState<ActiveSessionState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/session");
        if (!res.ok) return;
        const data = (await res.json()) as {
          active: ActiveSessionState | null;
        };
        if (!cancelled) setActive(data.active);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { active, setActive, loading };
}

export async function fetchProfile() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return data;
}

export type { Session };
