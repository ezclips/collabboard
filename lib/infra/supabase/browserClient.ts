import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseBrowser } from '../../supabase/browser';

/**
 * Delegates to the app-wide browser client singleton so that EVERY browser
 * code path shares one construction site — the one that installs the
 * auth-token circuit breaker and the login-page stale-cookie cleanup
 * (lib/supabase/browser.ts). createClientComponentClient() keeps a global
 * first-construction-wins singleton internally, so constructing it here
 * without those options would silently bypass both protections (2026-07-14).
 */
export function createBrowserSupabaseClient(): SupabaseClient {
  return supabaseBrowser();
}
