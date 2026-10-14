/**
 * PATCH-362. The pure half of "People with access": turning a board's
 * `board_collaborators` rows (joined with `public.users`) into the list the
 * Share canvas "People" tab shows.
 *
 * A guest is a signed-in user with no email (Supabase anonymous sign-in), so
 * `isGuest` is exactly "no email" -- the route never invents one.
 */

/** One `board_collaborators` row. The join time column is `added_at` (live). */
export interface BoardCollaboratorRow {
  readonly user_id: string;
  readonly role?: string | null;
  readonly added_at?: string | null;
}

/** The `public.users` profile a collaborator id resolves to, if any. */
export interface BoardUserProfile {
  readonly id: string;
  readonly email?: string | null;
  readonly full_name?: string | null;
  readonly name?: string | null;
}

export interface BoardPerson {
  readonly userId: string;
  readonly name: string;
  readonly email: string | null;
  readonly role: string;
  readonly isGuest: boolean;
  readonly joinedAt: string | null;
}

function nonEmpty(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/** A collaborator row + its profile -> one person. A missing profile is a guest. */
export function boardPersonFromRow(
  row: BoardCollaboratorRow,
  profile: BoardUserProfile | null,
): BoardPerson {
  const email = nonEmpty(profile?.email);
  const fullName = nonEmpty(profile?.full_name);
  const profileName = nonEmpty(profile?.name);
  return {
    userId: row.user_id,
    // Name: full_name, then name, then email, else 'Guest'. Email is withheld
    // for a guest.
    name: fullName ?? profileName ?? email ?? 'Guest',
    email,
    role: nonEmpty(row.role) ?? 'viewer',
    isGuest: email === null,
    joinedAt: nonEmpty(row.added_at),
  };
}

/** Oldest first; a stable userId tiebreak. */
export function sortBoardPeople(people: readonly BoardPerson[]): BoardPerson[] {
  return [...people].sort((a, b) => {
    const aAt = a.joinedAt ?? '';
    const bAt = b.joinedAt ?? '';
    if (aAt !== bAt) return aAt < bAt ? -1 : 1;
    return a.userId.localeCompare(b.userId);
  });
}

/** The collaborator role, as the People tab spells it. */
export function boardPersonRoleLabel(role: string | null | undefined): string {
  switch (role) {
    case 'editor':
      return 'Can edit';
    case 'commenter':
      return 'Can comment';
    default:
      return 'Can view';
  }
}
