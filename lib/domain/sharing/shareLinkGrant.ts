/**
 * PATCH-357. The pure half of redeeming a share link: which board role a link
 * grants, and whether that role may replace an existing one.
 *
 * A share link grants access by being ADDED to `board_collaborators`, the one
 * collaborator path every post/section policy already honours. Two rules:
 * a link's legacy permission maps to exactly one role, and a redeem must NEVER
 * downgrade a collaborator who already has more.
 */

/** The roles `board_collaborators.role` uses, lowest to highest. */
export type ShareLinkRole = 'viewer' | 'commenter' | 'editor';

const ROLE_RANK: Record<ShareLinkRole, number> = {
  viewer: 1,
  commenter: 2,
  editor: 3,
};

/**
 * The link's stored permission -> the board role it grants.
 * `edit` -> `editor`, `comment` -> `commenter`, `view` -> `viewer`.
 * Anything else grants nothing (deny).
 */
export function shareLinkRole(permission: string | null | undefined): ShareLinkRole | null {
  switch (permission) {
    case 'edit':
      return 'editor';
    case 'comment':
      return 'commenter';
    case 'view':
      return 'viewer';
    default:
      return null;
  }
}

/**
 * True when redeeming should write `newRole` over `existingRole`.
 *
 * A missing or unknown existing role is replaced; a KNOWN existing role is only
 * replaced by a strictly higher one, so a `view` link can never take an `editor`
 * down to `viewer`.
 */
export function shouldUpgradeCollaborator(
  existingRole: string | null | undefined,
  newRole: ShareLinkRole,
): boolean {
  if (existingRole === null || existingRole === undefined) return true;
  const existingRank = ROLE_RANK[existingRole as ShareLinkRole];
  if (existingRank === undefined) return true;
  return ROLE_RANK[newRole] > existingRank;
}
