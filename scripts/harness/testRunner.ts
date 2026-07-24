import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import type { PatchManifest } from './manifestSchema';
import { startOwnedServer, stopOwnedServer } from './serverLifecycle';
import { createWorktree, removeWorktree } from './worktreeLifecycle';
import type {
  CommandExecutionRecord,
  EvidenceBundle,
  HarnessCleanupRecord,
  OwnedServerHandle,
  OwnedWorktreeHandle,
  ParsedTestTotals,
  ServerLifecycleConfig,
  ServerStartResult,
  SpawnRunner,
  TestRunnerOptions,
  WorktreeRemoveResult,
} from './types';

const DEFAULT_COMMAND_TIMEOUT_MS = 10 * 60 * 1_000;
const DEFAULT_EVIDENCE_ROOT = '.fable5/evidence';

export type { CommandExecutionRecord, EvidenceBundle, ParsedTestTotals, TestRunnerOptions } from './types';

function timestampForPath(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function sanitizeLabel(label: string): string {
  return label.replace(/[^A-Za-z0-9._-]/g, '-').replace(/-+/g, '-').slice(0, 80) || 'command';
}

function nowIso(): string {
  return new Date().toISOString();
}

function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function defaultLogDir(repoRoot: string, patchId: string): string {
  return resolve(repoRoot, DEFAULT_EVIDENCE_ROOT, `${patchId}-${timestampForPath()}`);
}

function pathInside(root: string, candidate: string): boolean {
  const resolvedRoot = resolve(root);
  const resolvedCandidate = resolve(candidate);
  return resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(`${resolvedRoot}\\`) || resolvedCandidate.startsWith(`${resolvedRoot}/`);
}

function resolveOutputFile(args: readonly string[], cwd: string): string | null {
  if (!args.includes('--reporter=json')) return null;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg.startsWith('--outputFile=')) {
      const value = arg.slice('--outputFile='.length);
      return value ? resolve(cwd, value) : null;
    }
    if (arg === '--outputFile' && args[index + 1]) {
      return resolve(cwd, args[index + 1]);
    }
  }
  return null;
}

function numberFrom(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function suiteArray(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object' && Array.isArray((value as { testResults?: unknown }).testResults)) {
    return (value as { testResults: readonly unknown[] }).testResults;
  }
  return [];
}

function countSuites(value: unknown): number | undefined {
  const direct = numberFrom((value as { numTotalTestSuites?: unknown }).numTotalTestSuites);
  if (direct !== undefined) return direct;
  const suites = suiteArray(value);
  return suites.length > 0 ? suites.length : undefined;
}

function countTests(value: unknown): number | undefined {
  const direct = numberFrom((value as { numTotalTests?: unknown }).numTotalTests);
  if (direct !== undefined) return direct;
  const suites = suiteArray(value);
  if (suites.length === 0) return undefined;
  return suites.reduce<number>((total, suite) => total + (Array.isArray((suite as { assertionResults?: unknown }).assertionResults) ? (suite as { assertionResults: readonly unknown[] }).assertionResults.length : 0), 0);
}

export async function parseVitestTotals(reportPath: string): Promise<ParsedTestTotals | null> {
  try {
    const parsed = JSON.parse(await readFile(reportPath, 'utf8')) as unknown;
    const tests = countTests(parsed);
    const files = countSuites(parsed);
    if (tests === undefined || files === undefined) {
      return { tests: 0, files: 0, parseError: 'missing Vitest total fields' };
    }
    return {
      tests,
      files,
      passed: numberFrom((parsed as { numPassedTests?: unknown }).numPassedTests),
      failed: numberFrom((parsed as { numFailedTests?: unknown }).numFailedTests),
      skipped: numberFrom((parsed as { numPendingTests?: unknown }).numPendingTests),
      durationMs: numberFrom((parsed as { startTime?: unknown }).startTime) && numberFrom((parsed as { success?: unknown }).success) === undefined
        ? undefined
        : numberFrom((parsed as { duration?: unknown }).duration),
    };
  } catch (error) {
    return { tests: 0, files: 0, parseError: error instanceof Error ? error.message : 'unable to parse Vitest JSON report' };
  }
}

const defaultSpawnRunner: SpawnRunner = (command, args, options) => new Promise((resolveResult) => {
  const stdout = createWriteStream(options.stdoutLogPath, { flags: 'a' });
  const stderr = createWriteStream(options.stderrLogPath, { flags: 'a' });
  let settled = false;
  let timedOut = false;
  const child = spawn(command, [...args], {
    cwd: options.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill(process.platform === 'win32' ? undefined : 'SIGTERM');
  }, options.timeoutMs);
  child.stdout?.pipe(stdout);
  child.stderr?.pipe(stderr);
  const finish = (exitCode: number) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    stdout.end();
    stderr.end();
    resolveResult({ exitCode, timedOut });
  };
  child.once('error', (error) => {
    stderr.write(error instanceof Error ? error.message : String(error));
    finish(1);
  });
  child.once('close', (code) => finish(timedOut ? 1 : code ?? 1));
});

function isRunnableServerConfig(value: PatchManifest['serverConfig']): value is ServerLifecycleConfig {
  const candidate = value as Partial<ServerLifecycleConfig> | undefined;
  if (!candidate) return false;
  return typeof candidate.command === 'string'
    && Array.isArray(candidate.args)
    && typeof candidate.cwd === 'string'
    && candidate.env !== undefined
    && typeof candidate.readinessUrl === 'string'
    && typeof candidate.readinessTimeoutMs === 'number'
    && typeof candidate.pollIntervalMs === 'number';
}

function syntheticRecord(label: string, command: string, message: string, logPath: string): CommandExecutionRecord {
  const startedAt = nowIso();
  return {
    label,
    command,
    args: [message],
    exitCode: 1,
    expectedExitCode: 0,
    ok: false,
    timedOut: false,
    durationMs: 0,
    stdoutLogPath: logPath,
    stderrLogPath: logPath,
    parsedTestTotals: null,
    startedAt,
    finishedAt: startedAt,
  };
}

function totalsMatch(manifest: PatchManifest, totals: ParsedTestTotals | null): boolean | 'not-checked' {
  const expected = manifest.expectedTestTotals?.unit;
  if (!expected || totals === null) return 'not-checked';
  if (totals.parseError) return false;
  return totals.tests === expected.tests && totals.files === expected.files;
}

function bundleOk(commands: readonly CommandExecutionRecord[], stoppedEarly: boolean, expectedMatch: boolean | 'not-checked', cleanup: HarnessCleanupRecord): boolean {
  return commands.every((command) => command.ok)
    && !stoppedEarly
    && expectedMatch !== false
    && cleanup.ok;
}

async function writeEvidence(bundle: EvidenceBundle): Promise<void> {
  await mkdir(dirname(bundle.evidenceBundlePath), { recursive: true });
  await writeFile(bundle.evidenceBundlePath, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');
}

async function finalizeBundle(partial: Omit<EvidenceBundle, 'ok' | 'finishedAt' | 'totalDurationMs'>, startedMs: number): Promise<EvidenceBundle> {
  const finishedAt = nowIso();
  const totalDurationMs = Math.max(0, Date.now() - startedMs);
  const expectedTestTotalsMatch = partial.expectedTestTotalsMatch;
  const bundle: EvidenceBundle = {
    ...partial,
    ok: bundleOk(partial.commands, partial.stoppedEarly, expectedTestTotalsMatch, partial.cleanup),
    finishedAt,
    totalDurationMs,
  };
  await writeEvidence(bundle);
  return bundle;
}

export async function runManifestCommands(manifest: PatchManifest, options: TestRunnerOptions): Promise<EvidenceBundle> {
  const startedMs = Date.now();
  const startedAt = nowIso();
  const repoRoot = resolve(options.repoRoot);
  const logDir = resolve(options.logDir ?? defaultLogDir(repoRoot, manifest.patchId));
  if (!pathInside(resolve(repoRoot, DEFAULT_EVIDENCE_ROOT), logDir)) {
    const fallbackDir = defaultLogDir(repoRoot, manifest.patchId);
    await mkdir(fallbackDir, { recursive: true });
    const evidenceBundlePath = resolve(fallbackDir, 'evidence.json');
    const record = syntheticRecord('runner-setup', 'validate-log-dir', 'logDir must remain inside .fable5/evidence', evidenceBundlePath);
    return finalizeBundle({
      patchId: manifest.patchId,
      startedAt,
      commands: [record],
      stoppedEarly: true,
      parsedTestTotals: null,
      expectedTestTotalsMatch: 'not-checked',
      worktree: { used: Boolean(options.useOwnedWorktree), worktreeId: options.useOwnedWorktree?.worktreeId ?? null },
      serverManaged: { used: Boolean(manifest.serverConfig), started: false },
      cleanup: { ok: true, worktreeRemoveResult: null, serverStopResult: null, errors: [] },
      evidenceBundlePath,
    }, startedMs);
  }

  await mkdir(logDir, { recursive: true });
  const evidenceBundlePath = resolve(logDir, 'evidence.json');
  const run = options.spawnRunner ?? defaultSpawnRunner;
  const timeoutMs = options.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
  const commands: CommandExecutionRecord[] = [];
  const cleanupErrors: string[] = [];
  let cwd = repoRoot;
  let stoppedEarly = false;
  let parsedTestTotals: ParsedTestTotals | null = null;
  let worktreeHandle: OwnedWorktreeHandle | null = null;
  let serverHandle: OwnedServerHandle | null = null;
  let serverStarted = false;
  let worktreeRemoveResult: WorktreeRemoveResult | null = null;
  let serverStopResult: HarnessCleanupRecord['serverStopResult'] = null;

  try {
    if (options.useOwnedWorktree) {
      const created = await createWorktree({
        baseCommit: manifest.baseCommit,
        worktreeId: options.useOwnedWorktree.worktreeId,
        parentDir: DEFAULT_EVIDENCE_ROOT,
      }, { repoRoot, metadataRoot: resolve(repoRoot, '.fable5/worktrees') });
      if (!created.ok) {
        const logPath = resolve(logDir, 'worktree-create.stderr.log');
        await writeFile(logPath, JSON.stringify(created), 'utf8');
        commands.push(syntheticRecord('worktree-create', 'createWorktree', JSON.stringify(created), logPath));
        stoppedEarly = true;
        return await finalizeBundle({
          patchId: manifest.patchId,
          startedAt,
          commands,
          stoppedEarly,
          parsedTestTotals: null,
          expectedTestTotalsMatch: 'not-checked',
          worktree: { used: true, worktreeId: options.useOwnedWorktree.worktreeId },
          serverManaged: { used: Boolean(manifest.serverConfig), started: false },
          cleanup: { ok: true, worktreeRemoveResult: null, serverStopResult: null, errors: [] },
          evidenceBundlePath,
        }, startedMs);
      }
      worktreeHandle = created.handle;
      cwd = created.handle.path;
    }

    if (manifest.serverConfig) {
      if (!isRunnableServerConfig(manifest.serverConfig)) {
        const logPath = resolve(logDir, 'server-start.stderr.log');
        const message = 'manifest.serverConfig does not include command, args, cwd, and env required by startOwnedServer';
        await writeFile(logPath, message, 'utf8');
        commands.push(syntheticRecord('server-start', 'startOwnedServer', message, logPath));
        stoppedEarly = true;
        return await finalizeBundle({
          patchId: manifest.patchId,
          startedAt,
          commands,
          stoppedEarly,
          parsedTestTotals: null,
          expectedTestTotalsMatch: 'not-checked',
          worktree: { used: Boolean(options.useOwnedWorktree), worktreeId: options.useOwnedWorktree?.worktreeId ?? null },
          serverManaged: { used: true, started: false },
          cleanup: { ok: true, worktreeRemoveResult: null, serverStopResult: null, errors: [] },
          evidenceBundlePath,
        }, startedMs);
      }
      const started = await startOwnedServer({ ...manifest.serverConfig, cwd: isAbsolute(manifest.serverConfig.cwd) ? manifest.serverConfig.cwd : resolve(cwd, manifest.serverConfig.cwd) });
      serverStarted = started.ok && started.reason === 'started';
      if (!started.ok) {
        const logPath = resolve(logDir, 'server-start.stderr.log');
        await writeFile(logPath, JSON.stringify(started), 'utf8');
        commands.push(syntheticRecord('server-start', 'startOwnedServer', JSON.stringify(started), logPath));
        stoppedEarly = true;
        return await finalizeBundle({
          patchId: manifest.patchId,
          startedAt,
          commands,
          stoppedEarly,
          parsedTestTotals: null,
          expectedTestTotalsMatch: 'not-checked',
          worktree: { used: Boolean(options.useOwnedWorktree), worktreeId: options.useOwnedWorktree?.worktreeId ?? null },
          serverManaged: { used: true, started: serverStarted },
          cleanup: { ok: true, worktreeRemoveResult: null, serverStopResult: null, errors: [] },
          evidenceBundlePath,
        }, startedMs);
      }
      if (started.reason === 'started') serverHandle = started.handle;
    }

    for (let index = 0; index < manifest.requiredCommands.length; index += 1) {
      const required = manifest.requiredCommands[index];
      const label = required.label;
      const safeLabel = `${String(index + 1).padStart(2, '0')}-${sanitizeLabel(label)}`;
      const stdoutLogPath = resolve(logDir, `${safeLabel}.stdout.log`);
      const stderrLogPath = resolve(logDir, `${safeLabel}.stderr.log`);
      const commandStartedMs = Date.now();
      const commandStartedAt = nowIso();
      const result = await run(required.command, required.args, {
        cwd,
        timeoutMs,
        stdoutLogPath,
        stderrLogPath,
      });
      const commandFinishedAt = nowIso();
      const totalsPath = resolveOutputFile(required.args, cwd);
      const commandTotals = totalsPath ? await parseVitestTotals(totalsPath) : null;
      if (commandTotals) parsedTestTotals = commandTotals;
      const ok = result.exitCode === required.expectedExitCode && !result.timedOut;
      commands.push({
        label,
        command: required.command,
        args: [...required.args],
        exitCode: result.exitCode,
        expectedExitCode: required.expectedExitCode,
        ok,
        timedOut: result.timedOut,
        durationMs: Math.max(0, Date.now() - commandStartedMs),
        stdoutLogPath,
        stderrLogPath,
        parsedTestTotals: commandTotals,
        startedAt: commandStartedAt,
        finishedAt: commandFinishedAt,
      });
      if (!ok) {
        stoppedEarly = index < manifest.requiredCommands.length - 1;
        break;
      }
    }
  } finally {
    if (serverHandle) {
      serverStopResult = await stopOwnedServer(serverHandle, 5_000);
      if (!serverStopResult.ok) cleanupErrors.push(`server cleanup failed: ${serverStopResult.reason}`);
    }
    if (worktreeHandle) {
      worktreeRemoveResult = await removeWorktree(worktreeHandle, { repoRoot, metadataRoot: resolve(repoRoot, '.fable5/worktrees') });
      if (!worktreeRemoveResult.ok) cleanupErrors.push(`worktree cleanup failed: ${worktreeRemoveResult.reason}`);
    }
  }

  const expectedTestTotalsMatch = totalsMatch(manifest, parsedTestTotals);
  const cleanup: HarnessCleanupRecord = {
    ok: cleanupErrors.length === 0,
    worktreeRemoveResult: worktreeRemoveResult ? jsonClone(worktreeRemoveResult) : null,
    serverStopResult: serverStopResult ? jsonClone(serverStopResult) : null,
    errors: cleanupErrors,
  };

  return finalizeBundle({
    patchId: manifest.patchId,
    startedAt,
    commands,
    stoppedEarly,
    parsedTestTotals,
    expectedTestTotalsMatch,
    worktree: { used: Boolean(options.useOwnedWorktree), worktreeId: options.useOwnedWorktree?.worktreeId ?? null },
    serverManaged: { used: Boolean(manifest.serverConfig), started: serverStarted },
    cleanup,
    evidenceBundlePath,
  }, startedMs);
}
