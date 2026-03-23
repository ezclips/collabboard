'use client';

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

const findAccessTokenDeep = (value: unknown): string | null => {
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findAccessTokenDeep(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.access_token === 'string' && obj.access_token.length > 10) {
      return obj.access_token;
    }
    for (const nested of Object.values(obj)) {
      const found = findAccessTokenDeep(nested);
      if (found) return found;
    }
  }
  return null;
};

function getAccessTokenFromStorage(): string | null {
  try {
    const keys = Object.keys(localStorage).sort((a, b) => (a > b ? -1 : 1));
    for (const key of keys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        const token = findAccessTokenDeep(parsed);
        if (token) return token;
      } catch {
        // Ignore localStorage values that are not JSON.
      }
    }
  } catch {
    // Ignore localStorage access failures.
  }
  return null;
}

export async function resolveClientAccessToken(): Promise<string | null> {
  const supabase = createClientComponentClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.access_token) return session.access_token;

  const { data: refreshed } = await supabase.auth.refreshSession();
  if (refreshed?.session?.access_token) return refreshed.session.access_token;

  return getAccessTokenFromStorage();
}
