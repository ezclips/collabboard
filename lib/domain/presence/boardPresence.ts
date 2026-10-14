/**
 * PATCH-363. The pure half of board presence: who am I, what colour, and how the
 * Supabase presence state becomes the list the stack shows.
 *
 * The name NEVER falls back to the email: a guest sees this list, and a guest
 * must never see another member's email (PATCH-360).
 */

export interface PresenceUserLike {
  readonly id: string;
  readonly is_anonymous?: boolean;
  readonly user_metadata?: Record<string, unknown> | null;
}

export interface PresenceIdentity {
  readonly userId: string;
  readonly name: string;
  readonly isGuest: boolean;
}

const NAME_MAX = 40;

function firstNonEmptyString(values: readonly unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return null;
}

/** Who the signed-in user is on the board: a name (never the email) and a guest flag. */
export function presenceIdentity(user: PresenceUserLike | null | undefined): PresenceIdentity {
  const metadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const raw = firstNonEmptyString([metadata.full_name, metadata.name, metadata.display_name]);
  return {
    userId: user?.id ?? '',
    name: raw ? raw.slice(0, NAME_MAX) : 'Member',
    isGuest: user?.is_anonymous === true,
  };
}

/** Eight accessible colours; the id picks one deterministically. */
export const PRESENCE_COLORS: readonly string[] = [
  '#0ea5e9', // sky
  '#8b5cf6', // violet
  '#f59e0b', // amber
  '#10b981', // emerald
  '#ef4444', // red
  '#ec4899', // pink
  '#6366f1', // indigo
  '#14b8a6', // teal
];

export function presenceColor(userId: string): string {
  let hash = 0;
  for (let index = 0; index < userId.length; index += 1) {
    hash = (hash * 31 + userId.charCodeAt(index)) >>> 0;
  }
  return PRESENCE_COLORS[hash % PRESENCE_COLORS.length];
}

/** Up to two letters: the first letters of the first and last word. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter((part) => part.length > 0);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/** One tracked tab's presence payload. */
export interface PresenceMeta {
  readonly name?: string;
  readonly isGuest?: boolean;
  readonly color?: string;
  readonly joinedAt?: string;
}

export interface PresencePerson {
  readonly userId: string;
  readonly name: string;
  readonly isGuest: boolean;
  readonly color: string;
  readonly joinedAt: string;
}

/** The Supabase presence state: one key per tracked user, one entry per tab. */
export type PresenceState = Record<string, readonly PresenceMeta[]>;

/**
 * Presence state -> the people list. Several tabs of one user count ONCE (the
 * earliest `joinedAt` wins). Me first, then everyone else by `joinedAt`.
 */
export function presencePeople(state: PresenceState, myUserId: string): PresencePerson[] {
  const people: PresencePerson[] = [];
  for (const [userId, metas] of Object.entries(state)) {
    if (!Array.isArray(metas) || metas.length === 0) continue;
    const ordered = [...metas].sort((a, b) => {
      const aAt = typeof a?.joinedAt === 'string' ? a.joinedAt : '';
      const bAt = typeof b?.joinedAt === 'string' ? b.joinedAt : '';
      return aAt < bAt ? -1 : aAt > bAt ? 1 : 0;
    });
    const first = ordered[0] ?? {};
    const name = typeof first.name === 'string' && first.name.trim().length > 0
      ? first.name.trim().slice(0, NAME_MAX)
      : 'Member';
    people.push({
      userId,
      name,
      isGuest: first.isGuest === true,
      color: typeof first.color === 'string' && first.color.length > 0 ? first.color : presenceColor(userId),
      joinedAt: typeof first.joinedAt === 'string' ? first.joinedAt : '',
    });
  }

  people.sort((a, b) => {
    if (a.userId === myUserId) return -1;
    if (b.userId === myUserId) return 1;
    if (a.joinedAt !== b.joinedAt) return a.joinedAt < b.joinedAt ? -1 : 1;
    return a.userId.localeCompare(b.userId);
  });
  return people;
}

/** Split a list into the first `max` and the rest, for the "+N" bubble. */
export function overflow<T>(list: readonly T[], max = 5): { visible: T[]; hidden: T[] } {
  return { visible: list.slice(0, max), hidden: list.slice(max) };
}
