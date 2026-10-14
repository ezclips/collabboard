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

/** PATCH-360. The permissions `kanban_board_members.permission_level` uses. */
export type KanbanPermission = 'view' | 'comment' | 'edit' | 'admin';

const KANBAN_RANK: Record<KanbanPermission, number> = {
  view: 1,
  comment: 2,
  edit: 3,
  admin: 4,
};

/**
 * PATCH-360. The board role a share link grants -> the Kanban permission it
 * grants. Kanban authorises through `kanban_board_members`, which
 * `board_collaborators` never feeds, so a redeem must write this row too.
 */
export function kanbanPermissionForRole(role: ShareLinkRole): KanbanPermission {
  switch (role) {
    case 'editor':
      return 'edit';
    case 'commenter':
      return 'comment';
    case 'viewer':
      return 'view';
  }
}

/**
 * PATCH-360. True when an existing Kanban permission already grants at least
 * `wanted`. A missing or unknown existing permission satisfies nothing, so a
 * row that is absent or unrecognised is replaced rather than trusted.
 */
export function kanbanPermissionSatisfies(
  existing: string | null | undefined,
  wanted: KanbanPermission,
): boolean {
  if (existing === null || existing === undefined) return false;
  const existingRank = KANBAN_RANK[existing as KanbanPermission];
  if (existingRank === undefined) return false;
  return existingRank >= KANBAN_RANK[wanted];
}
