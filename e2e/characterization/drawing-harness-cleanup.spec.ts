import { test, expect } from '@playwright/test';
import { spawn, spawnSync } from 'child_process';
import fsp from 'fs/promises';
import path from 'path';
import { hasE2ECredentials } from '../helpers/env';
import {
  DRAWING_HARNESS_PREFIX,
  assertDrawingFixtureCleanup,
  cleanupDrawingFixture,
  createHarnessClient,
  type CleanupCounts,
  type DrawingFixture,
} from './drawingBridgeHarness';

const SCENARIO_TIMEOUT_MS = 1_200;
const CHILD_BLOCK_MS = 60_000;
const CHILD_LABEL_PREFIX = 'patch-074-cleanup';
const EXACT_CLASSIFICATION = 'aftereach-sufficient-for-timeout-not-interruption' as const;

type ScenarioName = 'normal-pass' | 'assertion-failure' | 'test-timeout' | 'hard-kill';
type CleanupOwner =
  | 'afterEach'
  | 'afterEach-plus-parent-sweep'
  | 'interrupted-before-afterEach'
  | 'unexpected';

type ChildEvent = {
  kind: string;
  at: string;
  payload?: Record<string, unknown>;
};

type ChildRunResult = {
  scenario: ScenarioName;
  status: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  combinedOutput: string;
  prefix: string;
  fixture: DrawingFixture;
  events: ChildEvent[];
};

type ScenarioAnnotation = {
  scenario: ScenarioName;
  childExitStatus: number | null;
  childSignal: string | null;
  expectedFailureType: 'none' | 'assertion' | 'timeout' | 'process-killed';
  observedCleanupOwner: CleanupOwner;
  boardCountImmediatelyAfter: number;
  padletCountImmediatelyAfter: number;
  canvasLineCountImmediatelyAfter: number;
  workerSurvived: boolean;
  hooksRan: {
    finallyStarted: boolean;
    finallyCompleted: boolean;
    afterEachStarted: boolean;
    afterEachCompleted: boolean;
  };
  parentSweepNeeded: boolean;
  finalCountsAfterParentSweep: CleanupCounts;
};

type ScenarioPrefixes = {
  'normal-pass': string;
  'assertion-failure': string;
  'test-timeout': string;
  'hard-kill': string;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function childSpecSource(): string {
  return `
import { test, expect } from '@playwright/test';
import fs from 'fs';
import {
  assertDrawingFixtureCleanup,
  createDisposableDrawingBoard,
  registerDrawingCleanup,
  seedAttachedCanvasLines,
  seedDrawingContainers,
  seedLineScene,
} from '../drawingBridgeHarness';

const scenario = process.env.PATCH_074_SCENARIO;
const prefixFile = process.env.PATCH_074_PREFIX_FILE;
const fixtureFile = process.env.PATCH_074_FIXTURE_FILE;
const eventsFile = process.env.PATCH_074_EVENTS_FILE;
const blockMs = Number(process.env.PATCH_074_BLOCK_MS ?? '60000');
let cleanupContext = null;

function record(kind, payload) {
  if (!eventsFile) {
    throw new Error('Missing PATCH_074_EVENTS_FILE');
  }
  fs.appendFileSync(eventsFile, JSON.stringify({
    kind,
    at: new Date().toISOString(),
    payload: payload ?? undefined,
  }) + '\\n');
}

registerDrawingCleanup(test);

test.afterEach(async ({}, testInfo) => {
  record('afterEach:start', { status: testInfo.status, expectedStatus: testInfo.expectedStatus });
  if (!cleanupContext) {
    record('afterEach:skipped');
    return;
  }
  const counts = await assertDrawingFixtureCleanup(cleanupContext.supabase, cleanupContext.fixture);
  record('afterEach:complete', { ...counts, status: testInfo.status, expectedStatus: testInfo.expectedStatus });
});

test('child cleanup ownership scenario', async () => {
  if (!scenario) throw new Error('Missing PATCH_074_SCENARIO');
  if (!prefixFile) throw new Error('Missing PATCH_074_PREFIX_FILE');
  if (!fixtureFile) throw new Error('Missing PATCH_074_FIXTURE_FILE');

  if (scenario === 'assertion-failure') {
    test.fail(true, 'Intentional assertion failure for PATCH-074 characterization');
  }
  if (scenario === 'test-timeout') {
    test.setTimeout(${SCENARIO_TIMEOUT_MS});
    test.fail(true, 'Intentional timeout for PATCH-074 characterization');
  }

  record('test:start', { scenario });
  const { supabase, fixture } = await createDisposableDrawingBoard('${CHILD_LABEL_PREFIX}-' + scenario);
  record('fixture:created', { prefix: fixture.prefix, boardId: fixture.boardId });
  fs.writeFileSync(prefixFile, fixture.prefix, 'utf8');
  await seedDrawingContainers(supabase, fixture);
  await seedAttachedCanvasLines(supabase, fixture);
  await seedLineScene(supabase, fixture);
  cleanupContext = { supabase, fixture };
  fs.writeFileSync(fixtureFile, JSON.stringify(fixture), 'utf8');
  record('fixture:ready', {
    prefix: fixture.prefix,
    boardId: fixture.boardId,
    padletsTracked: fixture.containerIds.length + fixture.childIds.length + (fixture.masterPadletId ? 1 : 0),
    lineIds: fixture.lineIds.length,
  });

  try {
    record('body:try');
    if (scenario === 'normal-pass') {
      expect(fixture.lineIds.length).toBeGreaterThan(0);
      return;
    }
    if (scenario === 'assertion-failure') {
      record('body:assertion-arm');
      expect(fixture.containerIds.length).toBe(999);
      return;
    }
    if (scenario === 'test-timeout') {
      record('body:timeout-arm');
      record('body:blocking', { ms: ${SCENARIO_TIMEOUT_MS} * 4 });
      await new Promise((resolve) => setTimeout(resolve, ${SCENARIO_TIMEOUT_MS} * 4));
      return;
    }
    if (scenario === 'hard-kill') {
      record('body:blocking', { ms: blockMs });
      await new Promise((resolve) => setTimeout(resolve, blockMs));
      return;
    }
    throw new Error('Unknown scenario: ' + scenario);
  } finally {
    record('finally:start');
    record('finally:complete');
  }
});
`;
}

async function readJsonLines(filePath: string): Promise<ChildEvent[]> {
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ChildEvent);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function waitForFile(filePath: string, timeoutMs: number): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const value = await fsp.readFile(filePath, 'utf8');
      if (value.trim()) {
        return value.trim();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for file: ${filePath}`);
}

async function waitForEvent(filePath: string, kind: string, timeoutMs: number): Promise<ChildEvent> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const events = await readJsonLines(filePath);
    const event = events.find((entry) => entry.kind === kind);
    if (event) {
      return event;
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for event "${kind}" in ${filePath}`);
}

async function waitForExit(
  child: ReturnType<typeof spawn>,
): Promise<{ status: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }> {
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  child.stdout?.on('data', (chunk) => stdoutChunks.push(String(chunk)));
  child.stderr?.on('data', (chunk) => stderrChunks.push(String(chunk)));

  return await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (status, signal) => {
      resolve({
        status,
        signal,
        stdout: stdoutChunks.join(''),
        stderr: stderrChunks.join(''),
      });
    });
  });
}

function spawnChildScenario(
  tempSpecPath: string,
  scenario: ScenarioName,
  prefixFile: string,
  fixtureFile: string,
  eventsFile: string,
) {
  const normalizedSpecPath = tempSpecPath.replace(/\\/g, '/');
  const command = [
    'npx.cmd',
    'playwright',
    'test',
    normalizedSpecPath,
    '--config=playwright.config.ts',
    '--project=characterization',
    '--workers=1',
    '--reporter=line',
    '--no-deps',
  ].join(' ');

  return spawn(
    process.env.ComSpec ?? 'cmd.exe',
    ['/d', '/s', '/c', command],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        PW_BASE_URL: 'http://127.0.0.1:3000',
        PATCH_074_SCENARIO: scenario,
        PATCH_074_PREFIX_FILE: prefixFile,
        PATCH_074_FIXTURE_FILE: fixtureFile,
        PATCH_074_EVENTS_FILE: eventsFile,
        PATCH_074_BLOCK_MS: String(CHILD_BLOCK_MS),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
}

async function runChildScenario(tempSpecPath: string, scenario: ScenarioName): Promise<ChildRunResult> {
  const tempRoot = await fsp.mkdtemp(path.join(process.cwd(), 'e2e', 'characterization', '.patch-074-run-'));
  const prefixFile = path.join(tempRoot, `${scenario}-prefix.txt`);
  const fixtureFile = path.join(tempRoot, `${scenario}-fixture.json`);
  const eventsFile = path.join(tempRoot, `${scenario}-events.jsonl`);
  let keepTempRoot = false;

  try {
    const child = spawnChildScenario(tempSpecPath, scenario, prefixFile, fixtureFile, eventsFile);

    if (scenario === 'hard-kill') {
      await waitForFile(prefixFile, 45_000);
      await waitForFile(fixtureFile, 45_000);
      await waitForEvent(eventsFile, 'body:blocking', 45_000);
      const kill = spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        cwd: process.cwd(),
        encoding: 'utf8',
      });
      expect(kill.status).toBe(0);
    }

    const exited = await waitForExit(child);
    const events = await readJsonLines(eventsFile);
    let prefix: string;
    let fixture: DrawingFixture;

    try {
      prefix = await waitForFile(prefixFile, 10_000);
      fixture = JSON.parse(await waitForFile(fixtureFile, 10_000)) as DrawingFixture;
    } catch (error) {
      keepTempRoot = true;
      throw new Error(
        [
          `Child scenario "${scenario}" did not produce its marker files.`,
          `status=${String(exited.status)} signal=${String(exited.signal)}`,
          `tempRoot=${tempRoot}`,
          'stdout:',
          exited.stdout || '<empty>',
          'stderr:',
          exited.stderr || '<empty>',
          'events:',
          JSON.stringify(events, null, 2),
          `originalError=${error instanceof Error ? error.message : String(error)}`,
        ].join('\n'),
      );
    }

    return {
      scenario,
      status: exited.status,
      signal: exited.signal,
      stdout: exited.stdout,
      stderr: exited.stderr,
      combinedOutput: `${exited.stdout}\n${exited.stderr}`,
      prefix,
      fixture,
      events,
    };
  } finally {
    if (!keepTempRoot) {
      await fsp.rm(tempRoot, { recursive: true, force: true });
    }
  }
}

async function probeCleanupCounts(fixture: DrawingFixture): Promise<CleanupCounts> {
  const supabase = await createHarnessClient();
  try {
    const [boardsResult, padletsResult, linesResult] = await Promise.all([
      supabase.from('boards').select('id').eq('id', fixture.boardId),
      supabase.from('padlets').select('id').eq('board_id', fixture.boardId),
      fixture.lineIds.length > 0
        ? supabase.from('canvas_lines').select('id').in('id', fixture.lineIds)
        : supabase.from('canvas_lines').select('id').eq('board_id', fixture.boardId),
    ]);

    if (boardsResult.error) throw boardsResult.error;
    if (padletsResult.error) throw padletsResult.error;
    if (linesResult.error) throw linesResult.error;

    return {
      boards: boardsResult.data.length,
      padlets: padletsResult.data.length,
      canvasLines: linesResult.data.length,
    };
  } finally {
    await supabase.auth.signOut();
  }
}

function hasEvent(events: ChildEvent[], kind: string): boolean {
  return events.some((event) => event.kind === kind);
}

function getEvent(events: ChildEvent[], kind: string): ChildEvent | undefined {
  return events.find((event) => event.kind === kind);
}

function getScenarioAnnotation(scenarios: ScenarioAnnotation[], scenario: ScenarioName): ScenarioAnnotation {
  const result = scenarios.find((entry) => entry.scenario === scenario);
  expect(result, `Missing scenario annotation for ${scenario}`).toBeDefined();
  return result!;
}

function classifyScenario(result: ChildRunResult, immediateCounts: CleanupCounts): ScenarioAnnotation {
  const hooksRan = {
    finallyStarted: hasEvent(result.events, 'finally:start'),
    finallyCompleted: hasEvent(result.events, 'finally:complete'),
    afterEachStarted: hasEvent(result.events, 'afterEach:start'),
    afterEachCompleted: hasEvent(result.events, 'afterEach:complete'),
  };
  const zeroCounts = immediateCounts.boards === 0 && immediateCounts.padlets === 0 && immediateCounts.canvasLines === 0;
  const parentSweepNeeded = !zeroCounts;

  let observedCleanupOwner: CleanupOwner = 'unexpected';
  if (hooksRan.afterEachCompleted && zeroCounts) {
    observedCleanupOwner = 'afterEach';
  } else if (!hooksRan.afterEachStarted && parentSweepNeeded) {
    observedCleanupOwner = 'interrupted-before-afterEach';
  } else if (!hooksRan.afterEachCompleted && parentSweepNeeded) {
    observedCleanupOwner = 'afterEach-plus-parent-sweep';
  }

  return {
    scenario: result.scenario,
    childExitStatus: result.status,
    childSignal: result.signal,
    expectedFailureType:
      result.scenario === 'normal-pass'
        ? 'none'
        : result.scenario === 'assertion-failure'
          ? 'assertion'
          : result.scenario === 'test-timeout'
            ? 'timeout'
            : 'process-killed',
    observedCleanupOwner,
    boardCountImmediatelyAfter: immediateCounts.boards,
    padletCountImmediatelyAfter: immediateCounts.padlets,
    canvasLineCountImmediatelyAfter: immediateCounts.canvasLines,
    workerSurvived: result.scenario === 'hard-kill' ? false : true,
    hooksRan,
    parentSweepNeeded,
    finalCountsAfterParentSweep: immediateCounts,
  };
}

function determineClassification(scenarios: ScenarioAnnotation[]): typeof EXACT_CLASSIFICATION | 'aftereach-insufficient-for-timeout' | 'global-owner-already-sufficient' | 'unexpected-result-needs-amendment' {
  const timeoutScenario = scenarios.find((scenario) => scenario.scenario === 'test-timeout');
  const hardKillScenario = scenarios.find((scenario) => scenario.scenario === 'hard-kill');

  if (!timeoutScenario || !hardKillScenario) {
    return 'unexpected-result-needs-amendment';
  }

  const timeoutAfterEachWorked =
    timeoutScenario.hooksRan.afterEachCompleted &&
    timeoutScenario.boardCountImmediatelyAfter === 0 &&
    timeoutScenario.padletCountImmediatelyAfter === 0 &&
    timeoutScenario.canvasLineCountImmediatelyAfter === 0;

  if (!timeoutAfterEachWorked) {
    return 'aftereach-insufficient-for-timeout';
  }

  const hardKillAlreadyClean =
    hardKillScenario.boardCountImmediatelyAfter === 0 &&
    hardKillScenario.padletCountImmediatelyAfter === 0 &&
    hardKillScenario.canvasLineCountImmediatelyAfter === 0;

  if (hardKillAlreadyClean) {
    return 'global-owner-already-sufficient';
  }

  const hardKillNeedsParentSweep =
    !hardKillScenario.hooksRan.afterEachStarted &&
    hardKillScenario.parentSweepNeeded;

  if (hardKillNeedsParentSweep) {
    return EXACT_CLASSIFICATION;
  }

  return 'unexpected-result-needs-amendment';
}

test.describe('PATCH-074 drawing harness cleanup ownership characterization', () => {
  test.describe.configure({ mode: 'serial' });

  test('diagnoses timeout-safe cleanup ownership without modifying the harness', async () => {
    test.setTimeout(240_000);
    test.skip(!hasE2ECredentials, 'PATCH-074 requires E2E credentials');

    const tempSpecDir = path.join(process.cwd(), 'e2e', 'characterization', '.patch-074-temp');
    const tempSpecPath = path.join(tempSpecDir, 'drawing-harness-cleanup-child.spec.ts');
    const scenarioResults: ScenarioAnnotation[] = [];
    const scenarioPrefixes: Partial<ScenarioPrefixes> = {};

    await fsp.mkdir(tempSpecDir, { recursive: true });
    await fsp.writeFile(tempSpecPath, childSpecSource(), 'utf8');

    try {
      const normalPass = await runChildScenario(tempSpecPath, 'normal-pass');
      scenarioPrefixes['normal-pass'] = normalPass.prefix;
      expect(normalPass.status).toBe(0);
      expect(normalPass.combinedOutput).toContain('1 passed');
      let immediateCounts = await probeCleanupCounts(normalPass.fixture);
      expect(immediateCounts).toEqual({ boards: 0, padlets: 0, canvasLines: 0 });
      scenarioResults.push(classifyScenario(normalPass, immediateCounts));

      const assertionFailure = await runChildScenario(tempSpecPath, 'assertion-failure');
      scenarioPrefixes['assertion-failure'] = assertionFailure.prefix;
      expect(assertionFailure.status).toBe(0);
      expect(hasEvent(assertionFailure.events, 'body:assertion-arm')).toBe(true);
      expect(getEvent(assertionFailure.events, 'afterEach:start')?.payload).toMatchObject({
        status: 'failed',
        expectedStatus: 'failed',
      });
      immediateCounts = await probeCleanupCounts(assertionFailure.fixture);
      expect(immediateCounts).toEqual({ boards: 0, padlets: 0, canvasLines: 0 });
      scenarioResults.push(classifyScenario(assertionFailure, immediateCounts));

      const timeoutFailure = await runChildScenario(tempSpecPath, 'test-timeout');
      scenarioPrefixes['test-timeout'] = timeoutFailure.prefix;
      expect(hasEvent(timeoutFailure.events, 'body:timeout-arm')).toBe(true);
      expect(getEvent(timeoutFailure.events, 'afterEach:start')?.payload).toMatchObject({
        status: 'timedOut',
        expectedStatus: 'failed',
      });
      immediateCounts = await probeCleanupCounts(timeoutFailure.fixture);
      expect(immediateCounts).toEqual({ boards: 0, padlets: 0, canvasLines: 0 });
      scenarioResults.push(classifyScenario(timeoutFailure, immediateCounts));

      const hardKill = await runChildScenario(tempSpecPath, 'hard-kill');
      scenarioPrefixes['hard-kill'] = hardKill.prefix;
      immediateCounts = await probeCleanupCounts(hardKill.fixture);
      const hardKillScenario = classifyScenario(hardKill, immediateCounts);
      expect(hardKillScenario.parentSweepNeeded).toBe(true);
      const parentSweepClient = await createHarnessClient();
      try {
        await cleanupDrawingFixture(parentSweepClient, hardKill.fixture);
        hardKillScenario.finalCountsAfterParentSweep = await assertDrawingFixtureCleanup(parentSweepClient, hardKill.fixture);
      } finally {
        await parentSweepClient.auth.signOut();
      }
      scenarioResults.push(hardKillScenario);

      const exactClassification = determineClassification(scenarioResults);
      expect(exactClassification).toBe(EXACT_CLASSIFICATION);

      const passRun = getScenarioAnnotation(scenarioResults, 'normal-pass');
      const assertionFailureRun = getScenarioAnnotation(scenarioResults, 'assertion-failure');
      const timeoutRun = getScenarioAnnotation(scenarioResults, 'test-timeout');
      const killedRun = getScenarioAnnotation(scenarioResults, 'hard-kill');
      const prefixes: ScenarioPrefixes = {
        'normal-pass': scenarioPrefixes['normal-pass']!,
        'assertion-failure': scenarioPrefixes['assertion-failure']!,
        'test-timeout': scenarioPrefixes['test-timeout']!,
        'hard-kill': scenarioPrefixes['hard-kill']!,
      };
      const afterEachCoversPass = passRun.hooksRan.afterEachCompleted && passRun.boardCountImmediatelyAfter === 0 && passRun.padletCountImmediatelyAfter === 0 && passRun.canvasLineCountImmediatelyAfter === 0;
      const afterEachCoversAssertionFailure =
        assertionFailureRun.hooksRan.afterEachCompleted &&
        assertionFailureRun.boardCountImmediatelyAfter === 0 &&
        assertionFailureRun.padletCountImmediatelyAfter === 0 &&
        assertionFailureRun.canvasLineCountImmediatelyAfter === 0;
      const afterEachCoversTestTimeout =
        timeoutRun.hooksRan.afterEachCompleted &&
        timeoutRun.boardCountImmediatelyAfter === 0 &&
        timeoutRun.padletCountImmediatelyAfter === 0 &&
        timeoutRun.canvasLineCountImmediatelyAfter === 0;
      const hardKillBypassesInProcessCleanup =
        !killedRun.hooksRan.finallyStarted &&
        !killedRun.hooksRan.afterEachStarted &&
        killedRun.boardCountImmediatelyAfter === 1 &&
        killedRun.padletCountImmediatelyAfter === 7 &&
        killedRun.canvasLineCountImmediatelyAfter === 3;
      const recommendedOwner = 'parent-owned interruption fallback wrapper around child afterEach cleanup';
      const recommendedBoundary =
        'Use child in-process test.afterEach cleanup for normal completion, expected assertion failure, and ordinary Playwright timeout; use a parent-owned prefix-scoped cleanup boundary when the child cmd/Playwright worker subtree is killed before in-process hooks run.';

      expect(prefixes['normal-pass']).toContain(`${DRAWING_HARNESS_PREFIX}${CHILD_LABEL_PREFIX}-normal-pass-`);
      expect(prefixes['assertion-failure']).toContain(`${DRAWING_HARNESS_PREFIX}${CHILD_LABEL_PREFIX}-assertion-failure-`);
      expect(prefixes['test-timeout']).toContain(`${DRAWING_HARNESS_PREFIX}${CHILD_LABEL_PREFIX}-test-timeout-`);
      expect(prefixes['hard-kill']).toContain(`${DRAWING_HARNESS_PREFIX}${CHILD_LABEL_PREFIX}-hard-kill-`);
      expect(afterEachCoversPass).toBe(true);
      expect(afterEachCoversAssertionFailure).toBe(true);
      expect(afterEachCoversTestTimeout).toBe(true);
      expect(hardKillBypassesInProcessCleanup).toBe(true);

      test.info().annotations.push({
        type: 'patch-074-harness-cleanup-ownership',
        description: JSON.stringify({
          passRun,
          assertionFailureRun,
          timeoutRun,
          killedRun,
          afterEachCoversPass,
          afterEachCoversAssertionFailure,
          afterEachCoversTestTimeout,
          hardKillBypassesInProcessCleanup,
          recommendedOwner,
          recommendedBoundary,
          prefixes,
          implementationBase: '2b73c63e37d3dc76f9512652d6ec2897ba59959e',
          testedPrefix: DRAWING_HARNESS_PREFIX,
          testedScenarios: scenarioResults.map((scenario) => scenario.scenario),
          perScenario: scenarioResults,
          currentOwnershipSummary: {
            drawingPresentation: 'in-test-finally',
            drawingLineBridge: 'in-test-finally',
            drawingDuplication: 'in-test-finally',
            playwrightGlobalTeardown: 'absent',
            afterEachOwnerInExistingDrawingSpecs: 'absent',
          },
          uncoveredFailureModes: ['OS crash during parent sweep', 'database outage during cleanup'],
          userDataProtection: { prefixScoped: true },
          broadDeleteUsed: false,
          cleanupOwnerImplemented: 'shared-registered-afterEach',
          productionChanged: false,
          harnessChanged: false,
          configChanged: false,
          recommendedStage1Owner: recommendedOwner,
          stage1Status: 'implemented',
          exactClassification,
        }),
      });
    } finally {
      await fsp.rm(tempSpecDir, { recursive: true, force: true });
    }
  });
});
