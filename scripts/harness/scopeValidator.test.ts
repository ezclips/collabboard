import { describe, expect, it } from 'vitest';
import type { PatchManifest } from './manifestSchema';
import { validateLandedCommit, validateScope, type CommandRunner } from './scopeValidator';

const hash = 'a'.repeat(40);
const manifest: PatchManifest = { patchId: 'PATCH-105', baseCommit: hash, allowedFiles: ['scripts/harness/**', 'package.json'], prohibitedFiles: ['app/**'], allowedUntrackedFiles: ['scripts/harness/**'], generatedArtifactPaths: ['test-results'], stashPolicy: 'must-be-empty', requiredCommands: [], exactCommitMessage: 'message' };

function runner(outputs: Record<string, string | undefined>): CommandRunner {
  return async (_command, args) => ({ code: outputs[args.join(' ')] === undefined ? 0 : 0, stdout: outputs[args.join(' ')] ?? '', stderr: '' });
}

function validate(outputs: Record<string, string | undefined>, override: Partial<PatchManifest> = {}) {
  return validateScope({ ...manifest, ...override }, { repoRoot: 'repo', commandRunner: runner({ 'rev-parse HEAD': `${hash}\n`, 'rev-parse origin/main': `${hash}\n`, 'diff --name-only': '', 'diff --cached --name-only': '', 'ls-files --others --exclude-standard': '', 'diff --check': '', 'stash list': '', 'log -1 --format=%s': 'message\n', ...outputs }), fileExists: () => false });
}

describe('validateScope', () => {
  it('accepts the governed base and allowed paths', async () => expect((await validate({ 'diff --name-only': 'scripts/harness/types.ts\n' })).ok).toBe(true));
  it('reports base mismatch', async () => expect((await validate({ 'rev-parse HEAD': `${'b'.repeat(40)}\n` })).violations).toContain('HEAD does not match manifest baseCommit'));
  it('rejects unauthorized changed and untracked paths', async () => {
    expect((await validate({ 'diff --name-only': 'other.ts\n' })).checks.changedPathsWithinAllowed).toBe(false);
    expect((await validate({ 'ls-files --others --exclude-standard': 'other.ts\n' })).checks.untrackedFilesWithinAllowed).toBe(false);
  });
  it('rejects prohibited, staged, stash, and whitespace paths', async () => {
    expect((await validate({ 'diff --name-only': 'app/page.tsx\n' })).checks.prohibitedPathsAbsent).toBe(false);
    expect((await validate({ 'diff --cached --name-only': 'scripts/harness/types.ts\n' })).checks.stagedFilesEmpty).toBe(false);
    expect((await validate({ 'stash list': 'stash@{0}: test\n' })).checks.stashPolicySatisfied).toBe(false);
    expect((await validate({ 'diff --check': 'bad whitespace\n' })).checks.diffCheckClean).toBe(false);
  });
  it('rejects artifacts, blob mismatches, and an existing wrong commit message', async () => {
    const artifact = await validate({}, { generatedArtifactPaths: [] });
    expect(artifact.checks.generatedArtifactsWithinAllowlist).toBe(true);
    const blob = await validate({ 'hash-object scripts/harness/types.ts': `${'b'.repeat(40)}\n` }, { candidateBlobs: { 'scripts/harness/types.ts': hash } });
    expect(blob.checks.candidateBlobsMatch).toBe(false);
    const committed = await validate({ 'rev-parse HEAD': `${'b'.repeat(40)}\n`, 'rev-parse origin/main': `${'b'.repeat(40)}\n`, 'log -1 --format=%s': 'wrong\n' });
    expect(committed.checks.commitMessageMatches).toBe(false);
  });
});

const landedCommit = 'b'.repeat(40);
const landedManifest: PatchManifest = {
  ...manifest,
  patchId: 'PATCH-106',
  allowedFiles: ['scripts/harness/**', 'package.json'],
  prohibitedFiles: ['app/**', 'components/**'],
  allowedUntrackedFiles: ['scripts/harness/**'],
  exactCommitMessage: 'landed message',
};

function landedRunner(overrides: Record<string, { readonly code?: number; readonly stdout?: string } | undefined> = {}, calls: string[] = []): CommandRunner {
  const defaults: Record<string, { readonly code?: number; readonly stdout?: string }> = {
    [`cat-file -e ${landedCommit}`]: { stdout: '' },
    [`rev-parse ${landedCommit}^`]: { stdout: `${hash}\n` },
    [`show --name-only --format= ${landedCommit}`]: { stdout: 'scripts/harness/types.ts\n' },
    [`log -1 --format=%s ${landedCommit}`]: { stdout: 'landed message\n' },
    [`rev-parse ${landedCommit}:scripts/harness/types.ts`]: { stdout: `${hash}\n` },
  };
  return async (_command, args) => {
    const key = args.join(' ');
    calls.push(key);
    const output = overrides[key] ?? defaults[key] ?? { stdout: '' };
    return { code: output.code ?? 0, stdout: output.stdout ?? '', stderr: '' };
  };
}

function validateLanded(override: Partial<PatchManifest> = {}, outputs?: Record<string, { readonly code?: number; readonly stdout?: string } | undefined>, reportedTestTotals?: { readonly tests: number; readonly files: number }) {
  return validateLandedCommit({ ...landedManifest, ...override }, landedCommit, { repoRoot: 'repo', commandRunner: landedRunner(outputs), reportedTestTotals });
}

describe('validateLandedCommit', () => {
  it('accepts a fully conforming landed commit without optional blob or test-total checks', async () => {
    const result = await validateLanded();
    expect(result).toEqual({
      ok: true,
      violations: [],
      checks: {
        landedCommitExists: true,
        parentMatchesBaseCommit: true,
        landedFilesWithinAllowed: true,
        prohibitedPathsAbsentFromLandedCommit: true,
        landedCommitMessageMatches: true,
        landedBlobsMatch: 'not-checked',
        testTotalsMatch: 'not-checked',
      },
    });
  });

  it('fails safely when the landed commit does not exist', async () => {
    const calls: string[] = [];
    const result = await validateLandedCommit(landedManifest, landedCommit, { repoRoot: 'repo', commandRunner: landedRunner({ [`cat-file -e ${landedCommit}`]: { code: 1 } }, calls) });
    expect(result.checks.landedCommitExists).toBe(false);
    expect(result.ok).toBe(false);
    expect(calls).toEqual([`cat-file -e ${landedCommit}`]);
  });

  it('reports a wrong parent/base relationship', async () => {
    const result = await validateLanded({}, { [`rev-parse ${landedCommit}^`]: { stdout: `${'c'.repeat(40)}\n` } });
    expect(result.violations).toContain('landed commit parent does not match manifest baseCommit');
  });

  it('rejects unauthorized and prohibited committed paths', async () => {
    const unauthorized = await validateLanded({}, { [`show --name-only --format= ${landedCommit}`]: { stdout: 'scripts/harness/types.ts\nother.ts\n' } });
    expect(unauthorized.checks.landedFilesWithinAllowed).toBe(false);
    const prohibited = await validateLanded({}, { [`show --name-only --format= ${landedCommit}`]: { stdout: 'scripts/harness/types.ts\napp/page.tsx\n' } });
    expect(prohibited.checks.prohibitedPathsAbsentFromLandedCommit).toBe(false);
  });

  it('reports a landed commit message mismatch', async () => {
    const result = await validateLanded({}, { [`log -1 --format=%s ${landedCommit}`]: { stdout: 'wrong\n' } });
    expect(result.checks.landedCommitMessageMatches).toBe(false);
  });

  it('checks matching and mismatching landed blob hashes when candidate blobs are supplied', async () => {
    expect((await validateLanded({ candidateBlobs: { 'scripts/harness/types.ts': hash } })).checks.landedBlobsMatch).toBe(true);
    const mismatch = await validateLanded({ candidateBlobs: { 'scripts/harness/types.ts': hash } }, { [`rev-parse ${landedCommit}:scripts/harness/types.ts`]: { stdout: `${'c'.repeat(40)}\n` } });
    expect(mismatch.checks.landedBlobsMatch).toBe(false);
  });

  it('compares expected test totals only when reported totals are supplied', async () => {
    const expectedTestTotals = { unit: { tests: 471, files: 47 } };
    expect((await validateLanded({ expectedTestTotals })).checks.testTotalsMatch).toBe('not-checked');
    expect((await validateLanded({ expectedTestTotals }, undefined, { tests: 471, files: 47 })).checks.testTotalsMatch).toBe(true);
    const mismatch = await validateLanded({ expectedTestTotals }, undefined, { tests: 470, files: 47 });
    expect(mismatch.checks.testTotalsMatch).toBe(false);
    expect(mismatch.ok).toBe(false);
  });

  it('fails safely for malformed reported totals input', async () => {
    const result = await validateLanded({ expectedTestTotals: { unit: { tests: 471, files: 47 } } }, undefined, { tests: '471', files: 47 } as unknown as { tests: number; files: number });
    expect(result.checks.testTotalsMatch).toBe(false);
    expect(result.violations).toContain('reported test totals do not match manifest expectedTestTotals');
  });
});
