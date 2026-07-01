// lib/import/schema.ts

import JSZip from 'jszip';
import { z } from 'zod';
import {
  EXPORT_SCHEMA_VERSION,
  PADLET_METADATA_REF_ARRAY_KEY,
  PADLET_METADATA_REF_KEYS,
  type ExportBundle,
} from '@/lib/export/types';

const jsonRecordSchema = z.record(z.string(), z.unknown());

const normalizedFolderSchema = z.object({
  localId: z.string(),
  parentRef: z.string().nullable(),
  name: z.string().min(1),
  icon: z.string().nullable(),
  color: z.string().nullable(),
  position: z.number().nullable(),
});

const normalizedBoardSchema = z.object({
  localId: z.string(),
  folderRef: z.string().nullable(),
  title: z.string().min(1),
  description: z.string().nullable(),
  layout: z.string(),
  background: jsonRecordSchema.nullable(),
  backgroundType: z.enum(['color', 'gradient', 'image']).nullable(),
  backgroundValue: z.string().nullable(),
  containerSize: z.enum(['small', 'medium', 'large']).nullable(),
  commentsEnabled: z.boolean(),
  reactionsEnabled: z.boolean(),
  originalCreatedAt: z.string(),
  originalUpdatedAt: z.string(),
});

const normalizedPadletSchema = z.object({
  localId: z.string(),
  boardRef: z.string(),
  title: z.string(),
  content: z.string(),
  color: z.string().nullable(),
  type: z.string(),
  positionX: z.number(),
  positionY: z.number(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  fileUrl: z.string().nullable(),
  fileName: z.string().nullable(),
  fileType: z.string().nullable(),
  fileSize: z.number().nullable(),
  locationLng: z.number().nullable(),
  locationLat: z.number().nullable(),
  locationLabel: z.string().nullable(),
  locationMapboxId: z.string().nullable(),
  locationPrecision: z.string().nullable(),
  metadata: jsonRecordSchema,
  originalCreatedAt: z.string(),
  originalUpdatedAt: z.string(),
});

const exportManifestSchema = z.object({
  type: z.literal('collabboard-workspace-export'),
  schemaVersion: z.number().int().positive(),
  exportedAt: z.string(),
  exportedFromWorkspaceId: z.string(),
  exportedFromWorkspaceName: z.string(),
  scope: z.enum(['accessible', 'all', 'team-member']),
  counts: z.object({
    folders: z.number().int().nonnegative(),
    boards: z.number().int().nonnegative(),
    padlets: z.number().int().nonnegative(),
  }),
});

const exportDataSchema = z.object({
  folders: z.array(normalizedFolderSchema),
  boards: z.array(normalizedBoardSchema),
  padlets: z.array(normalizedPadletSchema),
});

export const exportBundleSchema = z.object({
  manifest: exportManifestSchema,
  data: exportDataSchema,
});

export class ImportValidationError extends Error {}

/**
 * localId values must be unique within each array — restore.ts builds its
 * folderIdMap/boardIdMap/padletIdMap keyed by localId, so a duplicate would
 * make the last-seen record silently win and every earlier reference to
 * that id remap to the wrong row. Checked before referential-integrity
 * checks, since a Set-based lookup there would otherwise mask duplicates.
 */
function findDuplicateLocalIdErrors(bundle: ExportBundle): string[] {
  const errors: string[] = [];

  const checkUnique = (label: string, localIds: string[]) => {
    const seen = new Set<string>();
    for (const localId of localIds) {
      if (seen.has(localId)) {
        errors.push(`Duplicate ${label} localId "${localId}" in archive.`);
      }
      seen.add(localId);
    }
  };

  checkUnique('folder', bundle.data.folders.map((folder) => folder.localId));
  checkUnique('board', bundle.data.boards.map((board) => board.localId));
  checkUnique('padlet', bundle.data.padlets.map((padlet) => padlet.localId));

  return errors;
}

/**
 * Checks every cross-reference in the bundle (board.folderRef, padlet.boardRef,
 * and padlet-to-padlet metadata refs) resolves to a record present in the
 * same bundle. This runs before any DB write — a bundle with a dangling
 * reference is rejected outright rather than partially imported with the
 * bad reference silently dropped.
 */
function findReferentialIntegrityErrors(bundle: ExportBundle): string[] {
  const errors: string[] = [];
  const folderIds = new Set(bundle.data.folders.map((folder) => folder.localId));
  const boardIds = new Set(bundle.data.boards.map((board) => board.localId));
  const padletIds = new Set(bundle.data.padlets.map((padlet) => padlet.localId));

  for (const folder of bundle.data.folders) {
    if (folder.parentRef && !folderIds.has(folder.parentRef)) {
      errors.push(`Folder "${folder.name}" references parent folder "${folder.parentRef}" which is not in this archive.`);
    }
  }

  for (const board of bundle.data.boards) {
    if (board.folderRef && !folderIds.has(board.folderRef)) {
      errors.push(`Board "${board.title}" references folder "${board.folderRef}" which is not in this archive.`);
    }
  }

  for (const padlet of bundle.data.padlets) {
    if (!boardIds.has(padlet.boardRef)) {
      errors.push(`Padlet "${padlet.title}" references board "${padlet.boardRef}" which is not in this archive.`);
    }

    for (const key of PADLET_METADATA_REF_KEYS) {
      const value = padlet.metadata[key];
      if (typeof value === 'string' && !padletIds.has(value)) {
        errors.push(`Padlet "${padlet.title}" has metadata.${key} referencing a padlet not in this archive.`);
      }
    }

    const childIds = padlet.metadata[PADLET_METADATA_REF_ARRAY_KEY];
    if (Array.isArray(childIds)) {
      for (const childId of childIds) {
        if (typeof childId === 'string' && !padletIds.has(childId)) {
          errors.push(`Padlet "${padlet.title}" has a childPadletIds entry referencing a padlet not in this archive.`);
        }
      }
    }
  }

  return errors;
}

/**
 * Unzips and validates an uploaded workspace export archive.
 * Throws ImportValidationError with a user-facing message on any
 * structural, schema, version, or referential-integrity mismatch —
 * callers should not attempt partial recovery from a failed parse.
 */
export async function parseExportZip(zipBuffer: Buffer): Promise<ExportBundle> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipBuffer);
  } catch {
    throw new ImportValidationError('The uploaded file is not a valid zip archive.');
  }

  const manifestFile = zip.file('manifest.json');
  const dataFile = zip.file('data.json');

  if (!manifestFile || !dataFile) {
    throw new ImportValidationError('Archive is missing manifest.json or data.json.');
  }

  let manifestJson: unknown;
  let dataJson: unknown;
  try {
    manifestJson = JSON.parse(await manifestFile.async('string'));
    dataJson = JSON.parse(await dataFile.async('string'));
  } catch {
    throw new ImportValidationError('manifest.json or data.json is not valid JSON.');
  }

  const parsed = exportBundleSchema.safeParse({ manifest: manifestJson, data: dataJson });
  if (!parsed.success) {
    throw new ImportValidationError(
      `Export archive does not match the expected schema: ${parsed.error.issues[0]?.message ?? 'unknown error'}`,
    );
  }

  if (parsed.data.manifest.schemaVersion > EXPORT_SCHEMA_VERSION) {
    throw new ImportValidationError(
      `This archive was exported from a newer version (schema v${parsed.data.manifest.schemaVersion}) than this app supports (v${EXPORT_SCHEMA_VERSION}).`,
    );
  }

  const duplicateIdErrors = findDuplicateLocalIdErrors(parsed.data);
  if (duplicateIdErrors.length) {
    throw new ImportValidationError(
      `Archive contains ${duplicateIdErrors.length} duplicate id(s), e.g.: ${duplicateIdErrors[0]}`,
    );
  }

  const referentialErrors = findReferentialIntegrityErrors(parsed.data);
  if (referentialErrors.length) {
    throw new ImportValidationError(
      `Archive contains ${referentialErrors.length} broken reference(s), e.g.: ${referentialErrors[0]}`,
    );
  }

  return parsed.data;
}

export interface ImportPreview {
  exportedFromWorkspaceName: string;
  exportedAt: string;
  folders: { count: number; names: string[] };
  boards: { count: number; names: string[] };
  padlets: { count: number };
}

/**
 * Parse-only summary for the import preview step. Runs the exact same
 * validation as a real import (parseExportZip) — a preview that succeeds is
 * guaranteed to pass the same checks the write path will run, and a preview
 * that fails surfaces the same ImportValidationError message. No DB access,
 * no writes.
 */
export async function buildImportPreview(zipBuffer: Buffer): Promise<ImportPreview> {
  const bundle = await parseExportZip(zipBuffer);

  return {
    exportedFromWorkspaceName: bundle.manifest.exportedFromWorkspaceName,
    exportedAt: bundle.manifest.exportedAt,
    folders: {
      count: bundle.data.folders.length,
      names: bundle.data.folders.map((folder) => folder.name),
    },
    boards: {
      count: bundle.data.boards.length,
      names: bundle.data.boards.map((board) => board.title),
    },
    padlets: { count: bundle.data.padlets.length },
  };
}
