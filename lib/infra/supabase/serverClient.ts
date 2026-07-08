import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase client. Uses the service-role key when present
 * (RLS bypass for server lookups — see SECURITY.md), anon key otherwise.
 * NEVER import this from a 'use client' module.
 */
export function createServerSupabaseClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
