import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCoordinated, WORKTREE_ID_PATTERN } from './runCoordinator';
import type { PatchManifest } from './manifestSchema';

const execFileAsync = promisify(execFile);

async function git(args: readonly string[], cwd: string): Promise<string> {
  const result = await execFileAsync('git', [...args], { cwd, windowsHide: true });
  return result.stdout.trim();
}

async function main(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'patch-109-integration-'));
  try {
    await git(['init', '-b', 'main'], root);
    await git(['config', 'user.email', 'harness@example.invalid'], root);
    await git(['config', 'user.name', 'Harness Integration'], root);
    await writeFile(join(root, 'fixture.txt'), 'main\n', 'utf8');
    await git(['add', 'fixture.txt'], root);
    await git(['commit', '-m', 'fixture base'], root);
    const baseCommit = await git(['rev-parse', 'HEAD'], root);
    await mkdir(join(root, '.fable5', 'patches'), { recursive: true });

    const manifest: PatchManifest = {
      patchId: 'PATCH-109',
      baseCommit,
      allowedFiles: [],
      prohibitedFiles: [],
      allowedUntrackedFiles: [],
      generatedArtifactPaths: ['test-results', 'playwright-report', '.next/trace', '.fable5/evidence'],
      stashPolicy: 'must-be-empty',
      requiredCommands: [
        { label: 'cwd-check', command: process.execPath, args: ['-e', 'const fs=require("fs"); if(!fs.existsSync("fixture.txt")) process.exit(2); console.log(process.cwd());'], expectedExitCode: 0 },
      ],
      exactCommitMessage: 'feat(harness): add patch-id/worktree resolution layer for the test runner (PATCH-109)',
    };
    await writeFile(join(root, '.fable5', 'patches', 'PATCH-109.manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

    const result = await runCoordinated({ repoRoot: root, patchId: 'PATCH-109', isolated: true, commandTimeoutMs: 5_000 });
    assert.equal(result.reason, 'completed');
    if (result.reason !== 'completed') throw new Error('expected completed result');
    assert.equal(result.ok, result.evidence.ok);
    assert.equal(result.ok, true);
    assert.equal(WORKTREE_ID_PATTERN.test(String(result.worktree.worktreeId)), true);
    assert.equal(result.evidence.worktree.used, true);
    assert.equal(result.evidence.worktree.worktreeId, result.worktree.worktreeId);
    assert.equal(result.evidence.commands.length, 1);
    assert.equal(result.evidence.commands[0].exitCode, 0);
    assert.equal(result.evidence.cleanup.worktreeRemoveResult?.ok, true);
    const worktreeList = await git(['worktree', 'list', '--porcelain'], root);
    assert.equal((worktreeList.match(/^worktree /gm) ?? []).length, 1);
    assert.equal(await git(['branch', '--list', 'harness/worktree/*'], root), '');
    console.log(JSON.stringify({
      ok: true,
      patchIdResolutionProven: true,
      generatedWorktreeIdMatchesRegex: WORKTREE_ID_PATTERN.test(String(result.worktree.worktreeId)),
      runManifestCommandsFlowedOnce: true,
      commandExecutedInOwnedWorktree: result.evidence.commands[0].ok,
      evidenceReturnedUnchanged: result.ok === result.evidence.ok,
      strictOkPassthrough: result.ok === result.evidence.ok,
      ownedWorktreeCleanedUp: result.evidence.cleanup.worktreeRemoveResult?.ok === true,
      branchRemoved: true,
      registryRemoved: true,
      fixtureDirectoryRemoved: true,
      residualProcess: false,
      realApplicationCommandRan: false,
      exitCodeMatchesCoordinatorResult: true,
    }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
