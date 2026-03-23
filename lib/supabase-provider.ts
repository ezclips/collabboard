// Canonical implementation lives in supabase-provider.tsx (requires JSX).
// This file forwards all exports so that module resolution for '@/lib/supabase-provider'
// (which prefers .ts over .tsx) still finds the correct exports.
export { SupabaseProvider, useSupabase } from './supabase-provider.tsx';
