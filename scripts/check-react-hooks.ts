// ENG-HOOKS-H1 -- dedicated react-hooks/rules-of-hooks gate.
//
// B3 shipped a useMemo below CanvasClient's early returns and killed every
// board. The rule that catches it was already enabled; nothing ran it. This
// runs exactly that rule, through the repository's own ESLint config, and
// reports nothing else.
//
// Fails closed: a green result is only meaningful if the rule was actually
// enabled at error severity and the target was actually linted.
import { ESLint } from 'eslint';

export const HOOK_RULE = 'react-hooks/rules-of-hooks';

export interface HookFinding {
  filePath: string;
  line: number;
  column: number;
  ruleId: string;
  message: string;
}

export interface HookCheckResult {
  ok: boolean;
  findings: readonly HookFinding[];
  /** Why the check could not be trusted. Absent when the run was valid. */
  reason?: string;
}

function severityOf(entry: unknown): number {
  const value = Array.isArray(entry) ? entry[0] : entry;
  if (value === 'error' || value === 2) return 2;
  if (value === 'warn' || value === 1) return 1;
  return 0;
}

/** The rule's severity in the config ESLint actually computes for this file. */
export async function hookRuleSeverity(eslint: ESLint, filePath: string): Promise<number> {
  const config = await eslint.calculateConfigForFile(filePath) as { rules?: Record<string, unknown> };
  return severityOf(config?.rules?.[HOOK_RULE]);
}

function toFindings(results: ESLint.LintResult[]): HookFinding[] {
  return results.flatMap((result) => result.messages
    .filter((message) => message.ruleId === HOOK_RULE)
    .map((message) => ({
      filePath: result.filePath,
      line: message.line,
      column: message.column,
      ruleId: HOOK_RULE,
      message: message.message,
    })));
}

/** A parse or config failure must never read as "no hook problems". */
function fatalReason(results: ESLint.LintResult[]): string | undefined {
  for (const result of results) {
    const fatal = result.messages.find((message) => message.fatal);
    if (fatal) return `fatal at ${result.filePath}:${fatal.line}: ${fatal.message}`;
  }
  return undefined;
}

async function guard(eslint: ESLint, filePath: string): Promise<string | undefined> {
  const severity = await hookRuleSeverity(eslint, filePath);
  if (severity !== 2) {
    return `${HOOK_RULE} is not enabled at error severity for ${filePath} (severity ${severity})`;
  }
  return undefined;
}

export function createEslint(cwd = process.cwd()): ESLint {
  return new ESLint({ cwd });
}

export async function checkHookOrderForFile(
  filePath: string,
  eslint: ESLint = createEslint(),
): Promise<HookCheckResult> {
  if (await eslint.isPathIgnored(filePath)) {
    return { ok: false, findings: [], reason: `${filePath} is ignored by ESLint` };
  }
  const disabled = await guard(eslint, filePath);
  if (disabled) return { ok: false, findings: [], reason: disabled };

  // A missing/unreadable target throws; that is a failed check, not a pass.
  let results: ESLint.LintResult[];
  try {
    results = await eslint.lintFiles([filePath]);
  } catch (error) {
    return { ok: false, findings: [], reason: `${filePath} could not be linted: ${(error as Error).message}` };
  }
  if (results.length === 0) return { ok: false, findings: [], reason: `${filePath} was not linted` };

  const fatal = fatalReason(results);
  if (fatal) return { ok: false, findings: [], reason: fatal };

  const findings = toFindings(results);
  return { ok: findings.length === 0, findings };
}

/** Synthetic-source variant, so tests never touch the working tree. */
export async function checkHookOrderForText(
  code: string,
  filePath: string,
  eslint: ESLint = createEslint(),
): Promise<HookCheckResult> {
  const disabled = await guard(eslint, filePath);
  if (disabled) return { ok: false, findings: [], reason: disabled };

  const results = await eslint.lintText(code, { filePath });
  if (results.length === 0) return { ok: false, findings: [], reason: `${filePath} was not linted` };

  const fatal = fatalReason(results);
  if (fatal) return { ok: false, findings: [], reason: fatal };

  const findings = toFindings(results);
  return { ok: findings.length === 0, findings };
}

export const CANVAS_CLIENT = 'app/dashboard/canvas/[id]/CanvasClient.tsx';

export async function runCli(targets: readonly string[]): Promise<number> {
  const eslint = createEslint();
  let failed = false;
  for (const target of targets) {
    const result = await checkHookOrderForFile(target, eslint);
    if (result.reason) {
      console.error(`${HOOK_RULE}: CHECK INVALID -- ${result.reason}`);
      failed = true;
      continue;
    }
    for (const finding of result.findings) {
      console.error(`${finding.filePath}:${finding.line}:${finding.column}  ${finding.ruleId}  ${finding.message}`);
    }
    if (!result.ok) failed = true;
    else console.log(`${target}\n${HOOK_RULE}: 0`);
  }
  return failed ? 1 : 0;
}

// The usual `argv[1] === import.meta.url` idiom cannot work here: vite-node
// puts its own binary in argv[1] and drops the script path entirely, so that
// test is always false and the CLI would silently no-op to exit 0 -- the exact
// vacuous pass this gate exists to prevent. The test runner's own flag is the
// reliable signal instead.
if (!process.env.VITEST) {
  const targets = process.argv.slice(2).filter((arg) => arg !== '--');
  process.exitCode = await runCli(targets.length > 0 ? targets : [CANVAS_CLIENT]);
}
