/**
 * PATCH-358. Guests are real Supabase users (the `authenticated` role) whose JWT
 * carries `is_anonymous: true`, created by `supabase.auth.signInAnonymously`.
 * Every policy and route that trusts "signed in" therefore trusts a guest too --
 * so the app has to know, in one place, whether a user is one.
 *
 * Pure and browser-safe.
 */

/** True only for an anonymous Supabase user. */
export function isGuestUser(user: { is_anonymous?: boolean } | null | undefined): boolean {
  return user?.is_anonymous === true;
}

export const GUEST_NAME_MAX = 40;

/**
 * PATCH-358 Addendum 1. The body every upload route returns for a guest:
 * storage is paid by the board owner, and the routes that write it use the admin
 * client, so the part 2 database policies cannot stop a guest with an edit link.
 */
export const GUEST_UPLOAD_REFUSAL = {
  error: 'Create a free account to upload files.',
  code: 'guest_no_upload',
} as const;

/**
 * PATCH-380. The same words the AI refusal has always used. It lives here, not
 * in `aiCredits.ts`, so the server helper that decides a guest's permission can
 * return it without importing the credit ledger -- which imports the helper.
 */
export const GUEST_AI_REFUSAL_BODY = {
  error: 'Create a free account to use AI.',
  code: 'guest_no_ai',
} as const;

/** PATCH-380. The cap refusal, when a guest has used their allowance. */
export const GUEST_LIMIT_REFUSAL = {
  error: 'Guest limit reached. Please try again later.',
  code: 'guest_limit',
} as const;

/**
 * PATCH-358 Addendum 1. A session-based auth callback returns this instead of a
 * session to tell its factory the caller is a guest, so the factory can send the
 * 403 itself (the callback only has the user, not a response).
 */
export interface GuestAuthMarker {
  readonly guest: true;
}

export type GuestNameResult =
  | { readonly ok: true; readonly name: string }
  | { readonly ok: false; readonly error: string };

/**
 * PATCH-379. The ONE question a layout asks before offering Edit / Delete / Move
 * on a post. Built once, in CanvasClient, from the current user -- so a layout
 * asks and never learns who the guest is.
 */
export type CanModifyPost = (post: { readonly metadata?: unknown } | null | undefined) => boolean;

/**
 * PATCH-379. May this viewer change or delete THIS post?
 *
 * A guest may only change their OWN posts; everyone else answers exactly as
 * before (the board's own authority decides, not this). Ownership is
 * `metadata.createdBy` -- the value PATCH-364's database trigger stamps, after
 * stripping whatever the client sent, so it cannot be forged. A post with no
 * stamp (an older row, or a service-role insert) belongs to nobody, so a guest
 * may not touch it.
 *
 * This is NOT the question "may they comment or react": a guest may always do
 * both, on anyone's post, and the database allows it.
 */
export function canGuestModifyPost(
  post: { readonly metadata?: unknown } | null | undefined,
  user: { readonly id?: string | null; readonly is_anonymous?: boolean } | null | undefined,
): boolean {
  if (!isGuestUser(user)) return true;
  const metadata = post?.metadata;
  if (!metadata || typeof metadata !== 'object') return false;
  const createdBy = (metadata as { createdBy?: unknown }).createdBy;
  const userId = user?.id;
  return typeof createdBy === 'string' && typeof userId === 'string' && createdBy === userId;
}

/**
 * Validate and normalise a guest's display name: trim, collapse inner
 * whitespace to single spaces, then require 1-40 characters with no control
 * characters and no angle brackets. The normalised name is what gets stored.
 */
export function normalizeGuestName(raw: string): GuestNameResult {
  const name = raw.replace(/\s+/g, ' ').trim();
  if (name.length === 0) {
    return { ok: false, error: 'Please type a name.' };
  }
  if (name.length > GUEST_NAME_MAX) {
    return { ok: false, error: `Names can be up to ${GUEST_NAME_MAX} characters.` };
  }
  // \s collapsed tabs/newlines already; what remains is C0 control characters
  // (U+0000-U+001F) and DEL (U+007F), none of which may be stored.
  if (/[\u0000-\u001f\u007f]/.test(name)) {
    return { ok: false, error: 'Names cannot contain control characters.' };
  }
  if (name.includes('<') || name.includes('>')) {
    return { ok: false, error: 'Names cannot contain < or >.' };
  }
  return { ok: true, name };
}
