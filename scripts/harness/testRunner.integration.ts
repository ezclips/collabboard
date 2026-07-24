import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runManifestCommands } from './testRunner';
import type { PatchManifest } from './manifestSchema';

const BASE = 'c'.repeat(40);

async function main(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'patch-108-integration-'));
  const logDir = join(root, '.fable5', 'evidence', 'integration');
  try {
    const manifest: PatchManifest = {
      patchId: 'PATCH-108',
      baseCommit: BASE,
      allowedFiles: [],
      prohibitedFiles: [],
      allowedUntrackedFiles: [],
      generatedArtifactPaths: ['test-results', 'playwright-report', '.next/trace'],
      stashPolicy: 'must-be-empty',
      requiredCommands: [
        { label: 'first', command: process.execPath, args: ['-e', 'console.log("first-ok")'], expectedExitCode: 0 },
        { label: 'second', command: process.execPath, args: ['-e', 'console.error("second-fail"); process.exit(1)'], expectedExitCode: 0 },
        { label: 'never', command: process.execPath, args: ['-e', 'console.log("must-not-run")'], expectedExitCode: 0 },
      ],
      exactCommitMessage: 'feat(harness): add manifest-driven test runner and evidence bundle (PATCH-108)',
    };

    const bundle = await runManifestCommands(manifest, { repoRoot: root, logDir, commandTimeoutMs: 5_000 });
    assert.equal(bundle.ok, false);
    assert.equal(bundle.stoppedEarly, true);
    assert.deepEqual(bundle.commands.map((command) => command.label), ['first', 'second']);
    assert.equal(bundle.commands[0].exitCode, 0);
    assert.equal(bundle.commands[1].exitCode, 1);
    assert.ok(bundle.commands.every((command) => command.durationMs >= 0));
    assert.ok((await readFile(bundle.commands[0].stdoutLogPath, 'utf8')).includes('first-ok'));
    assert.ok((await readFile(bundle.commands[1].stderrLogPath, 'utf8')).includes('second-fail'));
    assert.deepEqual(JSON.parse(await readFile(bundle.evidenceBundlePath, 'utf8')), bundle);
    assert.equal(bundle.worktree.used, false);
    assert.equal(bundle.serverManaged.used, false);
    assert.equal(bundle.cleanup.ok, true);
    await rm(logDir, { recursive: true, force: true });
    console.log(JSON.stringify({
      ok: true,
      commandsRunInOrder: true,
      logsCreated: true,
      failureStoppedSubsequentCommand: true,
      evidenceJsonValid: true,
      exitCodes: bundle.commands.map((command) => command.exitCode),
      durationsNonNegative: bundle.commands.every((command) => command.durationMs >= 0),
      cleanupSucceeded: true,
      realAppCommandsRun: false,
      realServerStarted: false,
      realWorktreeCreated: false,
      residualProcess: false,
      finalResultOk: bundle.ok,
    }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
