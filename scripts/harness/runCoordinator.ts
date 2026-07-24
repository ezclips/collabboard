import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { ZodError } from 'zod';
import { patchManifestSchema, type PatchManifest } from './manifestSchema';
import { runManifestCommands } from './testRunner';
import type { CoordinatorOptions, CoordinatorResult, EvidenceBundle, TestRunnerOptions } from './types';

export type { CoordinatorOptions, CoordinatorResult } from './types';

export const WORKTREE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const PATCH_ID_PATTERN = /^PATCH-\d{3,4}$/;
const PATCH_MANIFEST_DIR = '.fable5/patches';

class CoordinatorInputError extends Error {
  constructor(readonly reason: 'invalid-arguments' | 'manifest-not-found', message: string, readonly manifestPath?: string) {
    super(message);
  }
}

function isInside(root: string, candidate: string): boolean {
  const resolvedRoot = resolve(root);
  const resolvedCandidate = resolve(candidate);
  const fromRoot = relative(resolvedRoot, resolvedCandidate);
  return fromRoot === '' || (!fromRoot.startsWith('..') && !isAbsolute(fromRoot));
}

function hasTraversalOrAbsolute(value: string): boolean {
  return value.includes('\0')
    || isAbsolute(value)
    || /^[A-Za-z]:/.test(value)
    || value.split(/[\\/]/).includes('..');
}

export function resolveManifestPath(repoRoot: string, options: Pick<CoordinatorOptions, 'manifestPath' | 'patchId'>): string {
  const hasManifestPath = Boolean(options.manifestPath);
  const hasPatchId = Boolean(options.patchId);
  if (hasManifestPath === hasPatchId) {
    throw new CoordinatorInputError('invalid-arguments', 'exactly one of manifestPath or patchId is required');
  }

  if (options.patchId) {
    if (!PATCH_ID_PATTERN.test(options.patchId)) {
      throw new CoordinatorInputError('invalid-arguments', 'patchId must match PATCH-### or PATCH-####');
    }
    const manifestPath = resolve(repoRoot, PATCH_MANIFEST_DIR, `${options.patchId}.manifest.json`);
    if (!isInside(resolve(repoRoot, PATCH_MANIFEST_DIR), manifestPath)) {
      throw new CoordinatorInputError('invalid-arguments', 'resolved manifest path escaped the patch manifest directory');
    }
    if (!existsSync(manifestPath)) {
      throw new CoordinatorInputError('manifest-not-found', 'manifest not found', manifestPath);
    }
    return manifestPath;
  }

  const manifestPath = options.manifestPath ?? '';
  if (!manifestPath || hasTraversalOrAbsolute(manifestPath)) {
    throw new CoordinatorInputError('invalid-arguments', 'manifestPath must be a repository-relative path without traversal');
  }
  const resolved = resolve(repoRoot, manifestPath);
  if (!isInside(repoRoot, resolved)) {
    throw new CoordinatorInputError('invalid-arguments', 'manifestPath must remain inside repoRoot');
  }
  if (!existsSync(resolved)) {
    throw new CoordinatorInputError('manifest-not-found', 'manifest not found', resolved);
  }
  return resolved;
}

export function generateWorktreeId(patchId: string): string {
  const normalizedPatch = patchId.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-+/, '');
  const suffix = randomBytes(3).toString('hex');
  const timestamp = Date.now().toString(36);
  const prefix = `run-${normalizedPatch || 'patch'}-${timestamp}`;
  const maxPrefixLength = 64 - suffix.length - 1;
  const id = `${prefix.slice(0, maxPrefixLength).replace(/-+$/, '')}-${suffix}`;
  if (!WORKTREE_ID_PATTERN.test(id)) {
    throw new Error('generated worktree ID does not match the governed pattern');
  }
  return id;
}

function parseManifest(raw: string): PatchManifest {
  return patchManifestSchema.parse(JSON.parse(raw));
}

export async function runCoordinated(options: CoordinatorOptions): Promise<CoordinatorResult> {
  let manifestPath: string;
  try {
    manifestPath = resolveManifestPath(options.repoRoot, options);
  } catch (error) {
    if (error instanceof CoordinatorInputError) {
      if (error.reason === 'manifest-not-found') {
        return { ok: false, reason: 'manifest-not-found', manifestPath: error.manifestPath ?? '' };
      }
      return { ok: false, reason: 'invalid-arguments', message: error.message };
    }
    return { ok: false, reason: 'invalid-arguments', message: error instanceof Error ? error.message : 'invalid coordinator arguments' };
  }

  let manifest: PatchManifest;
  try {
    manifest = parseManifest(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    if (error instanceof ZodError) {
      return { ok: false, reason: 'invalid-manifest', message: error.issues.map((issue) => issue.message).join('; ') };
    }
    return { ok: false, reason: 'invalid-manifest', message: error instanceof Error ? error.message : 'unable to parse manifest' };
  }

  const worktreeId = options.worktreeId ?? (options.isolated ? generateWorktreeId(manifest.patchId) : undefined);
  const runner = options.runner ?? runManifestCommands;
  const runnerOptions: TestRunnerOptions = {
    repoRoot: options.repoRoot,
    logDir: options.logDir,
    commandTimeoutMs: options.commandTimeoutMs,
    useOwnedWorktree: worktreeId ? { worktreeId } : undefined,
  };
  const evidence: EvidenceBundle = await runner(manifest, runnerOptions);
  return {
    ok: evidence.ok,
    reason: 'completed',
    patchId: manifest.patchId,
    manifestPath,
    worktree: { requested: Boolean(worktreeId), worktreeId: worktreeId ?? null },
    evidence,
  };
}
