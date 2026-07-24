import { existsSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { ZodError } from 'zod';
import type { PatchManifest } from './manifestSchema';
import { evidenceBundleSchema, type ParsedEvidenceBundle } from './evidenceSchema';
import type { EvidenceValidationOptions, EvidenceValidationResult } from './types';

const falseChecks: EvidenceValidationResult['checks'] = {
  bundleShapeValid: false,
  patchIdMatches: false,
  requiredCommandsRepresented: false,
  noExtraCommandRecords: false,
  noDuplicateCommandRecords: false,
  orderMatches: false,
  exitCodeConsistency: false,
  stoppedEarlyConsistency: false,
  expectedTestTotalsGoverned: false,
  overallOkConsistency: false,
  logFilesExistWithinRoot: false,
};

function linesFromZod(error: ZodError): readonly string[] {
  return error.issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`);
}

function inside(root: string, candidate: string): boolean {
  const fromRoot = relative(root, candidate);
  return fromRoot === '' || (!fromRoot.startsWith('..') && !isAbsolute(fromRoot));
}

function canonicalExistingPath(path: string, exists: (path: string) => boolean): string | null {
  if (!exists(path)) return null;
  try {
    return realpathSync.native(path);
  } catch {
    return resolve(path);
  }
}

function labelCounts(labels: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  return counts;
}

function commandRepresentation(
  manifestLabels: readonly string[],
  bundle: ParsedEvidenceBundle,
): Pick<EvidenceValidationResult['checks'], 'requiredCommandsRepresented' | 'noExtraCommandRecords' | 'noDuplicateCommandRecords' | 'orderMatches' | 'stoppedEarlyConsistency'> {
  const recordLabels = bundle.commands.map((command) => command.label);
  const manifestSet = new Set(manifestLabels);
  const counts = labelCounts(recordLabels);
  const noDuplicateCommandRecords = [...counts.values()].every((count) => count === 1);
  const noExtraCommandRecords = recordLabels.every((label) => manifestSet.has(label));
  const orderMatches = recordLabels.every((label, index) => label === manifestLabels[index]);
  const hasFailure = bundle.commands.some((command) => !command.ok || command.timedOut);
  const firstFailureIndex = bundle.commands.findIndex((command) => !command.ok || command.timedOut);
  const validEarlyStop = bundle.stoppedEarly
    && bundle.commands.length > 0
    && bundle.commands.length < manifestLabels.length
    && orderMatches
    && bundle.commands.slice(0, -1).every((command) => command.ok && !command.timedOut)
    && Boolean(bundle.commands.at(-1) && (!bundle.commands.at(-1)?.ok || bundle.commands.at(-1)?.timedOut));
  const stoppedEarlyConsistency = bundle.stoppedEarly
    ? validEarlyStop
    : !hasFailure && bundle.commands.length === manifestLabels.length;
  const requiredCommandsRepresented = bundle.stoppedEarly
    ? validEarlyStop
    : manifestLabels.length === recordLabels.length && manifestLabels.every((label) => counts.get(label) === 1);
  return {
    requiredCommandsRepresented,
    noExtraCommandRecords,
    noDuplicateCommandRecords,
    orderMatches,
    stoppedEarlyConsistency: stoppedEarlyConsistency && (firstFailureIndex === -1 || firstFailureIndex === bundle.commands.length - 1),
  };
}

function validateLogs(bundle: ParsedEvidenceBundle, options: EvidenceValidationOptions): EvidenceValidationResult['logValidation'] & { ok: boolean } {
  const exists = options.fileExists ?? existsSync;
  const root = canonicalExistingPath(options.evidenceRoot, exists) ?? resolve(options.evidenceRoot);
  const checkedPaths: string[] = [];
  const missingPaths: string[] = [];
  const escapedPaths: string[] = [];
  for (const command of bundle.commands) {
    for (const logPath of [command.stdoutLogPath, command.stderrLogPath]) {
      const resolved = resolve(logPath);
      checkedPaths.push(resolved);
      if (!inside(root, resolved)) {
        escapedPaths.push(logPath);
        continue;
      }
      const canonical = canonicalExistingPath(resolved, exists);
      if (!canonical) {
        missingPaths.push(logPath);
        continue;
      }
      if (!inside(root, canonical)) escapedPaths.push(logPath);
    }
  }
  return {
    ok: missingPaths.length === 0 && escapedPaths.length === 0,
    checkedPaths,
    missingPaths,
    escapedPaths,
  };
}

export async function validateEvidenceBundle(
  manifest: PatchManifest,
  bundle: unknown,
  options: EvidenceValidationOptions,
): Promise<EvidenceValidationResult> {
  const parsed = evidenceBundleSchema.safeParse(bundle);
  if (!parsed.success) {
    const schemaErrors = linesFromZod(parsed.error);
    return {
      ok: false,
      violations: ['evidence bundle schema validation failed', ...schemaErrors],
      checks: falseChecks,
      schemaErrors,
      logValidation: { checkedPaths: [], missingPaths: [], escapedPaths: [] },
    };
  }

  const evidence = parsed.data;
  const manifestLabels = manifest.requiredCommands.map((command) => command.label);
  const representation = commandRepresentation(manifestLabels, evidence);
  const patchIdMatches = evidence.patchId === manifest.patchId;
  const exitCodeConsistency = evidence.commands.every((command) => command.ok === (command.exitCode === command.expectedExitCode) && (!command.timedOut || !command.ok));
  const expectedTestTotalsGoverned = manifest.expectedTestTotals?.unit
    ? evidence.expectedTestTotalsMatch === true
    : 'not-checked' as const;
  const recomputedOk = evidence.commands.every((command) => command.ok)
    && evidence.expectedTestTotalsMatch !== false
    && evidence.cleanup.ok;
  const overallOkConsistency = evidence.ok === recomputedOk;
  const logValidation = validateLogs(evidence, options);

  const checks: EvidenceValidationResult['checks'] = {
    bundleShapeValid: true,
    patchIdMatches,
    ...representation,
    exitCodeConsistency,
    expectedTestTotalsGoverned,
    overallOkConsistency,
    logFilesExistWithinRoot: logValidation.ok,
  };
  const labels: Record<keyof EvidenceValidationResult['checks'], string> = {
    bundleShapeValid: 'evidence bundle schema validation failed',
    patchIdMatches: 'bundle patchId does not match manifest patchId',
    requiredCommandsRepresented: 'required commands are not represented exactly as governed',
    noExtraCommandRecords: 'bundle includes an unexpected command record',
    noDuplicateCommandRecords: 'bundle includes duplicate command records',
    orderMatches: 'command record order does not match manifest order',
    exitCodeConsistency: 'command ok flags do not match expected exit-code comparison',
    stoppedEarlyConsistency: 'stoppedEarly shape is inconsistent with command records',
    expectedTestTotalsGoverned: 'governed expected test totals were not honored',
    overallOkConsistency: 'bundle ok does not match independently recomputed result',
    logFilesExistWithinRoot: 'referenced log files are missing or outside the evidence root',
  };
  const violations = (Object.entries(checks) as Array<[keyof EvidenceValidationResult['checks'], boolean | 'not-checked']>)
    .filter(([, value]) => value === false)
    .map(([key]) => labels[key]);
  return {
    ok: violations.length === 0,
    violations,
    checks,
    schemaErrors: [],
    logValidation: {
      checkedPaths: logValidation.checkedPaths,
      missingPaths: logValidation.missingPaths,
      escapedPaths: logValidation.escapedPaths,
    },
  };
}
