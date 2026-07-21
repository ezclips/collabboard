import { spawn } from 'node:child_process';
import process from 'node:process';

const CARRIED_SPECS = [
  'e2e/characterization/drawing-duplicate-deep-clone.spec.ts',
  'e2e/characterization/drawing-duplicate-persistence.spec.ts',
  'e2e/characterization/drawing-save-wire.spec.ts',
  'e2e/characterization/drawing-save-supersession.spec.ts',
  'e2e/characterization/drawing-duplicate-divergence.spec.ts',
  'e2e/characterization/drawing-duplicate-clone-shape.spec.ts',
  'e2e/characterization/drawing-slide-add-dup-persistence.spec.ts',
  'e2e/characterization/drawing-slide-rename-state.spec.ts',
  'e2e/characterization/drawing-slide-duplication.spec.ts',
  'e2e/characterization/presentation-menu-pointer.spec.ts',
  'e2e/characterization/drawing-harness-cleanup.spec.ts',
  'e2e/characterization/drawing-presentation.spec.ts',
  'e2e/characterization/drawing-duplication.spec.ts',
  'e2e/characterization/drawing-line-bridge.spec.ts',
];

const GROUPS = [
  {
    name: 'group-1-deep-clone',
    specs: ['e2e/characterization/drawing-duplicate-deep-clone.spec.ts'],
  },
  {
    name: 'group-2-duplicate-persistence',
    specs: ['e2e/characterization/drawing-duplicate-persistence.spec.ts'],
  },
  {
    name: 'group-3-save-wire',
    specs: ['e2e/characterization/drawing-save-wire.spec.ts'],
  },
  {
    name: 'group-4-save-supersession',
    specs: ['e2e/characterization/drawing-save-supersession.spec.ts'],
  },
  {
    name: 'group-5-duplicate-divergence',
    specs: ['e2e/characterization/drawing-duplicate-divergence.spec.ts'],
  },
  {
    name: 'group-6-duplicate-clone-shape',
    specs: ['e2e/characterization/drawing-duplicate-clone-shape.spec.ts'],
  },
  {
    name: 'group-7-slide-add-dup-persistence',
    specs: ['e2e/characterization/drawing-slide-add-dup-persistence.spec.ts'],
  },
  {
    name: 'group-8-slide-rename-state',
    specs: ['e2e/characterization/drawing-slide-rename-state.spec.ts'],
  },
  {
    name: 'group-9-slide-duplication',
    specs: ['e2e/characterization/drawing-slide-duplication.spec.ts'],
  },
  {
    name: 'group-10-presentation-menu-pointer',
    specs: ['e2e/characterization/presentation-menu-pointer.spec.ts'],
  },
  {
    name: 'group-11-harness-cleanup',
    specs: ['e2e/characterization/drawing-harness-cleanup.spec.ts'],
  },
  {
    name: 'group-12-drawing-presentation',
    specs: ['e2e/characterization/drawing-presentation.spec.ts'],
  },
  {
    name: 'group-13-drawing-duplication',
    specs: ['e2e/characterization/drawing-duplication.spec.ts'],
  },
  {
    name: 'group-14-line-bridge',
    specs: ['e2e/characterization/drawing-line-bridge.spec.ts'],
  },
];

const AUTH_EXPIRY_SIGNATURE = {
  timeout: /TimeoutError|Timeout \d+ms exceeded/i,
  locatorWait: /locator\.waitFor|waiting for/i,
  backToDashboard: /getByTitle\('Back to Dashboard'\)/,
  harness: /drawingBridgeHarness\.ts|openDrawingBoard/,
};

const SETUP_CLOSE_SIGNATURE = {
  setupProject: /\[setup\].*auth\.setup\.ts/i,
  targetClosed: /Target page, context or browser has been closed/i,
  characterizationProject: /\[characterization\]/i,
  connectionRefused: /ERR_CONNECTION_REFUSED/i,
};

const PLAYWRIGHT_COMMAND = process.execPath;
const PLAYWRIGHT_ARGS_PREFIX = ['node_modules/playwright/cli.js', 'test'];
let activeChild = null;

function assertConfiguration() {
  if (!process.env.PW_BASE_URL) {
    console.error('PW_BASE_URL is required. Start an owned server and set PW_BASE_URL before running this runner.');
    process.exit(1);
  }

  const flattened = GROUPS.flatMap((group) => group.specs);
  const uniqueSpecs = new Set(flattened);
  const expected = CARRIED_SPECS.join('\n');
  const actual = flattened.join('\n');

  if (CARRIED_SPECS.length !== 14 || flattened.length !== 14) {
    throw new Error(`Expected exactly 14 carried specs; configured=${CARRIED_SPECS.length}, grouped=${flattened.length}`);
  }
  if (uniqueSpecs.size !== flattened.length) {
    throw new Error('Configured carried groups contain a duplicate spec path.');
  }
  if (actual !== expected) {
    throw new Error('Configured carried groups do not exactly match the bound 14-spec list and order.');
  }
  for (const group of GROUPS) {
    if (group.specs.length === 0) {
      throw new Error(`Configured group ${group.name} is empty.`);
    }
    if (group.specs.length > 4) {
      throw new Error(`Configured group ${group.name} has ${group.specs.length} specs; maximum is 4.`);
    }
  }
}

function formatDuration(ms) {
  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

function detectAuthExpiry(output) {
  return AUTH_EXPIRY_SIGNATURE.timeout.test(output)
    && AUTH_EXPIRY_SIGNATURE.locatorWait.test(output)
    && AUTH_EXPIRY_SIGNATURE.backToDashboard.test(output)
    && AUTH_EXPIRY_SIGNATURE.harness.test(output);
}

function detectSetupClose(output, setupCloseRetryConsumed) {
  return !setupCloseRetryConsumed
    && SETUP_CLOSE_SIGNATURE.setupProject.test(output)
    && SETUP_CLOSE_SIGNATURE.targetClosed.test(output)
    && !SETUP_CLOSE_SIGNATURE.characterizationProject.test(output)
    && !SETUP_CLOSE_SIGNATURE.connectionRefused.test(output)
    && !detectAuthExpiry(output);
}

function extractTotals(output) {
  const totals = [];
  const pattern = /^\s*(\d+)\s+(passed|failed|skipped|flaky|interrupted)\b.*$/gim;
  let match;
  while ((match = pattern.exec(output)) !== null) {
    totals.push(`${match[1]} ${match[2]}`);
  }
  return totals.length > 0 ? totals.join(', ') : 'not reported';
}

function runPlaywright(args, label) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let child;
    try {
      child = spawn(PLAYWRIGHT_COMMAND, [...PLAYWRIGHT_ARGS_PREFIX, ...args], {
        cwd: process.cwd(),
        env: process.env,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (error) {
      resolve({
        label,
        code: 1,
        output: `${output}\nFailed to start child process: ${error instanceof Error ? error.message : String(error)}`,
        elapsedMs: Date.now() - startedAt,
        startError: true,
      });
      return;
    }

    activeChild = child;
    let output = '';

    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.on('error', (error) => {
      activeChild = null;
      resolve({
        label,
        code: 1,
        output: `${output}\nFailed to start child process: ${error.message}`,
        elapsedMs: Date.now() - startedAt,
        startError: true,
      });
    });
    child.on('close', (code, signal) => {
      activeChild = null;
      resolve({
        label,
        code: typeof code === 'number' ? code : 1,
        signal,
        output,
        elapsedMs: Date.now() - startedAt,
        startError: false,
      });
    });
  });
}

async function runSetupRefresh() {
  return runPlaywright(['--project=setup'], 'setup-refresh');
}

async function runGroup(group, retryAfterRefresh = false) {
  const args = [...group.specs, '--workers=1'];
  if (retryAfterRefresh) {
    args.push('--no-deps');
  }
  return runPlaywright(args, group.name);
}

function printFailureOutput(result) {
  console.log(`--- ${result.label} failure output start ---`);
  process.stdout.write(result.output);
  if (!result.output.endsWith('\n')) {
    console.log();
  }
  console.log(`--- ${result.label} failure output end ---`);
}

async function main() {
  assertConfiguration();

  const startedAt = Date.now();
  const results = [];
  let authExpiryIncidents = 0;
  let recoveredIncidents = 0;
  let setupCloseIncidents = 0;
  let recoveredSetupCloseIncidents = 0;
  let nonSignatureFailures = 0;

  console.log('PATCH-088 carried-suite grouped runner');
  console.log(`PW_BASE_URL: set`);
  console.log(`Groups: ${GROUPS.length}`);
  console.log(`Specs accounted for: ${CARRIED_SPECS.length}/14`);
  console.log();

  for (const [index, group] of GROUPS.entries()) {
    const groupStartedAt = Date.now();
    console.log(`Group ${index + 1}/${GROUPS.length}: ${group.name}`);
    for (const spec of group.specs) {
      console.log(`  - ${spec}`);
    }

    const firstRun = await runGroup(group);
    const firstPassed = firstRun.code === 0;
    const authExpiryDetected = firstPassed ? false : detectAuthExpiry(firstRun.output);
    const setupCloseDetected = firstPassed || authExpiryDetected ? false : detectSetupClose(firstRun.output, false);
    let setupRefresh = null;
    let retry = null;
    let finalPassed = firstPassed;
    let finalCode = firstRun.code;

    if (!firstPassed && authExpiryDetected) {
      authExpiryIncidents += 1;
      console.log('AUTH-EXPIRY (INFRASTRUCTURE, not a product failure)');
      setupRefresh = await runSetupRefresh();
      if (setupRefresh.code !== 0) {
        console.log('Setup refresh result: failed');
        printFailureOutput(setupRefresh);
        finalPassed = false;
        finalCode = setupRefresh.code || 1;
      } else {
        console.log('Setup refresh result: passed');
        retry = await runGroup(group, true);
        finalPassed = retry.code === 0;
        finalCode = retry.code;
        if (finalPassed) {
          recoveredIncidents += 1;
        } else {
          printFailureOutput(retry);
        }
      }
    } else if (!firstPassed && setupCloseDetected) {
      setupCloseIncidents += 1;
      console.log('SETUP-CLOSE (INFRASTRUCTURE, not a product failure)');
      console.log(`First attempt exit code: ${firstRun.code}`);
      printFailureOutput(firstRun);
      console.log('Retry attempt: 1');
      retry = await runGroup(group);
      finalPassed = retry.code === 0;
      finalCode = retry.code;
      if (finalPassed) {
        recoveredSetupCloseIncidents += 1;
      } else {
        printFailureOutput(retry);
      }
    } else if (!firstPassed) {
      nonSignatureFailures += 1;
      printFailureOutput(firstRun);
    }

    const finalOutput = retry?.output ?? firstRun.output;
    const groupResult = {
      number: index + 1,
      name: group.name,
      specs: group.specs,
      firstRun: firstPassed ? 'passed' : 'failed',
      authExpiryDetected: authExpiryDetected ? 'yes' : 'no',
      setupCloseDetected: setupCloseDetected ? 'yes' : 'no',
      setupRefresh: setupRefresh ? (setupRefresh.code === 0 ? 'passed' : 'failed') : 'not run',
      retry: retry ? (retry.code === 0 ? 'passed' : 'failed') : 'not run',
      final: finalPassed ? 'passed' : 'failed',
      totals: extractTotals(finalOutput),
      elapsed: formatDuration(Date.now() - groupStartedAt),
    };
    results.push(groupResult);

    console.log(`First-run result: ${groupResult.firstRun}`);
    console.log(`Auth-expiry signature detected: ${groupResult.authExpiryDetected}`);
    console.log(`Setup-close signature detected: ${groupResult.setupCloseDetected}`);
    console.log(`Retry result: ${groupResult.retry}`);
    console.log(`Final group result: ${groupResult.final}`);
    console.log(`Reported totals: ${groupResult.totals}`);
    console.log(`Elapsed: ${groupResult.elapsed}`);
    console.log();

    if (!finalPassed) {
      console.log('Stopping after failed group.');
      printSummary(results, startedAt, authExpiryIncidents, recoveredIncidents, setupCloseIncidents, recoveredSetupCloseIncidents, nonSignatureFailures, finalCode || 1);
      process.exit(finalCode || 1);
    }
  }

  printSummary(results, startedAt, authExpiryIncidents, recoveredIncidents, setupCloseIncidents, recoveredSetupCloseIncidents, nonSignatureFailures, 0);
}

function printSummary(results, startedAt, authExpiryIncidents, recoveredIncidents, setupCloseIncidents, recoveredSetupCloseIncidents, nonSignatureFailures, exitStatus) {
  const groupsPassedFirstTry = results.filter((result) => result.firstRun === 'passed').length;
  const finalPassed = results.filter((result) => result.final === 'passed').length;
  const accountedSpecs = results.reduce((count, result) => count + result.specs.length, 0);

  console.log('Final carried-suite summary');
  console.log('Group | First run | Auth expiry | Setup close | Setup refresh | Retry | Final | Totals | Elapsed');
  for (const result of results) {
    console.log(`${result.number}. ${result.name} | ${result.firstRun} | ${result.authExpiryDetected} | ${result.setupCloseDetected} | ${result.setupRefresh} | ${result.retry} | ${result.final} | ${result.totals} | ${result.elapsed}`);
  }
  console.log(`All 14 specs accounted for: ${accountedSpecs === 14 ? 'yes' : 'no'} (${accountedSpecs}/14)`);
  console.log(`Number of groups: ${GROUPS.length}`);
  console.log(`Groups passed first try: ${groupsPassedFirstTry}`);
  console.log(`Groups finally passed: ${finalPassed}/${GROUPS.length}`);
  console.log(`Auth-expiry incidents: ${authExpiryIncidents}`);
  console.log(`Groups recovered after sanctioned refresh: ${recoveredIncidents}`);
  console.log(`Setup-close incidents: ${setupCloseIncidents}`);
  console.log(`Groups recovered after setup-close retry: ${recoveredSetupCloseIncidents}`);
  console.log(`Non-signature failures: ${nonSignatureFailures}`);
  console.log(`Total elapsed: ${formatDuration(Date.now() - startedAt)}`);
  console.log(`Final exit status: ${exitStatus}`);
}

function handleSignal(signal) {
  if (activeChild && !activeChild.killed) {
    activeChild.kill(signal);
  }
  console.error(`Interrupted by ${signal}`);
  process.exit(signal === 'SIGINT' ? 130 : 143);
}

process.on('SIGINT', () => handleSignal('SIGINT'));
process.on('SIGTERM', () => handleSignal('SIGTERM'));

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
