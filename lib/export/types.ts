// lib/export/types.ts

export const EXPORT_SCHEMA_VERSION = 1;

export type ExportScope = 'accessible' | 'all' | 'team-member';

/**
 * App-level normalized shapes for portable export/import.
 *
 * Field lists here are verified against the actual `folders`/`boards`/`padlets`
 * columns (not the broader `types/collabboard.ts` frontend types, which
 * include aspirational/legacy fields the DB doesn't have — e.g. boards has
 * no `settings`/`metadata` column, padlets has no `image_url`/`is_pinned`/
 * `likes_count`). Personal, per-user, or per-device state (is_favorite,
 * bookmarked, last_visited_at, thumbnail(_url), sort_order) is intentionally
 * excluded — it describes this user's relationship to a board, not portable
 * board content.
 *
 * `localId`/`parentRef`/`folderRef`/`boardRef` are bundle-scoped structural
 * references, NOT source database primary keys — the serializer mints them
 * fresh at export time (see lib/export/serialize.ts) so a bundle never
 * carries a source workspace's real row ids. Import remaps every reference
 * to newly inserted rows in the target workspace; a bundle is never valid to
 * replay ids from directly against any database.
 *
 * `originalCreatedAt`/`originalUpdatedAt` are historical/display metadata
 * only. Import does not write them back as row timestamps (the DB sets its
 * own on insert).
 */
export interface NormalizedFolder {
  localId: string;
  parentRef: string | null;
  name: string;
  icon: string | null;
  color: string | null;
  position: number | null;
}

export interface NormalizedBoard {
  localId: string;
  folderRef: string | null;
  title: string;
  description: string | null;
  layout: string;
  background: Record<string, unknown> | null;
  backgroundType: 'color' | 'gradient' | 'image' | null;
  backgroundValue: string | null;
  containerSize: 'small' | 'medium' | 'large' | null;
  commentsEnabled: boolean;
  reactionsEnabled: boolean;
  originalCreatedAt: string;
  originalUpdatedAt: string;
}

/**
 * Padlet metadata may itself contain padlet-to-padlet references
 * (container hierarchy). Only these keys are remapped/validated as
 * cross-references — everything else in `metadata` passes through as
 * opaque content. See lib/import/restore.ts for the remap pass.
 */
export const PADLET_METADATA_REF_KEYS = [
  'parentId',
  'coverChildId',
  'coverPadletId',
  'coverChildPadletId',
] as const;
export const PADLET_METADATA_REF_ARRAY_KEY = 'childPadletIds' as const;

export interface NormalizedPadlet {
  localId: string;
  boardRef: string;
  title: string;
  content: string;
  color: string | null;
  type: string;
  positionX: number;
  positionY: number;
  width: number | null;
  height: number | null;
  fileUrl: string | null;
  fileName: string | null;
  fileType: string | null;
  fileSize: number | null;
  locationLng: number | null;
  locationLat: number | null;
  locationLabel: string | null;
  locationMapboxId: string | null;
  locationPrecision: string | null;
  /** May contain parentId / childPadletIds / coverChildId / coverPadletId / coverChildPadletId referencing other NormalizedPadlet.localId values within this bundle. */
  metadata: Record<string, unknown>;
  originalCreatedAt: string;
  originalUpdatedAt: string;
}

export interface ExportManifest {
  type: 'collabboard-workspace-export';
  schemaVersion: number;
  exportedAt: string;
  exportedFromWorkspaceId: string;
  exportedFromWorkspaceName: string;
  scope: ExportScope;
  counts: {
    folders: number;
    boards: number;
    padlets: number;
  };
}

export interface ExportData {
  folders: NormalizedFolder[];
  boards: NormalizedBoard[];
  padlets: NormalizedPadlet[];
}

export interface ExportBundle {
  manifest: ExportManifest;
  data: ExportData;
}
