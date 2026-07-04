"use client";
import React, { createContext, useContext, useEffect } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { supabaseBrowser } from '@/lib/supabase/browser';

type SupabaseContext = {
  supabase: SupabaseClient;
};

const Context = createContext<SupabaseContext | undefined>(undefined);

export function SupabaseProvider({ children }: { children: React.ReactNode }) {
  // The app's real session lives in cookies, managed by supabaseBrowser()
  // (auth-helpers) — sign-in/OAuth/middleware all go through it. The bare
  // `supabase` client from lib/supabase.ts (used across ~35 canvas/collabboard
  // files) has its own, separate session store that nothing ever populates,
  // so requests through it carry no JWT and silently behave as anonymous.
  // This is invisible on tables with permissive RLS but hard-fails on tables
  // scoped to `authenticated` only (e.g. board_sections).
  //
  // Sync once on mount only — do NOT subscribe to ongoing auth state changes
  // here. Several pre-existing files (lib/withAuth.tsx, lib/hooks/useCurrentUser.ts)
  // already register their own onAuthStateChange listeners directly on this
  // same bare client; before this fix those never fired (the client's session
  // never changed). A one-time setSession() still triggers them once, same as
  // their own mount-time getUser() call already does elsewhere — bounded and
  // harmless. Subscribing here as well caused repeated broadcasts on every
  // token refresh, cascading into those listeners' setUser() calls (new
  // object reference each time) and re-render loops downstream. A future
  // reload naturally re-syncs if the token goes stale.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [{ data: { session: browserSession } }, { data: { session: bareSession } }] = await Promise.all([
        supabaseBrowser().auth.getSession(),
        supabase.auth.getSession(),
      ]);

      if (cancelled) return;
      if (!browserSession) return;
      if (bareSession?.access_token === browserSession.access_token) return;

      await supabase.auth.setSession({
        access_token: browserSession.access_token,
        refresh_token: browserSession.refresh_token,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Context.Provider value={{ supabase }}>
      {children}
    </Context.Provider>
  );
}

export function useSupabase() {
  const context = useContext(Context);
  if (context === undefined) {
    throw new Error('useSupabase must be used inside SupabaseProvider');
  }
  return context;
}
