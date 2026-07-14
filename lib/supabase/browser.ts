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

// Create singleton instance
let supabaseInstance: ReturnType<typeof createClientComponentClient<any>> | null = null;

export const supabaseBrowser = () => {
  if (!supabaseInstance) {
    clearStaleSessionOnLoginPage();
    // Circuit breaker: after one provider 429 on /auth/v1/token, further
    // refresh attempts short-circuit locally for 5 minutes instead of
    // hammering the same per-IP budget the password sign-in needs.
    const guardedFetch = createAuthTokenCircuitBreaker({
      fetchImpl: (input, init) => fetch(input, init),
      storage: typeof window !== "undefined" ? window.localStorage : null,
    });
    supabaseInstance = createClientComponentClient<any>({
      options: { global: { fetch: guardedFetch } },
    });
  }
  return supabaseInstance;
};
