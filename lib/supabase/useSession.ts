"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabaseBrowser } from "./browser";

/**
 * Hydration-safe session hook
 * Use this instead of calling getSession() in every click handler
 * 
 * Usage:
 * const { supabase, session, ready } = useSupabaseSession();
 * 
 * // In your action handlers:
 * if (!ready) return; // or show a loading state
 * if (!session) {
 *   toast.error("You must be logged in");
 *   return;
 * }
 */
export function useSupabaseSession() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session ?? null);
      setReady(true);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession ?? null);
      setReady(true);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  return { supabase, session, ready };
}
