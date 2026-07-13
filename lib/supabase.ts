// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';
import { supabaseBrowser } from './supabase/browser';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase =
  typeof window === 'undefined'
    ? createClient(supabaseUrl, supabaseAnonKey)
    : supabaseBrowser();
export { useSupabase } from './supabase-provider';

// Re-export createClient for API routes that need it
export { createClient };
