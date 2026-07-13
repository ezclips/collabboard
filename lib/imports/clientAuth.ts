'use client';

import { supabaseBrowser } from '@/lib/supabase/browser';

export async function resolveClientAccessToken(): Promise<string | null> {
  const supabase = supabaseBrowser();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token ?? null;
}
