// Server-side auth helper for import routes.
// Reads the bearer token from the Authorization header and returns the
// authenticated user ID, or null when the token is missing/invalid.

import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export function getBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization') || '';
  return auth.startsWith('Bearer ') ? auth.slice(7) : null;
}

export function makeAuthedClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    }
  );
}

export async function getAuthenticatedUserId(
  req: NextRequest
): Promise<{ userId: string; token: string } | null> {
  const token = getBearerToken(req);
  if (!token) return null;

  const supabase = makeAuthedClient(token);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.id) return null;

  return { userId: data.user.id, token };
}
