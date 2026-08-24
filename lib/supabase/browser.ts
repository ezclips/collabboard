"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { createAuthTokenCircuitBreaker } from "@/lib/infra/auth/authTokenCircuitBreaker";
import {
  clearAuthCookiesInBrowser,
  evaluateStoredSession,
} from "@/lib/infra/auth/staleSessionCleanup";

// Single source of truth for browser Supabase client
// Do NOT import server clients (createServerComponentClient, cookies(), etc.) in client components

// On the login page ONLY, drop an expired session cookie BEFORE the client is
// constructed. GoTrueClient's init-time session recovery otherwise fires a
// refresh-token exchange with the stale token, which hits Supabase's 429
// over_request_rate_limit and blocks the password sign-in that follows
// (proven 2026-07-13/14). Scoped to exactly /auth: everywhere else an expired
// access token with a valid refresh token is normal and must keep refreshing,
// and /auth/callback + /auth/reset-password manage their own sessions.
const clearStaleSessionOnLoginPage = () => {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.location.pathname !== "/auth") return;

  const status = evaluateStoredSession(document.cookie, Date.now());
  if (status.kind === "stale") {
    clearAuthCookiesInBrowser(status.cookieNames);
  }
};

type BrowserSupabaseClient = ReturnType<typeof createClientComponentClient<any>>;

function createBrowserSupabaseClient(): BrowserSupabaseClient {
  clearStaleSessionOnLoginPage();
  // Circuit breaker: after one provider 429 on a refresh-token request,
  // further refresh attempts short-circuit locally for 5 minutes instead of
  // hammering the same per-IP budget the password sign-in needs.
  const guardedFetch = createAuthTokenCircuitBreaker({
    fetchImpl: (input, init) => fetch(input, init),
    storage: typeof window !== "undefined" ? window.localStorage : null,
  });
  return createClientComponentClient<any>({
    options: { global: { fetch: guardedFetch } },
  });
}

const GLOBAL_KEY = "__collabboardSupabaseBrowserClient__" as const;

type BrowserGlobalScope = typeof globalThis & {
  [GLOBAL_KEY]?: BrowserSupabaseClient;
};

// Never meaningfully reused: this module only does anything once it runs in
// an actual browser tab. A module-local `let` alone is not the right
// identity boundary there -- Next.js Fast Refresh re-evaluates this module on
// every edit, and a plain module-local singleton would construct a second
// live GoTrueClient (with its own refresh timers) next to the orphaned first
// one, doubling refresh-token traffic for the same page. `globalThis` in a
// browser tab IS that tab's `window`, already isolated per page/user, so
// anchoring the singleton there survives the module reload HMR performs.
let serverFallbackInstance: BrowserSupabaseClient | null = null;

export const supabaseBrowser = (): BrowserSupabaseClient => {
  if (typeof window === "undefined") {
    if (!serverFallbackInstance) {
      serverFallbackInstance = createBrowserSupabaseClient();
    }
    return serverFallbackInstance;
  }

  const globalScope = window as BrowserGlobalScope;
  if (!globalScope[GLOBAL_KEY]) {
    globalScope[GLOBAL_KEY] = createBrowserSupabaseClient();
  }
  return globalScope[GLOBAL_KEY];
};
