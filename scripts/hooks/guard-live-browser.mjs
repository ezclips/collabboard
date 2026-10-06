/**
 * PATCH-290 — Claude Code PreToolUse guard for the owner's shared live-check
 * browser (CDP 9333) and for production builds while the dev server runs.
 *
 * Contract: reads the hook JSON from stdin ({ tool_name, tool_input, cwd }),
 * decides, and exits 2 with a one-paragraph reason on stderr to block, or 0 to
 * allow. Its own failures (bad JSON, unreadable file) never block: exit 0 with
 * a stderr warning.
 *
 * The pure core `decide(input, { readFile })` is exported for tests; the CLI at
 * the bottom only wires stdin/stdout/exit.
 */
import { readFile as readFileFromDisk } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * @typedef {{ block: false } | { block: true, reason: string }} Decision
 */

export const UNLOCK_RECIPE_COMMENT = '// live-guard: unlock-recipe';

export const FORBIDDEN_PATTERNS = [
  'setViewportSize(',
  'setViewport(',
  'setDeviceMetricsOverride',
  'browser.close(',
  'context.close(',
  'browser.contexts()[0].close(',
];

const BUILD_COMMAND_PATTERNS = [
  /^next\s+build(?![:\w])/,
  /^npm\s+run\s+build(?![:\w])/,
];

const BLOCK_BUILD_REASON = 'No production build while the dev server runs (owner rule)';

const TESTING_POINTER = 'TESTING.md section 4 ("Live checks in the owner\'s browser")';

/** A browser script mentions 9333, connectOverCDP, or imports the live kit. */
export function isBrowserScript(text) {
  if (typeof text !== 'string' || text.length === 0) return false;
  return text.includes('9333')
    || text.includes('connectOverCDP')
    || text.includes('scripts/live/kit');
}

/** @returns {Decision} */
function blockReason(pattern) {
  return {
    block: true,
    reason: `Blocked: "${pattern}" is forbidden in a browser script. Live checks must follow ${TESTING_POINTER}: never set a page size and never close the shared browser. Use scripts/live/kit.mjs instead.`,
  };
}

function forbiddenIn(text, allowDeviceMetricsOverride) {
  if (typeof text !== 'string') return [];
  const found = [];
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern === 'setDeviceMetricsOverride' && allowDeviceMetricsOverride) continue;
    if (text.includes(pattern)) found.push(pattern);
  }
  return found;
}

function hasUnlockRecipe(text) {
  return typeof text === 'string' && text.includes(UNLOCK_RECIPE_COMMENT);
}

/** @returns {Decision} */
function checkBrowserText(text, allowDeviceMetricsOverride) {
  if (!isBrowserScript(text)) return { block: false };
  const found = forbiddenIn(text, allowDeviceMetricsOverride);
  if (found.length === 0) return { block: false };
  return blockReason(found[0]);
}

function stripQuotes(value) {
  const text = value.trim();
  const quote = text[0];
  if ((quote === '"' || quote === "'" || quote === '`') && text.length >= 2 && text.endsWith(quote)) {
    return text.slice(1, -1);
  }
  return text;
}

/** Finds `node <file>` or `node -e/--eval <text>` inside a shell command. */
function analyzeNodeCommand(command) {
  if (typeof command !== 'string') return null;
  const evalMatch = command.match(/(?:^|[\s;&|(])node(?:\.exe)?\s+(?:-e|--eval)\s+([\s\S]+)$/);
  if (evalMatch) return { evalText: stripQuotes(evalMatch[1]) };

  const tokens = command.split(/\s+/).filter(Boolean);
  const nodeIndex = tokens.findIndex((token) => token === 'node' || token === 'node.exe');
  if (nodeIndex === -1) return null;
  for (let index = nodeIndex + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.startsWith('-')) continue;
    if (/\.(mjs|cjs|js)$/i.test(token)) return { file: stripQuotes(token) };
    break;
  }
  return null;
}

/** Splits a shell command on &&, ||, ; and newlines, ignoring quoted spans. */
function splitCommandSegments(command) {
  const segments = [];
  let current = '';
  let quote = null;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      current += char;
      continue;
    }
    if (char === '\n' || char === '\r' || char === ';') {
      segments.push(current);
      current = '';
      continue;
    }
    if ((char === '&' || char === '|') && command[index + 1] === char) {
      segments.push(current);
      current = '';
      index += 1;
      continue;
    }
    current += char;
  }
  segments.push(current);
  return segments.map((segment) => segment.trim()).filter(Boolean);
}

/** Cuts a segment at the first unquoted pipe or redirection. */
function stripRedirection(segment) {
  let quote = null;
  for (let index = 0; index < segment.length; index += 1) {
    const char = segment[index];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '|' || char === '>' || char === '<') return segment.slice(0, index);
  }
  return segment;
}

/** `/c/Windows` (Git-Bash) -> `C:/Windows`; other paths unchanged. */
function normalizeDrivePath(value) {
  if (typeof value !== 'string') return value;
  const match = value.match(/^\/([a-zA-Z])(\/.*)?$/);
  if (!match) return value;
  return `${match[1].toUpperCase()}:${match[2] ?? '/'}`;
}

/** Resolves `target` against `base`, normalizing Git-Bash drive paths. */
function resolveTarget(base, target) {
  return resolve(normalizeDrivePath(base), normalizeDrivePath(target));
}

/** `cd <dir>` / `Set-Location <dir>` -> the directory, else null. */
function directoryChange(segment) {
  const match = segment.match(/^(?:cd|chdir|set-location)\s+(.+)$/i);
  if (!match) return null;
  const target = stripQuotes(match[1].trim());
  return target.length > 0 ? target : null;
}

/** The delimiter of a heredoc opened in `segment` (`<<EOF`), else null. */
function heredocDelimiter(segment) {
  let quote = null;
  for (let index = 0; index < segment.length - 1; index += 1) {
    const char = segment[index];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '<' && segment[index + 1] === '<') {
      const rest = segment.slice(index + 2).replace(/^-/, '');
      const match = rest.match(/^\s*(?:'([^']+)'|"([^"]+)"|\\?([A-Za-z_][A-Za-z0-9_]*))/);
      if (match) return match[1] ?? match[2] ?? match[3];
    }
  }
  return null;
}

/**
 * True when the segment actually runs a production build: the build command is
 * at the start of the command (after env assignments, `timeout N`, `npx`), not
 * an argument to `echo`/`grep` or text inside a heredoc body.
 */
function startsWithBuildCommand(segment) {
  let rest = segment.replace(/^\s+/, '');
  let changed = true;
  while (changed) {
    changed = false;
    const env = rest.match(/^[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S*)\s+/);
    if (env) {
      rest = rest.slice(env[0].length);
      changed = true;
      continue;
    }
    const timeout = rest.match(/^timeout\s+(?:\d+(?:\.\d+)?[smhd]?\s+|--?\S+\s+)+/);
    if (timeout) {
      rest = rest.slice(timeout[0].length);
      changed = true;
      continue;
    }
    const npx = rest.match(/^npx\s+(?:--?\S+\s+)*/);
    if (npx) {
      rest = rest.slice(npx[0].length);
      changed = true;
      continue;
    }
  }
  return BUILD_COMMAND_PATTERNS.some((re) => re.test(rest));
}

/** @returns {Promise<Decision>} */
async function decideCommand(command, cwd, readFile) {
  let currentDir = normalizeDrivePath(cwd);
  let heredoc = null;
  for (const rawSegment of splitCommandSegments(command)) {
    if (heredoc !== null) {
      if (rawSegment.trim() === heredoc) heredoc = null;
      continue;
    }

    const opened = heredocDelimiter(rawSegment);
    if (opened !== null) heredoc = opened;

    if (startsWithBuildCommand(rawSegment)) {
      return { block: true, reason: BLOCK_BUILD_REASON };
    }

    const change = directoryChange(rawSegment);
    if (change !== null) {
      currentDir = resolveTarget(currentDir, change);
      continue;
    }

    const node = analyzeNodeCommand(stripRedirection(rawSegment));
    if (!node) continue;

    if (node.evalText !== undefined) {
      const decision = checkBrowserText(node.evalText, hasUnlockRecipe(node.evalText));
      if (decision.block) return decision;
      continue;
    }

    if (node.file !== undefined) {
      const target = isAbsolute(node.file) ? normalizeDrivePath(node.file) : resolveTarget(currentDir, node.file);
      let text;
      try {
        text = await readFile(target);
      } catch {
        continue;
      }
      const decision = checkBrowserText(text, hasUnlockRecipe(text));
      if (decision.block) return decision;
    }
  }

  return { block: false };
}

/** @returns {Decision} */
function decideWrite(toolInput) {
  const content = typeof toolInput.content === 'string' ? toolInput.content : '';
  return checkBrowserText(content, hasUnlockRecipe(content));
}

/** @returns {Promise<Decision>} */
async function decideEdit(toolInput, cwd, readFile) {
  const newString = typeof toolInput.new_string === 'string' ? toolInput.new_string : '';
  const filePath = typeof toolInput.file_path === 'string' ? toolInput.file_path : '';
  let targetText = '';
  if (filePath) {
    const target = isAbsolute(filePath) ? normalizeDrivePath(filePath) : resolveTarget(cwd, filePath);
    try {
      targetText = await readFile(target);
    } catch {
      targetText = '';
    }
  }
  if (!isBrowserScript(newString) && !isBrowserScript(targetText)) return { block: false };
  const allowDeviceMetricsOverride = hasUnlockRecipe(targetText) || hasUnlockRecipe(newString);
  const found = forbiddenIn(newString, allowDeviceMetricsOverride);
  if (found.length === 0) return { block: false };
  return blockReason(found[0]);
}

/**
 * Pure decision core. `readFile(path)` is async and returns UTF-8 text.
 * @param {any} input
 * @param {{ readFile?: (path: string) => Promise<string> }} [options]
 * @returns {Promise<Decision>}
 */
export async function decide(input, { readFile } = {}) {
  const read = typeof readFile === 'function' ? readFile : (path) => readFileFromDisk(path, 'utf8');
  const toolName = input && typeof input.tool_name === 'string' ? input.tool_name : '';
  const toolInput = (input && input.tool_input) || {};
  const cwd = input && typeof input.cwd === 'string' && input.cwd.length > 0 ? input.cwd : process.cwd();

  if (toolName === 'Bash' || toolName === 'PowerShell') {
    return decideCommand(typeof toolInput.command === 'string' ? toolInput.command : '', cwd, read);
  }
  if (toolName === 'Write') return decideWrite(toolInput);
  if (toolName === 'Edit') return decideEdit(toolInput, cwd, read);
  return { block: false };
}

async function main() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.stderr.write('guard-live-browser: could not parse hook JSON; allowing.\n');
    process.exit(0);
  }
  let result;
  try {
    result = await decide(input, { readFile: (path) => readFileFromDisk(path, 'utf8') });
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    process.stderr.write(`guard-live-browser: internal error (${message}); allowing.\n`);
    process.exit(0);
  }
  if (result && result.block) {
    process.stderr.write(`${result.reason}\n`);
    process.exit(2);
  }
  process.exit(0);
}

const invokedDirectly = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  main().catch((error) => {
    const message = error && error.message ? error.message : String(error);
    process.stderr.write(`guard-live-browser: internal error (${message}); allowing.\n`);
    process.exit(0);
  });
}
