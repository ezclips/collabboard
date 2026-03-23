"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

// Single source of truth for browser Supabase client
// Do NOT import server clients (createServerComponentClient, cookies(), etc.) in client components

// Create singleton instance
let supabaseInstance: ReturnType<typeof createClientComponentClient<any>> | null = null;

export const supabaseBrowser = () => {
  if (!supabaseInstance) {
    supabaseInstance = createClientComponentClient<any>();
  }
  return supabaseInstance;
};
