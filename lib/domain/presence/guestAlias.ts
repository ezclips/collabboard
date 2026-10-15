/**
 * PATCH-368. Hide guest names: the pure alias rule and the display-name helper.
 *
 * `guestAlias` is the ONE rule, with a SQL twin in
 * `20261014210000_hide_guest_names.sql`:
 *   TS :  'Guest ' + ((parseInt(userId.slice(0, 4), 16) % 99) + 1)
 *   SQL:  'Guest ' || ((('x' || substr(u.id::text, 1, 4))::bit(16)::int % 99) + 1)
 * Stable per user, the same number in every viewer, in the range 1..99.
 */

/** The SQL twin, kept here as a string so a test can pin both to one rule. */
export const GUEST_ALIAS_SQL =
  "'Guest ' || ((('x' || substr(u.id::text, 1, 4))::bit(16)::int % 99) + 1)";

/** A guest's stable alias: "Guest NN", 1..99, derived from the first 4 hex chars of the id. */
export function guestAlias(userId: string): string {
  const head = typeof userId === 'string' ? userId.slice(0, 4) : '';
  const parsed = parseInt(head, 16);
  const number = Number.isFinite(parsed) ? (parsed % 99) + 1 : 1;
  return `Guest ${number}`;
}

export interface DisplayNameInput {
  readonly name: string | null | undefined;
  readonly userId: string;
  readonly isGuest: boolean;
  readonly isMe: boolean;
  readonly hideGuestNames: boolean;
}

/**
 * The name to show for one person. A guest who is not me shows the alias while
 * names are hidden; with the flag off and no name sent (`name: null`) they fall
 * back to "Guest". Everyone else keeps their name, or "Member" when they have
 * none.
 */
export function displayNameFor(input: DisplayNameInput): string {
  const trimmed = typeof input.name === 'string' ? input.name.trim() : '';

  if (input.isGuest && !input.isMe) {
    if (input.hideGuestNames) return guestAlias(input.userId);
    return trimmed.length > 0 ? trimmed : 'Guest';
  }

  return trimmed.length > 0 ? trimmed : 'Member';
}

/** The fields `commentAuthorName` reads off a user. */
export interface CommentAuthorUser {
  readonly id?: string;
  readonly is_anonymous?: boolean;
  readonly email?: string | null;
  readonly user_metadata?: Record<string, unknown> | null;
}

function firstNonEmptyString(values: readonly unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return null;
}

/**
 * PATCH-370. The name a NEW comment stores. One rule for every comment writer,
 * so a guest is never stored as "You"/"User"/"Anonymous":
 *   - a guest: the alias while names are hidden, else their display name, else "Guest";
 *   - a registered user: full_name, then name, then the email prefix, else "Member".
 * Never returns the literal "You".
 */
export function commentAuthorName(
  user: CommentAuthorUser | null | undefined,
  options: { hideGuestNames?: boolean } = {},
): string {
  const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;

  if (user?.is_anonymous === true) {
    if (options.hideGuestNames) return guestAlias(user.id ?? '');
    return firstNonEmptyString([metadata.display_name]) ?? 'Guest';
  }

  const named = firstNonEmptyString([metadata.full_name, metadata.name]);
  if (named) return named;

  const email = typeof user?.email === 'string' ? user.email : '';
  const prefix = email.includes('@') ? email.split('@')[0] : email;
  return prefix.trim().length > 0 ? prefix.trim() : 'Member';
}
