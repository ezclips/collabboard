/**
 * AI Prompt Quality Test Runner
 *
 * Runs golden prompt tests against a running Next.js dev server.
 * Uses the same validators and schemas as the production routes.
 *
 * Usage (via package scripts — preferred):
 *   npm run ai:test
 *   npm run ai:test:generation
 *   npm run ai:test:conversion
 *   npm run ai:test:classify
 *
 * Usage (direct):
 *   npx tsx scripts/test-ai-prompts.ts [options]
 *
 * Options:
 *   --suite     generation | conversion | classify | all  (default: all)
 *   --base-url  http://localhost:3000                     (default)
 *   --limit     N   run only first N generation tests    (default: all)
 *
 * Requires: dev server running at --base-url
 */

import type { AIMode, DiagramSubtype, StoredAIContent } from '../lib/ai/contracts';
import type { FailureCategory, GoldenPromptEntry } from '../lib/ai/golden-prompts';
import { GOLDEN_PROMPTS } from '../lib/ai/golden-prompts';
import { CONVERSION_FIXTURES } from '../lib/ai/test-fixtures/conversion-fixtures';
import { CLASSIFY_FIXTURES } from '../lib/ai/test-fixtures/classify-fixtures';
import {
  safeValidateAIContentWithSubtypeCheck,
  DIAGRAM_SUBTYPE_SCHEMAS,
} from '../lib/ai/validators';
import { MODE_REGISTRY } from '../lib/ai/mode-registry';

// -------------------------------------------------------------------------
// CLI args
// -------------------------------------------------------------------------
const args = process.argv.slice(2);

function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(name);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

const BASE_URL = getArg('--base-url', 'http://localhost:3000');
const SUITE = getArg('--suite', 'all');
const LIMIT = parseInt(getArg('--limit', '0'), 10) || 0;
const DELAY_MS = 400; // pause between requests to avoid rate limiting

const VALID_SUITES = ['generation', 'conversion', 'classify', 'all'];

// -------------------------------------------------------------------------
// Result types
// -------------------------------------------------------------------------
type AssertionResult = {
  description: string;
  pass: boolean;
  failureCategory?: FailureCategory;
};

type TestResult = {
  id: string;
  description: string;
  pass: boolean;
  error?: string;
  assertions: AssertionResult[];
  httpStatus?: number;
  // Set for generation tests — used for grouped summary
  mode?: string;
  subtype?: string;
};

// -------------------------------------------------------------------------
// Type guards
// -------------------------------------------------------------------------
function isAIMode(value: unknown): value is AIMode {
  return typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(MODE_REGISTRY, value);
}

function isDiagramSubtype(value: unknown): value is DiagramSubtype {
  return typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(DIAGRAM_SUBTYPE_SCHEMAS, value);
}

function isStoredAIContent(value: unknown): value is StoredAIContent {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return obj.version === 1 && isAIMode(obj.mode) && typeof obj.data === 'object';
}

// -------------------------------------------------------------------------
// Utility
// -------------------------------------------------------------------------
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function modeLabel(mode: string, subtype?: string): string {
  return subtype ? `${mode}/${subtype}` : mode;
}

// -------------------------------------------------------------------------
// ANSI colours
// -------------------------------------------------------------------------
const RESET  = '\x1b[0m';
const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';
const DIM    = '\x1b[2m';
const BOLD   = '\x1b[1m';

const passTag = `${GREEN}[PASS]${RESET}`;
const failTag = `${RED}[FAIL]${RESET}`;

function printTestResult(result: TestResult): void {
  const tag = result.pass ? passTag : failTag;
  console.log(`\n${BOLD}${tag} ${result.id}${RESET} ${DIM}${result.description}${RESET}`);

  if (result.httpStatus && result.httpStatus !== 200) {
    console.log(`  ${RED}HTTP ${result.httpStatus}${RESET}`);
  }
  if (result.error) {
    console.log(`  ${RED}Error:${RESET} ${result.error}`);
  }

  for (const a of result.assertions) {
    const atag = a.pass ? passTag : failTag;
    const catNote = !a.pass && a.failureCategory ? ` ${DIM}[${a.failureCategory}]${RESET}` : '';
    console.log(`  ${atag} ${a.description}${catNote}`);
  }
}

// -------------------------------------------------------------------------
// Preflight: verify the server is reachable
// -------------------------------------------------------------------------
async function preflight(): Promise<void> {
  console.log(`\n${BOLD}AI Prompt Quality Test Runner${RESET}`);
  console.log(`${DIM}Target:  ${BASE_URL}${RESET}`);
  console.log(`${DIM}Suite:   ${SUITE}${LIMIT > 0 ? `  (limit: ${LIMIT} generation tests)` : ''}${RESET}`);
  console.log('─'.repeat(60));

  if (!VALID_SUITES.includes(SUITE)) {
    console.error(`${RED}Unknown suite "${SUITE}". Valid values: ${VALID_SUITES.join(', ')}${RESET}`);
    process.exit(1);
  }

  // Quick reachability check — try the root path
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);

  try {
    await fetch(BASE_URL, { method: 'HEAD', signal: controller.signal });
    clearTimeout(timer);
    console.log(`${GREEN}Server reachable at ${BASE_URL}${RESET}`);
  } catch {
    clearTimeout(timer);
    console.error(
      `\n${RED}Cannot reach server at ${BASE_URL}${RESET}\n` +
      `${DIM}Start the dev server first:  npm run dev${RESET}\n` +
      `${DIM}Or pass a different URL:     --base-url http://...${RESET}\n`,
    );
    process.exit(1);
  }
}

// -------------------------------------------------------------------------
// Generation test runner
// -------------------------------------------------------------------------
async function runGenerationTest(entry: GoldenPromptEntry): Promise<TestResult> {
  const body = {
    prompt: entry.prompt,
    mode: entry.mode,
    ...(entry.subtype ? { subtype: entry.subtype } : {}),
  };

  let httpStatus: number | undefined;

  try {
    const res = await fetch(`${BASE_URL}/api/ai/generate-component`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    httpStatus = res.status;

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({ error: 'Unknown error' }));
      return {
        id: entry.id, description: entry.description,
        pass: false, error: typeof errBody?.error === 'string' ? errBody.error : `HTTP ${res.status}`,
        assertions: [], httpStatus, mode: entry.mode, subtype: entry.subtype,
      };
    }

    const envelope: unknown = await res.json();

    if (!isStoredAIContent(envelope)) {
      return {
        id: entry.id, description: entry.description,
        pass: false, error: 'Response is not a valid StoredAIContent envelope.',
        assertions: [], httpStatus, mode: entry.mode, subtype: entry.subtype,
      };
    }

    // Client-side re-validation using the same schemas as the route
    const validation = safeValidateAIContentWithSubtypeCheck({
      mode: entry.mode, subtype: entry.subtype, data: envelope.data,
    });

    if (!validation.success) {
      return {
        id: entry.id, description: entry.description,
        pass: false, error: `Schema re-validation failed: ${validation.error?.message}`,
        assertions: [], httpStatus, mode: entry.mode, subtype: entry.subtype,
      };
    }

    // Run golden assertions
    const assertionResults: AssertionResult[] = entry.assertions.map((a) => {
      let ok = false;
      try { ok = a.check(envelope.data); } catch { ok = false; }
      return { description: a.description, pass: ok, failureCategory: ok ? undefined : a.failureCategory };
    });

    return {
      id: entry.id, description: entry.description,
      pass: assertionResults.every((a) => a.pass),
      assertions: assertionResults, httpStatus, mode: entry.mode, subtype: entry.subtype,
    };

  } catch (err) {
    return {
      id: entry.id, description: entry.description,
      pass: false, error: err instanceof Error ? err.message : 'Network error',
      assertions: [], httpStatus, mode: entry.mode, subtype: entry.subtype,
    };
  }
}

// -------------------------------------------------------------------------
// Conversion test runner
// -------------------------------------------------------------------------
async function runConversionSuite(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  for (const fixture of CONVERSION_FIXTURES) {
    let httpStatus: number | undefined;
    try {
      const res = await fetch(`${BASE_URL}/api/ai/convert-component`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceEnvelope: fixture.sourceEnvelope,
          targetMode: fixture.targetMode,
          ...(fixture.targetSubtype ? { targetSubtype: fixture.targetSubtype } : {}),
        }),
      });
      httpStatus = res.status;

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: 'Unknown error' }));
        const r: TestResult = {
          id: fixture.id, description: fixture.description,
          pass: false, error: typeof errBody?.error === 'string' ? errBody.error : `HTTP ${res.status}`,
          assertions: [], httpStatus,
        };
        results.push(r); printTestResult(r); await sleep(DELAY_MS); continue;
      }

      const envelope: unknown = await res.json();

      if (!isStoredAIContent(envelope)) {
        const r: TestResult = {
          id: fixture.id, description: fixture.description,
          pass: false, error: 'Response is not a valid StoredAIContent envelope.',
          assertions: [], httpStatus,
        };
        results.push(r); printTestResult(r); await sleep(DELAY_MS); continue;
      }

      const validation = safeValidateAIContentWithSubtypeCheck({
        mode: fixture.targetMode, subtype: fixture.targetSubtype, data: envelope.data,
      });

      if (!validation.success) {
        const r: TestResult = {
          id: fixture.id, description: fixture.description,
          pass: false, error: `Target schema validation failed: ${validation.error?.message}`,
          assertions: [], httpStatus,
        };
        results.push(r); printTestResult(r); await sleep(DELAY_MS); continue;
      }

      const assertionResults: AssertionResult[] = fixture.assertions.map((a) => {
        let ok = false;
        try { ok = a.check(envelope.data); } catch { ok = false; }
        return { description: a.description, pass: ok, failureCategory: ok ? undefined : a.failureCategory };
      });

      const r: TestResult = {
        id: fixture.id, description: fixture.description,
        pass: assertionResults.every((a) => a.pass),
        assertions: assertionResults, httpStatus,
      };
      results.push(r); printTestResult(r);

    } catch (err) {
      const r: TestResult = {
        id: fixture.id, description: fixture.description,
        pass: false, error: err instanceof Error ? err.message : 'Network error',
        assertions: [], httpStatus,
      };
      results.push(r); printTestResult(r);
    }

    await sleep(DELAY_MS);
  }

  return results;
}

// -------------------------------------------------------------------------
// Classify test runner
// -------------------------------------------------------------------------
async function runClassifySuite(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  for (const fixture of CLASSIFY_FIXTURES) {
    let httpStatus: number | undefined;
    try {
      const res = await fetch(`${BASE_URL}/api/ai/classify-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: fixture.prompt }),
      });
      httpStatus = res.status;

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: 'Unknown error' }));
        const r: TestResult = {
          id: fixture.id, description: fixture.description,
          pass: false, error: typeof errBody?.error === 'string' ? errBody.error : `HTTP ${res.status}`,
          assertions: [], httpStatus, mode: fixture.expectedMode, subtype: fixture.expectedSubtype,
        };
        results.push(r); printTestResult(r); await sleep(DELAY_MS); continue;
      }

      const body: unknown = await res.json();
      const obj = (typeof body === 'object' && body !== null)
        ? (body as Record<string, unknown>) : {};

      const returnedMode = obj.mode;
      const returnedSubtype = obj.subtype;
      const returnedConfidence = obj.confidence;

      const assertionResults: AssertionResult[] = [];

      const modeOk = returnedMode === fixture.expectedMode;
      assertionResults.push({
        description: `mode is ${fixture.expectedMode} (got: ${returnedMode})`,
        pass: modeOk, failureCategory: modeOk ? undefined : 'classifier_mismatch',
      });

      if (fixture.expectedSubtype) {
        const subtypeOk = returnedSubtype === fixture.expectedSubtype;
        assertionResults.push({
          description: `subtype is ${fixture.expectedSubtype} (got: ${returnedSubtype})`,
          pass: subtypeOk, failureCategory: subtypeOk ? undefined : 'classifier_mismatch',
        });
      }

      if (!fixture.allowLowConfidence) {
        const confOk = returnedConfidence === 'high';
        assertionResults.push({
          description: `confidence is high (got: ${returnedConfidence})`,
          pass: confOk, failureCategory: confOk ? undefined : 'classifier_mismatch',
        });
      } else {
        const confPresent = returnedConfidence === 'high' || returnedConfidence === 'low';
        assertionResults.push({
          description: `confidence is present (got: ${returnedConfidence})`,
          pass: confPresent, failureCategory: confPresent ? undefined : 'classifier_mismatch',
        });
      }

      const r: TestResult = {
        id: fixture.id, description: fixture.description,
        pass: assertionResults.every((a) => a.pass),
        assertions: assertionResults, httpStatus,
        mode: fixture.expectedMode, subtype: fixture.expectedSubtype,
      };
      results.push(r); printTestResult(r);

    } catch (err) {
      const r: TestResult = {
        id: fixture.id, description: fixture.description,
        pass: false, error: err instanceof Error ? err.message : 'Network error',
        assertions: [], httpStatus, mode: fixture.expectedMode, subtype: fixture.expectedSubtype,
      };
      results.push(r); printTestResult(r);
    }

    await sleep(DELAY_MS);
  }

  return results;
}

// -------------------------------------------------------------------------
// Summary: grouped by mode/subtype + failure category
// -------------------------------------------------------------------------
function printSummary(label: string, results: TestResult[]): void {
  const total = results.length;
  const passed = results.filter((r) => r.pass).length;
  const failed = total - passed;

  const statusColor = failed === 0 ? GREEN : RED;
  console.log(`\n${BOLD}${CYAN}${label}${RESET} — ${statusColor}${passed}/${total} passed${RESET}`);

  // By mode/subtype breakdown (only when results carry mode info)
  const withMode = results.filter((r) => r.mode);
  if (withMode.length > 0) {
    // Collect unique mode/subtype keys in insertion order
    const groups = new Map<string, TestResult[]>();
    for (const r of withMode) {
      const key = modeLabel(r.mode!, r.subtype);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }

    console.log(`  ${BOLD}By mode/subtype:${RESET}`);
    for (const [key, group] of groups) {
      const gPass = group.filter((r) => r.pass).length;
      const gTotal = group.length;
      const color = gPass === gTotal ? GREEN : RED;
      const bar = gPass === gTotal ? '  ' : `${RED}!${RESET} `;
      console.log(`  ${bar}${color}${key.padEnd(28)}${RESET}${gPass}/${gTotal}`);
    }
  }

  // Failure category breakdown
  if (failed > 0) {
    const categoryCounts: Record<string, number> = {};
    for (const result of results) {
      for (const a of result.assertions) {
        if (!a.pass && a.failureCategory) {
          categoryCounts[a.failureCategory] = (categoryCounts[a.failureCategory] ?? 0) + 1;
        }
      }
    }

    if (Object.keys(categoryCounts).length > 0) {
      console.log(`  ${BOLD}By failure category:${RESET}`);
      for (const [cat, count] of Object.entries(categoryCounts).sort(([, a], [, b]) => b - a)) {
        console.log(`    ${RED}${cat}${RESET}: ${count} assertion${count !== 1 ? 's' : ''}`);
      }
    }

    // List failing test IDs
    console.log(`  ${BOLD}Failed tests:${RESET}`);
    for (const r of results.filter((r) => !r.pass)) {
      const detail = r.error ? `: ${r.error}` : '';
      console.log(`    ${RED}- ${r.id}${RESET}${detail}`);
    }
  }
}

// -------------------------------------------------------------------------
// Main
// -------------------------------------------------------------------------
async function main(): Promise<void> {
  await preflight();

  const allResults: { label: string; results: TestResult[] }[] = [];

  // --- Generation suite ---
  if (SUITE === 'generation' || SUITE === 'all') {
    console.log(`\n${BOLD}=== Generation Tests ===${RESET}`);
    const entries = LIMIT > 0 ? GOLDEN_PROMPTS.slice(0, LIMIT) : GOLDEN_PROMPTS;
    const genResults: TestResult[] = [];
    for (const entry of entries) {
      const result = await runGenerationTest(entry);
      genResults.push(result);
      printTestResult(result);
      await sleep(DELAY_MS);
    }
    allResults.push({ label: 'Generation', results: genResults });
  }

  // --- Conversion suite ---
  if (SUITE === 'conversion' || SUITE === 'all') {
    console.log(`\n${BOLD}=== Conversion Tests ===${RESET}`);
    const convResults = await runConversionSuite();
    allResults.push({ label: 'Conversion', results: convResults });
  }

  // --- Classify suite ---
  if (SUITE === 'classify' || SUITE === 'all') {
    console.log(`\n${BOLD}=== Classify Tests ===${RESET}`);
    const classifyResults = await runClassifySuite();
    allResults.push({ label: 'Classify', results: classifyResults });
  }

  // --- Grouped summary ---
  console.log('\n' + '═'.repeat(60));
  console.log(`${BOLD}SUMMARY${RESET}`);
  console.log('═'.repeat(60));

  let grandTotal = 0;
  let grandPassed = 0;

  for (const { label, results } of allResults) {
    printSummary(label, results);
    grandTotal += results.length;
    grandPassed += results.filter((r) => r.pass).length;
  }

  if (allResults.length > 1) {
    const color = grandPassed === grandTotal ? GREEN : RED;
    console.log(`\n${BOLD}Grand total: ${color}${grandPassed}/${grandTotal}${RESET}`);
  }

  console.log('');
  process.exit(grandPassed === grandTotal ? 0 : 1);
}

main().catch((err) => {
  console.error(`${RED}Fatal error:${RESET}`, err);
  process.exit(1);
});
