import { describe, expect, it } from 'vitest';
import type { PatchManifest } from './manifestSchema';
import { validateScope, type CommandRunner } from './scopeValidator';

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
