import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PatchManifest } from './manifestSchema';
import type { OwnedServerHandle, OwnedWorktreeHandle, SpawnRunner } from './types';

const BASE = 'b'.repeat(40);
const roots: string[] = [];

const worktreeCalls: string[] = [];
const serverCalls: string[] = [];
let createWorktreeResult: unknown;
let removeWorktreeResult: unknown;
let startServerResult: unknown;
let stopServerResult: unknown;

vi.mock('./worktreeLifecycle', () => ({
  createWorktree: vi.fn(async () => {
    worktreeCalls.push('create');
    return createWorktreeResult;
  }),
  removeWorktree: vi.fn(async () => {
    worktreeCalls.push('remove');
    return removeWorktreeResult;
  }),
}));

vi.mock('./serverLifecycle', () => ({
  startOwnedServer: vi.fn(async () => {
    serverCalls.push('start');
    return startServerResult;
  }),
  stopOwnedServer: vi.fn(async () => {
    serverCalls.push('stop');
    return stopServerResult;
  }),
}));

async function importRunner() {
  return import('./testRunner');
}

function manifest(overrides: Partial<PatchManifest> = {}): PatchManifest {
  return {
    patchId: 'PATCH-108',
    baseCommit: BASE,
    allowedFiles: [],
    prohibitedFiles: [],
    allowedUntrackedFiles: [],
    generatedArtifactPaths: ['test-results', 'playwright-report', '.next/trace'],
    stashPolicy: 'must-be-empty',
    requiredCommands: [
      { label: 'one', command: process.execPath, args: ['-e', 'process.exit(0)'], expectedExitCode: 0 },
    ],
    exactCommitMessage: 'feat(harness): add manifest-driven test runner and evidence bundle (PATCH-108)',
    ...overrides,
  };
}

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'patch-108-unit-'));
  roots.push(root);
  return root;
}

function successfulRunner(calls: string[] = []): SpawnRunner {
  return async (command, args, options) => {
    calls.push(`${command} ${args.join(' ')}`);
    await writeFile(options.stdoutLogPath, `stdout:${args.join(' ')}`, 'utf8');
    await writeFile(options.stderrLogPath, `stderr:${args.join(' ')}`, 'utf8');
    return { exitCode: 0, timedOut: false };
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  worktreeCalls.splice(0);
  serverCalls.splice(0);
  createWorktreeResult = {
    ok: true,
    reason: 'created',
    handle: {
      worktreeId: 'unit-tree',
      path: resolve(tmpdir(), 'unit-tree'),
      branchName: 'harness/worktree/unit-tree',
      baseCommit: BASE,
      createdAt: new Date().toISOString(),
      ownedByHarness: true,
      allocatedPorts: [],
      metadataPath: resolve(tmpdir(), 'unit-tree.meta.json'),
    } satisfies OwnedWorktreeHandle,
  };
  removeWorktreeResult = { ok: true, reason: 'removed' };
  startServerResult = {
    ok: true,
    reason: 'started',
    handle: {
      pid: 12345,
      ownedByHarness: true,
      startedAt: new Date().toISOString(),
      stdoutLogPath: 'server.stdout.log',
      stderrLogPath: 'server.stderr.log',
    } satisfies OwnedServerHandle,
  };
  stopServerResult = { ok: true, reason: 'stopped', portFreeAfterStop: true };
});

describe('test runner', () => {
  it('runs all commands sequentially and reports success', async () => {
    const root = await fixture();
    const calls: string[] = [];
    const { runManifestCommands } = await importRunner();
    const bundle = await runManifestCommands(manifest({
      requiredCommands: [
        { label: 'first', command: 'node', args: ['first'], expectedExitCode: 0 },
        { label: 'second', command: 'node', args: ['second'], expectedExitCode: 0 },
      ],
    }), { repoRoot: root, logDir: join(root, '.fable5/evidence/unit'), spawnRunner: successfulRunner(calls) });
    expect(bundle).toMatchObject({ ok: true, stoppedEarly: false });
    expect(bundle.commands.map((command) => command.label)).toEqual(['first', 'second']);
    expect(calls).toEqual(['node first', 'node second']);
  });

  it('stops on the first mismatched expected exit code', async () => {
    const root = await fixture();
    const calls: string[] = [];
    const { runManifestCommands } = await importRunner();
    const bundle = await runManifestCommands(manifest({
      requiredCommands: [
        { label: 'first', command: 'node', args: ['first'], expectedExitCode: 0 },
        { label: 'fail', command: 'node', args: ['fail'], expectedExitCode: 0 },
        { label: 'never', command: 'node', args: ['never'], expectedExitCode: 0 },
      ],
    }), {
      repoRoot: root,
      logDir: join(root, '.fable5/evidence/unit'),
      spawnRunner: async (command, args, options) => {
        calls.push(args[0]);
        await writeFile(options.stdoutLogPath, '', 'utf8');
        await writeFile(options.stderrLogPath, '', 'utf8');
        return { exitCode: args[0] === 'fail' ? 1 : 0, timedOut: false };
      },
    });
    expect(bundle.ok).toBe(false);
    expect(bundle.stoppedEarly).toBe(true);
    expect(bundle.commands.map((command) => command.label)).toEqual(['first', 'fail']);
    expect(calls).toEqual(['first', 'fail']);
  });

  it('extracts Vitest JSON totals when reporter and output file are governed', async () => {
    const root = await fixture();
    const reportPath = join(root, 'vitest.json');
    const { runManifestCommands } = await importRunner();
    const bundle = await runManifestCommands(manifest({
      requiredCommands: [{ label: 'vitest', command: 'npx', args: ['vitest', 'run', '--reporter=json', `--outputFile=${reportPath}`], expectedExitCode: 0 }],
      expectedTestTotals: { unit: { tests: 7, files: 2 } },
    }), {
      repoRoot: root,
      logDir: join(root, '.fable5/evidence/unit'),
      spawnRunner: async (_command, _args, options) => {
        await writeFile(reportPath, JSON.stringify({ numTotalTests: 7, numTotalTestSuites: 2, numPassedTests: 7, numFailedTests: 0, numPendingTests: 0 }), 'utf8');
        await writeFile(options.stdoutLogPath, '', 'utf8');
        await writeFile(options.stderrLogPath, '', 'utf8');
        return { exitCode: 0, timedOut: false };
      },
    });
    expect(bundle.parsedTestTotals).toMatchObject({ tests: 7, files: 2, passed: 7, failed: 0, skipped: 0 });
    expect(bundle.expectedTestTotalsMatch).toBe(true);
  });

  it('leaves parsed totals null when no command declares Vitest JSON output', async () => {
    const root = await fixture();
    const { runManifestCommands } = await importRunner();
    const bundle = await runManifestCommands(manifest(), { repoRoot: root, logDir: join(root, '.fable5/evidence/unit'), spawnRunner: successfulRunner() });
    expect(bundle.parsedTestTotals).toBeNull();
  });

  it('marks expected totals not checked when the manifest has no expected unit totals', async () => {
    const root = await fixture();
    const { runManifestCommands } = await importRunner();
    const bundle = await runManifestCommands(manifest({ expectedTestTotals: undefined }), { repoRoot: root, logDir: join(root, '.fable5/evidence/unit'), spawnRunner: successfulRunner() });
    expect(bundle.expectedTestTotalsMatch).toBe('not-checked');
  });

  it('creates and removes an owned worktree, including command failure cleanup', async () => {
    const root = await fixture();
    removeWorktreeResult = { ok: false, reason: 'dirty-refused' };
    const { runManifestCommands } = await importRunner();
    const bundle = await runManifestCommands(manifest(), {
      repoRoot: root,
      logDir: join(root, '.fable5/evidence/unit'),
      useOwnedWorktree: { worktreeId: 'unit-tree' },
      spawnRunner: async (_command, _args, options) => {
        await writeFile(options.stdoutLogPath, '', 'utf8');
        await writeFile(options.stderrLogPath, '', 'utf8');
        return { exitCode: 1, timedOut: false };
      },
    });
    expect(bundle.ok).toBe(false);
    expect(worktreeCalls).toEqual(['create', 'remove']);
    expect(bundle.cleanup.worktreeRemoveResult).toEqual({ ok: false, reason: 'dirty-refused' });
    expect(bundle.cleanup.errors).toEqual(['worktree cleanup failed: dirty-refused']);
  });

  it('reports worktree creation failure without attempting cleanup', async () => {
    const root = await fixture();
    createWorktreeResult = { ok: false, reason: 'path-collision', path: 'collision' };
    const { runManifestCommands } = await importRunner();
    const bundle = await runManifestCommands(manifest(), { repoRoot: root, logDir: join(root, '.fable5/evidence/unit'), useOwnedWorktree: { worktreeId: 'unit-tree' }, spawnRunner: successfulRunner() });
    expect(bundle.ok).toBe(false);
    expect(bundle.commands).toHaveLength(1);
    expect(worktreeCalls).toEqual(['create']);
  });

  it('starts and stops an owned server even when a command fails', async () => {
    const root = await fixture();
    const { runManifestCommands } = await importRunner();
    const bundle = await runManifestCommands(manifest({
      serverConfig: { command: process.execPath, args: ['-e', ''], cwd: '.', env: {}, readinessUrl: 'http://127.0.0.1:1', readinessTimeoutMs: 1, pollIntervalMs: 1 } as PatchManifest['serverConfig'],
    }), {
      repoRoot: root,
      logDir: join(root, '.fable5/evidence/unit'),
      spawnRunner: async (_command, _args, options) => {
        await writeFile(options.stdoutLogPath, '', 'utf8');
        await writeFile(options.stderrLogPath, '', 'utf8');
        return { exitCode: 1, timedOut: false };
      },
    });
    expect(bundle.ok).toBe(false);
    expect(serverCalls).toEqual(['start', 'stop']);
    expect(bundle.serverManaged).toEqual({ used: true, started: true });
  });

  it('does not call lifecycle modules when no server or worktree is requested', async () => {
    const root = await fixture();
    const { runManifestCommands } = await importRunner();
    await runManifestCommands(manifest(), { repoRoot: root, logDir: join(root, '.fable5/evidence/unit'), spawnRunner: successfulRunner() });
    expect(worktreeCalls).toEqual([]);
    expect(serverCalls).toEqual([]);
  });

  it('reports timeout status and non-negative durations', async () => {
    const root = await fixture();
    const { runManifestCommands } = await importRunner();
    const bundle = await runManifestCommands(manifest(), {
      repoRoot: root,
      logDir: join(root, '.fable5/evidence/unit'),
      spawnRunner: async (_command, _args, options) => {
        await writeFile(options.stdoutLogPath, '', 'utf8');
        await writeFile(options.stderrLogPath, '', 'utf8');
        return { exitCode: 1, timedOut: true };
      },
    });
    expect(bundle.commands[0].timedOut).toBe(true);
    expect(bundle.commands[0].durationMs).toBeGreaterThanOrEqual(0);
    expect(Date.parse(bundle.commands[0].finishedAt)).toBeGreaterThanOrEqual(Date.parse(bundle.commands[0].startedAt));
  });

  it('writes stdout and stderr logs and a JSON-serializable bundle with exact shape', async () => {
    const root = await fixture();
    const { runManifestCommands } = await importRunner();
    const bundle = await runManifestCommands(manifest(), { repoRoot: root, logDir: join(root, '.fable5/evidence/unit'), spawnRunner: successfulRunner() });
    expect(await readFile(bundle.commands[0].stdoutLogPath, 'utf8')).toContain('stdout');
    expect(await readFile(bundle.commands[0].stderrLogPath, 'utf8')).toContain('stderr');
    expect(JSON.parse(JSON.stringify(bundle))).toEqual(bundle);
    expect(Object.keys(bundle).sort()).toEqual(['cleanup', 'commands', 'evidenceBundlePath', 'expectedTestTotalsMatch', 'finishedAt', 'ok', 'parsedTestTotals', 'patchId', 'serverManaged', 'startedAt', 'stoppedEarly', 'totalDurationMs', 'worktree']);
  });

  it('keeps malformed Vitest totals explicit without crashing or marking expected totals acceptable', async () => {
    const root = await fixture();
    const reportPath = join(root, 'vitest.json');
    const { runManifestCommands } = await importRunner();
    const bundle = await runManifestCommands(manifest({
      requiredCommands: [{ label: 'vitest', command: 'npx', args: ['vitest', 'run', '--reporter=json', `--outputFile=${reportPath}`], expectedExitCode: 0 }],
      expectedTestTotals: { unit: { tests: 1, files: 1 } },
    }), {
      repoRoot: root,
      logDir: join(root, '.fable5/evidence/unit'),
      spawnRunner: async (_command, _args, options) => {
        await writeFile(reportPath, '{bad-json', 'utf8');
        await writeFile(options.stdoutLogPath, '', 'utf8');
        await writeFile(options.stderrLogPath, '', 'utf8');
        return { exitCode: 0, timedOut: false };
      },
    });
    expect(bundle.parsedTestTotals?.parseError).toBeTruthy();
    expect(bundle.expectedTestTotalsMatch).toBe(false);
    expect(bundle.ok).toBe(false);
  });
});
