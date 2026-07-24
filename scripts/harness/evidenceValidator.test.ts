import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { PatchManifest } from './manifestSchema';
import type { EvidenceBundle } from './types';
import { validateEvidenceBundle } from './evidenceValidator';

const BASE = 'e'.repeat(40);
const roots: string[] = [];

async function fixture(): Promise<{ root: string; evidenceRoot: string }> {
  const root = await mkdtemp(join(tmpdir(), 'patch-110-unit-'));
  roots.push(root);
  return { root, evidenceRoot: join(root, '.fable5', 'evidence') };
}

function manifest(overrides: Partial<PatchManifest> = {}): PatchManifest {
  return {
    patchId: 'PATCH-110',
    baseCommit: BASE,
    allowedFiles: [],
    prohibitedFiles: [],
    allowedUntrackedFiles: [],
    generatedArtifactPaths: ['test-results', 'playwright-report', '.next/trace', '.fable5/evidence'],
    stashPolicy: 'must-be-empty',
    requiredCommands: [
      { label: 'first', command: process.execPath, args: ['-e', 'process.exit(0)'], expectedExitCode: 0 },
      { label: 'second', command: process.execPath, args: ['-e', 'process.exit(0)'], expectedExitCode: 0 },
    ],
    exactCommitMessage: 'feat(harness): add evidence-bundle verification layer (PATCH-110)',
    ...overrides,
  };
}

function command(label: string, evidenceRoot: string, overrides: Partial<EvidenceBundle['commands'][number]> = {}): EvidenceBundle['commands'][number] {
  const now = new Date().toISOString();
  return {
    label,
    command: process.execPath,
    args: ['-e', 'process.exit(0)'],
    exitCode: 0,
    expectedExitCode: 0,
    ok: true,
    timedOut: false,
    durationMs: 1,
    stdoutLogPath: resolve(evidenceRoot, `${label}.stdout.log`),
    stderrLogPath: resolve(evidenceRoot, `${label}.stderr.log`),
    parsedTestTotals: null,
    startedAt: now,
    finishedAt: now,
    ...overrides,
  };
}

function bundle(evidenceRoot: string, overrides: Partial<EvidenceBundle> = {}): EvidenceBundle {
  const now = new Date().toISOString();
  return {
    ok: true,
    patchId: 'PATCH-110',
    startedAt: now,
    finishedAt: now,
    totalDurationMs: 2,
    commands: [command('first', evidenceRoot), command('second', evidenceRoot)],
    stoppedEarly: false,
    parsedTestTotals: null,
    expectedTestTotalsMatch: 'not-checked',
    worktree: { used: false, worktreeId: null },
    serverManaged: { used: false, started: false },
    cleanup: { ok: true, worktreeRemoveResult: null, serverStopResult: null, errors: [] },
    evidenceBundlePath: resolve(evidenceRoot, 'evidence.json'),
    ...overrides,
  };
}

function existsAll(_path: string): boolean {
  return true;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('evidence validator', () => {
  it('accepts a fully conforming complete bundle', async () => {
    const { evidenceRoot } = await fixture();
    const result = await validateEvidenceBundle(manifest(), bundle(evidenceRoot), { evidenceRoot, fileExists: existsAll });
    expect(result.ok).toBe(true);
    expect(result.checks).toMatchObject({
      bundleShapeValid: true,
      patchIdMatches: true,
      requiredCommandsRepresented: true,
      noExtraCommandRecords: true,
      noDuplicateCommandRecords: true,
      orderMatches: true,
      exitCodeConsistency: true,
      stoppedEarlyConsistency: true,
      expectedTestTotalsGoverned: 'not-checked',
      overallOkConsistency: true,
      logFilesExistWithinRoot: true,
    });
  });

  it('rejects malformed bundle shape before semantic checks', async () => {
    const { evidenceRoot } = await fixture();
    const result = await validateEvidenceBundle(manifest(), { ok: 'yes' }, { evidenceRoot, fileExists: existsAll });
    expect(result.ok).toBe(false);
    expect(result.checks.bundleShapeValid).toBe(false);
    expect(Object.entries(result.checks).filter(([key]) => key !== 'bundleShapeValid').every(([, value]) => value === false)).toBe(true);
  });

  it('detects patchId mismatch', async () => {
    const { evidenceRoot } = await fixture();
    const result = await validateEvidenceBundle(manifest(), bundle(evidenceRoot, { patchId: 'PATCH-999' }), { evidenceRoot, fileExists: existsAll });
    expect(result.checks.patchIdMatches).toBe(false);
  });

  it('detects a missing required command without stoppedEarly', async () => {
    const { evidenceRoot } = await fixture();
    const result = await validateEvidenceBundle(manifest(), bundle(evidenceRoot, { commands: [command('first', evidenceRoot)] }), { evidenceRoot, fileExists: existsAll });
    expect(result.checks.requiredCommandsRepresented).toBe(false);
  });

  it('detects an extra command record', async () => {
    const { evidenceRoot } = await fixture();
    const result = await validateEvidenceBundle(manifest(), bundle(evidenceRoot, { commands: [command('first', evidenceRoot), command('second', evidenceRoot), command('extra', evidenceRoot)] }), { evidenceRoot, fileExists: existsAll });
    expect(result.checks.noExtraCommandRecords).toBe(false);
  });

  it('detects duplicate command labels', async () => {
    const { evidenceRoot } = await fixture();
    const result = await validateEvidenceBundle(manifest(), bundle(evidenceRoot, { commands: [command('first', evidenceRoot), command('first', evidenceRoot)] }), { evidenceRoot, fileExists: existsAll });
    expect(result.checks.noDuplicateCommandRecords).toBe(false);
  });

  it('detects wrong command ordering', async () => {
    const { evidenceRoot } = await fixture();
    const result = await validateEvidenceBundle(manifest(), bundle(evidenceRoot, { commands: [command('second', evidenceRoot), command('first', evidenceRoot)] }), { evidenceRoot, fileExists: existsAll });
    expect(result.checks.orderMatches).toBe(false);
  });

  it('detects inconsistent successful exit-code state', async () => {
    const { evidenceRoot } = await fixture();
    const result = await validateEvidenceBundle(manifest(), bundle(evidenceRoot, { commands: [command('first', evidenceRoot, { exitCode: 1, ok: true }), command('second', evidenceRoot)] }), { evidenceRoot, fileExists: existsAll });
    expect(result.checks.exitCodeConsistency).toBe(false);
  });

  it('detects inconsistent timeout state', async () => {
    const { evidenceRoot } = await fixture();
    const result = await validateEvidenceBundle(manifest(), bundle(evidenceRoot, { commands: [command('first', evidenceRoot, { timedOut: true, ok: true }), command('second', evidenceRoot)] }), { evidenceRoot, fileExists: existsAll });
    expect(result.checks.exitCodeConsistency).toBe(false);
  });

  it('accepts a valid stoppedEarly prefix omission', async () => {
    const { evidenceRoot } = await fixture();
    const early = bundle(evidenceRoot, {
      ok: false,
      stoppedEarly: true,
      commands: [command('first', evidenceRoot, { exitCode: 1, ok: false })],
    });
    const result = await validateEvidenceBundle(manifest(), early, { evidenceRoot, fileExists: existsAll });
    expect(result.checks.requiredCommandsRepresented).toBe(true);
    expect(result.checks.stoppedEarlyConsistency).toBe(true);
  });

  it('rejects stoppedEarly with all present records ok', async () => {
    const { evidenceRoot } = await fixture();
    const result = await validateEvidenceBundle(manifest(), bundle(evidenceRoot, { stoppedEarly: true, commands: [command('first', evidenceRoot)] }), { evidenceRoot, fileExists: existsAll });
    expect(result.checks.stoppedEarlyConsistency).toBe(false);
  });

  it('checks governed totals match and mismatch explicitly', async () => {
    const { evidenceRoot } = await fixture();
    const governed = manifest({ expectedTestTotals: { unit: { tests: 2, files: 1 } } });
    await expect(validateEvidenceBundle(governed, bundle(evidenceRoot, { expectedTestTotalsMatch: true, parsedTestTotals: { tests: 2, files: 1 } }), { evidenceRoot, fileExists: existsAll })).resolves.toMatchObject({ checks: { expectedTestTotalsGoverned: true } });
    await expect(validateEvidenceBundle(governed, bundle(evidenceRoot, { ok: false, expectedTestTotalsMatch: false, parsedTestTotals: { tests: 1, files: 1 } }), { evidenceRoot, fileExists: existsAll })).resolves.toMatchObject({ checks: { expectedTestTotalsGoverned: false } });
  });

  it('detects overallOkConsistency mismatch by recomputing success', async () => {
    const { evidenceRoot } = await fixture();
    const result = await validateEvidenceBundle(manifest(), bundle(evidenceRoot, { ok: true, commands: [command('first', evidenceRoot, { exitCode: 1, ok: false })] }), { evidenceRoot, fileExists: existsAll });
    expect(result.checks.overallOkConsistency).toBe(false);
  });

  it('detects missing log paths through fileExists injection', async () => {
    const { evidenceRoot } = await fixture();
    const result = await validateEvidenceBundle(manifest(), bundle(evidenceRoot), { evidenceRoot, fileExists: (path) => !path.endsWith('first.stdout.log') });
    expect(result.checks.logFilesExistWithinRoot).toBe(false);
    expect(result.logValidation.missingPaths.some((path) => path.endsWith('first.stdout.log'))).toBe(true);
  });

  it('detects escaped log paths and returns a JSON-serializable result shape', async () => {
    const { root, evidenceRoot } = await fixture();
    const escaped = bundle(evidenceRoot, { commands: [command('first', evidenceRoot, { stdoutLogPath: resolve(root, 'outside.log') }), command('second', evidenceRoot)] });
    const result = await validateEvidenceBundle(manifest(), escaped, { evidenceRoot, fileExists: existsAll });
    expect(result.checks.logFilesExistWithinRoot).toBe(false);
    expect(result.logValidation.escapedPaths).toContain(resolve(root, 'outside.log'));
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(Object.keys(result).sort()).toEqual(['checks', 'logValidation', 'ok', 'schemaErrors', 'violations']);
  });
});
