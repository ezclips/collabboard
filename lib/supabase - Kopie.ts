// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Debug: Check what values are actually loaded
console.log('🔍 Debug - Supabase URL:', supabaseUrl);
console.log('🔍 Debug - Supabase Key (first 20 chars):', supabaseAnonKey?.substring(0, 20));
console.log('🔍 Debug - URL length:', supabaseUrl?.length);

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Hook for using supabase in components
export const useSupabase = () => {
  return { supabase };
};