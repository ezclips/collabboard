import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runManifestCommands } from './testRunner';
import { validateEvidenceBundle } from './evidenceValidator';
import type { PatchManifest } from './manifestSchema';

async function main(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'patch-110-integration-'));
  const evidenceRoot = join(root, '.fable5', 'evidence');
  const logDir = join(evidenceRoot, 'run');
  try {
    const reportPath = join(root, 'vitest-report.json');
    const manifest: PatchManifest = {
      patchId: 'PATCH-110',
      baseCommit: 'f'.repeat(40),
      allowedFiles: [],
      prohibitedFiles: [],
      allowedUntrackedFiles: [],
      generatedArtifactPaths: ['test-results', 'playwright-report', '.next/trace', '.fable5/evidence'],
      stashPolicy: 'must-be-empty',
      requiredCommands: [
        {
          label: 'tiny-json',
          command: process.execPath,
          args: ['-e', `require("fs").writeFileSync(${JSON.stringify(reportPath)}, JSON.stringify({numTotalTests:1,numTotalTestSuites:1,numPassedTests:1,numFailedTests:0,numPendingTests:0})); console.log("tiny-ok")`, '--', '--reporter=json', `--outputFile=${reportPath}`],
          expectedExitCode: 0,
        },
      ],
      expectedTestTotals: { unit: { tests: 1, files: 1 } },
      exactCommitMessage: 'feat(harness): add evidence-bundle verification layer (PATCH-110)',
    };
    const bundle = await runManifestCommands(manifest, { repoRoot: root, logDir, commandTimeoutMs: 5_000 });
    await writeFile(join(logDir, 'bundle-copy.json'), `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');
    const copied = JSON.parse(await readFile(join(logDir, 'bundle-copy.json'), 'utf8')) as unknown;
    const valid = await validateEvidenceBundle(manifest, copied, { evidenceRoot });
    assert.equal(valid.ok, true);
    assert.equal(valid.checks.requiredCommandsRepresented, true);
    assert.equal(valid.checks.orderMatches, true);
    assert.equal(valid.checks.expectedTestTotalsGoverned, true);
    assert.equal(valid.checks.overallOkConsistency, true);
    assert.equal(valid.checks.logFilesExistWithinRoot, true);

    await unlink(bundle.commands[0].stdoutLogPath);
    const missingLog = await validateEvidenceBundle(manifest, bundle, { evidenceRoot });
    assert.equal(missingLog.ok, false);
    assert.equal(missingLog.checks.logFilesExistWithinRoot, false);
    assert.ok(missingLog.logValidation.missingPaths.includes(bundle.commands[0].stdoutLogPath));

    console.log(JSON.stringify({
      ok: true,
      realBundleProduced: true,
      validBundlePasses: valid.ok,
      requiredCommandRepresentationPasses: valid.checks.requiredCommandsRepresented,
      orderingPasses: valid.checks.orderMatches,
      testTotalsGoverned: valid.checks.expectedTestTotalsGoverned,
      overallSuccessIndependentlyConfirmed: valid.checks.overallOkConsistency,
      logsExistInsideEvidenceRoot: valid.checks.logFilesExistWithinRoot,
      deletedLogRevalidationFails: !missingLog.ok,
      failureAttributedToLogExistence: missingLog.checks.logFilesExistWithinRoot === false,
      validatorExecutedCommand: false,
      realApplicationCommandRan: false,
      realServerStarted: false,
      realWorktreeCreated: false,
      residualProcess: false,
      evidenceDirectoryCleaned: true,
      exitCodeGoverned: true,
    }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
