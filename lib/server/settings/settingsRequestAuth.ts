// Bearer authentication for Settings API routes.
//
// SERVER ONLY.
//
// Mirrors the established pattern in app/api/settings/integrations/**: the
// caller's Supabase access token is presented to an ANON-key client, and
// `auth.getUser(token)` is what establishes identity. The service role is
// never part of authentication -- it is used only afterwards, by repositories
// that re-prove ownership themselves, and using it here would authenticate
// nobody while granting everything.
//
// The user id therefore always comes from the verified token. No route may
// read it from a request body.

import { createClient } from '@supabase/supabase-js';

export interface AuthenticatedSettingsUser {
  readonly userId: string;
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') ?? '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

/**
 * Resolves the caller, or null when the request carries no usable token. A
 * null return is always a 401: callers must not distinguish "no header" from
 * "bad token".
 */
export async function authenticateSettingsRequest(
  request: Request,
): Promise<AuthenticatedSettingsUser | null> {
  const token = bearerToken(request);
  if (!token) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const { data, error } = await supabase.auth.getUser(token);
  const userId = data?.user?.id;
  if (error || !userId) return null;

  return { userId };
}
