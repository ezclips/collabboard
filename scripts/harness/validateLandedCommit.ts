import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { patchManifestSchema, type PatchManifest } from './manifestSchema';
import { validateLandedCommit } from './scopeValidator';
import type { LandedCommitValidationResult } from './types';

function usage(): never {
  throw new Error('usage: validateLandedCommit <manifest-path> <landed-commit-sha> [--reported-totals-file <path>]');
}

function malformedTotalsResult(manifest: PatchManifest): LandedCommitValidationResult {
  return {
    ok: false,
    violations: ['reported totals file is malformed'],
    checks: {
      landedCommitExists: false,
      parentMatchesBaseCommit: false,
      landedFilesWithinAllowed: false,
      prohibitedPathsAbsentFromLandedCommit: false,
      landedCommitMessageMatches: false,
      landedBlobsMatch: manifest.candidateBlobs ? false : 'not-checked',
      testTotalsMatch: manifest.expectedTestTotals?.unit ? false : 'not-checked',
    },
  };
}

function readTotals(report: unknown): { readonly tests: number; readonly files: number } {
  if (!report || typeof report !== 'object') throw new Error('expected object');
  const candidate = report as {
    readonly numTotalTests?: unknown;
    readonly numTotalTestSuites?: unknown;
    readonly testResults?: unknown;
  };
  if (typeof candidate.numTotalTests === 'number' && typeof candidate.numTotalTestSuites === 'number') {
    return { tests: candidate.numTotalTests, files: candidate.numTotalTestSuites };
  }
  if (Array.isArray(candidate.testResults)) {
    const tests = candidate.testResults.reduce((total, file) => {
      const assertions = file && typeof file === 'object' && Array.isArray((file as { readonly assertionResults?: unknown }).assertionResults)
        ? (file as { readonly assertionResults: readonly unknown[] }).assertionResults.length
        : 0;
      return total + assertions;
    }, 0);
    return { tests, files: candidate.testResults.length };
  }
  throw new Error('missing totals');
}

async function main(): Promise<void> {
  const [manifestPath, landedCommit, flag, totalsPath, extra] = process.argv.slice(2);
  if (!manifestPath || !landedCommit || extra || (flag && flag !== '--reported-totals-file') || (flag && !totalsPath)) usage();
  const manifest = patchManifestSchema.parse(JSON.parse(await readFile(resolve(manifestPath), 'utf8')));
  let reportedTestTotals: { readonly tests: number; readonly files: number } | undefined;
  if (totalsPath) {
    try {
      reportedTestTotals = readTotals(JSON.parse(await readFile(resolve(totalsPath), 'utf8')));
    } catch {
      const result = malformedTotalsResult(manifest);
      process.stdout.write(`${JSON.stringify(result)}\n`);
      process.exitCode = 1;
      return;
    }
  }
  const result = await validateLandedCommit(manifest, landedCommit, { repoRoot: process.cwd(), reportedTestTotals });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}

main().catch((error) => {
  process.stdout.write(`${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'unknown error' })}\n`);
  process.exitCode = 1;
});
