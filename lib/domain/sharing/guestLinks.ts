/**
 * PATCH-365. The pure half of "Guest link" in Share canvas: mapping a
 * `share_links` row to the shape the tab shows, and the small labels it needs.
 *
 * SECURITY: `toGuestLink` deliberately drops the token and the password hash.
 * The token survives only inside `url` (the owner already holds the link), and
 * the hash is replaced by a boolean. No IO here.
 */

export type GuestLinkPermission = 'view' | 'comment' | 'edit';

export interface GuestLink {
  readonly id: string;
  readonly permission: GuestLinkPermission;
  readonly createdAt: string | null;
  readonly expiresAt: string | null;
  readonly isPasswordProtected: boolean;
  readonly accessCount: number;
  readonly url: string;
}

/** The `share_links` columns `toGuestLink` reads. Nothing else is used. */
export interface GuestLinkRow {
  readonly id: string | number;
  readonly token: string;
  readonly permission: string | null;
  readonly created_at: string | null;
  readonly expires_at: string | null;
  readonly password_hash: string | null;
  readonly access_count: number | null;
}

function normalizePermission(permission: string | null | undefined): GuestLinkPermission {
  if (permission === 'view') return 'view';
  if (permission === 'comment') return 'comment';
  return 'edit';
}

/** A row -> the tab's link. The token lives ONLY inside `url`; the hash is a boolean. */
export function toGuestLink(row: GuestLinkRow, origin: string): GuestLink {
  return {
    id: String(row.id),
    permission: normalizePermission(row.permission),
    createdAt: row.created_at ?? null,
    expiresAt: row.expires_at ?? null,
    isPasswordProtected: !!row.password_hash,
    accessCount: typeof row.access_count === 'number' ? row.access_count : 0,
    url: `${origin}/share/${row.token}`,
  };
}

/** True when the link has not expired. A null `expires_at` never expires. */
export function isGuestLinkActive(
  row: { readonly expires_at: string | null } | null | undefined,
  now: Date,
): boolean {
  if (!row) return false;
  if (!row.expires_at) return true;
  const expires = new Date(row.expires_at).getTime();
  if (Number.isNaN(expires)) return false;
  return expires > now.getTime();
}

export function guestLinkPermissionLabel(permission: GuestLinkPermission): string {
  switch (permission) {
    case 'view':
      return 'Can view';
    case 'comment':
      return 'Can comment';
    default:
      return 'Can edit';
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * `Never expires` / `Expires within a day` / `Expires in N days`.
 *
 * Days are counted ROUNDED UP: a 7-day link created a moment ago reads
 * "Expires in 7 days", not 6. A partial day (up to 1) reads "within a day".
 */
export function guestLinkExpiryLabel(expiresAt: string | null, now: Date): string {
  if (!expiresAt) return 'Never expires';
  const expires = new Date(expiresAt).getTime();
  if (Number.isNaN(expires)) return 'Never expires';
  const days = Math.ceil((expires - now.getTime()) / DAY_MS);
  if (days <= 1) return 'Expires within a day';
  return `Expires in ${days} days`;
}

export interface GuestLinkExpiryOption {
  readonly label: string;
  readonly days: number | null;
}

export const GUEST_LINK_EXPIRY_OPTIONS: readonly GuestLinkExpiryOption[] = [
  { label: 'Never', days: null },
  { label: '1 day', days: 1 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
];

/**
 * PATCH-365. A `shareTarget: 'board'` link grants BOARD ACCESS to whoever opens
 * it, so only a board ADMIN may create one -- not merely the level the link
 * grants. Post-level shares are unchanged.
 *
 * It lives here rather than beside the route because Next forbids extra named
 * exports from a route module; `POST /api/share-link` imports it.
 */
export function boardShareTargetRequiresAdmin(shareTarget: unknown): boolean {
  return shareTarget === 'board';
}
