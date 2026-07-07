/**
 * Structural subset of an authenticated user, as UI components need it.
 * Supabase's `User` is assignable to this type - callers keep passing it.
 */
export interface AuthUserMetadata {
  full_name?: string;
  name?: string;
  avatar_url?: string;
  [key: string]: unknown;
}

export interface AuthUser {
  id: string;
  email?: string | null;
  user_metadata?: AuthUserMetadata;
}
