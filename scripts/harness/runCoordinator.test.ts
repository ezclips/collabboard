import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PatchManifest } from './manifestSchema';
import { generateWorktreeId, resolveManifestPath, runCoordinated, WORKTREE_ID_PATTERN } from './runCoordinator';
import type { EvidenceBundle, TestRunnerOptions } from './types';

const BASE = 'd'.repeat(40);
const roots: string[] = [];

function manifest(patchId = 'PATCH-109'): PatchManifest {
  return {
    patchId,
    baseCommit: BASE,
    allowedFiles: [],
    prohibitedFiles: [],
    allowedUntrackedFiles: [],
    generatedArtifactPaths: ['test-results', 'playwright-report', '.next/trace', '.fable5/evidence'],
    stashPolicy: 'must-be-empty',
    requiredCommands: [{ label: 'unit', command: process.execPath, args: ['-e', 'process.exit(0)'], expectedExitCode: 0 }],
    exactCommitMessage: 'feat(harness): add patch-id/worktree resolution layer for the test runner (PATCH-109)',
  };
}

function evidence(ok: boolean): EvidenceBundle {
  const now = new Date().toISOString();
  return {
    ok,
    patchId: 'PATCH-109',
    startedAt: now,
    finishedAt: now,
    totalDurationMs: 0,
    commands: [],
    stoppedEarly: false,
    parsedTestTotals: null,
    expectedTestTotalsMatch: 'not-checked',
    worktree: { used: false, worktreeId: null },
    serverManaged: { used: false, started: false },
    cleanup: { ok: true, worktreeRemoveResult: null, serverStopResult: null, errors: [] },
    evidenceBundlePath: 'evidence.json',
  };
}

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'patch-109-unit-'));
  roots.push(root);
  await mkdir(join(root, '.fable5', 'patches'), { recursive: true });
  await writeFile(join(root, '.fable5', 'patches', 'PATCH-109.manifest.json'), `${JSON.stringify(manifest(), null, 2)}\n`, 'utf8');
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  vi.restoreAllMocks();
});

describe('run coordinator', () => {
  it('resolves a valid patch ID to the exact manifest path', async () => {
    const root = await fixture();
    expect(resolveManifestPath(root, { patchId: 'PATCH-109' })).toBe(resolve(root, '.fable5', 'patches', 'PATCH-109.manifest.json'));
  });

  it('uses an explicit manifest path without patch-ID resolution', async () => {
    const root = await fixture();
    const explicit = '.fable5/patches/PATCH-109.manifest.json';
    expect(resolveManifestPath(root, { manifestPath: explicit })).toBe(resolve(root, explicit));
  });

  it('rejects missing, duplicate, invalid, and traversal-style inputs', async () => {
    const root = await fixture();
    await expect(runCoordinated({ repoRoot: root, runner: async () => evidence(true) })).resolves.toMatchObject({ ok: false, reason: 'invalid-arguments' });
    await expect(runCoordinated({ repoRoot: root, patchId: 'PATCH-109', manifestPath: '.fable5/patches/PATCH-109.manifest.json', runner: async () => evidence(true) })).resolves.toMatchObject({ ok: false, reason: 'invalid-arguments' });
    await expect(runCoordinated({ repoRoot: root, patchId: '../PATCH-109', runner: async () => evidence(true) })).resolves.toMatchObject({ ok: false, reason: 'invalid-arguments' });
    await expect(runCoordinated({ repoRoot: root, manifestPath: '../escape.json', runner: async () => evidence(true) })).resolves.toMatchObject({ ok: false, reason: 'invalid-arguments' });
  });

  it('returns manifest-not-found and does not call the runner', async () => {
    const root = await fixture();
    const runner = vi.fn(async () => evidence(true));
    await expect(runCoordinated({ repoRoot: root, patchId: 'PATCH-999', runner })).resolves.toMatchObject({ ok: false, reason: 'manifest-not-found' });
    expect(runner).not.toHaveBeenCalled();
  });

  it('returns invalid-manifest and does not call the runner', async () => {
    const root = await fixture();
    await writeFile(join(root, '.fable5', 'patches', 'PATCH-109.manifest.json'), '{"patchId":false}', 'utf8');
    const runner = vi.fn(async () => evidence(true));
    await expect(runCoordinated({ repoRoot: root, patchId: 'PATCH-109', runner })).resolves.toMatchObject({ ok: false, reason: 'invalid-manifest' });
    expect(runner).not.toHaveBeenCalled();
  });

  it('generates a governed worktree ID only when isolated execution is requested', async () => {
    const root = await fixture();
    const calls: TestRunnerOptions[] = [];
    await runCoordinated({ repoRoot: root, patchId: 'PATCH-109', isolated: true, runner: async (_manifest, options) => { calls.push(options); return evidence(true); } });
    expect(calls[0].useOwnedWorktree?.worktreeId).toMatch(WORKTREE_ID_PATTERN);
  });

  it('uses an explicit worktree ID verbatim', async () => {
    const root = await fixture();
    const calls: TestRunnerOptions[] = [];
    await runCoordinated({ repoRoot: root, patchId: 'PATCH-109', worktreeId: 'explicit-id', runner: async (_manifest, options) => { calls.push(options); return evidence(true); } });
    expect(calls[0].useOwnedWorktree).toEqual({ worktreeId: 'explicit-id' });
  });

  it('omits useOwnedWorktree when neither isolated nor worktreeId is supplied', async () => {
    const root = await fixture();
    const calls: TestRunnerOptions[] = [];
    await runCoordinated({ repoRoot: root, patchId: 'PATCH-109', runner: async (_manifest, options) => { calls.push(options); return evidence(true); } });
    expect(calls[0].useOwnedWorktree).toBeUndefined();
  });

  it('calls runManifestCommands exactly once and forwards options exactly', async () => {
    const root = await fixture();
    const runner = vi.fn(async (_manifest: PatchManifest, _options: TestRunnerOptions) => evidence(true));
    await runCoordinated({ repoRoot: root, patchId: 'PATCH-109', logDir: 'logs', commandTimeoutMs: 123, worktreeId: 'unit-tree', runner });
    expect(runner).toHaveBeenCalledTimes(1);
    expect(runner.mock.calls[0][1]).toEqual({ repoRoot: root, logDir: 'logs', commandTimeoutMs: 123, useOwnedWorktree: { worktreeId: 'unit-tree' } });
  });

  it('passes completed ok through exactly for true and false evidence values', async () => {
    const root = await fixture();
    await expect(runCoordinated({ repoRoot: root, patchId: 'PATCH-109', runner: async () => evidence(true) })).resolves.toMatchObject({ reason: 'completed', ok: true });
    await expect(runCoordinated({ repoRoot: root, patchId: 'PATCH-109', runner: async () => evidence(false) })).resolves.toMatchObject({ reason: 'completed', ok: false });
  });

  it('generates collision-resistant IDs matching the exact worktree regex', () => {
    const ids = Array.from({ length: 20 }, () => generateWorktreeId('PATCH-109'));
    expect(ids.every((id) => WORKTREE_ID_PATTERN.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('returns JSON-serializable structured union members', async () => {
    const root = await fixture();
    const completed = await runCoordinated({ repoRoot: root, patchId: 'PATCH-109', runner: async () => evidence(true) });
    const invalid = await runCoordinated({ repoRoot: root, runner: async () => evidence(true) });
    expect(JSON.parse(JSON.stringify(completed))).toEqual(completed);
    expect(JSON.parse(JSON.stringify(invalid))).toEqual(invalid);
    expect(Object.keys(completed).sort()).toEqual(['evidence', 'manifestPath', 'ok', 'patchId', 'reason', 'worktree']);
  });
});
