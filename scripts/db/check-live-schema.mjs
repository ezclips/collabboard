#!/usr/bin/env node
/**
 * Does every column the server code SELECTS actually exist in the database it
 * will run against?
 *
 * WHY THIS EXISTS. On 2026-09-22 every PDF card on a live board rendered
 * "Page content is not available for this document." The cause was one column
 * in one select -- `transcript_representation` -- that shipped in a migration
 * nobody had applied. `npx vitest run` was green and `npx tsc --noEmit` exited
 * 0 throughout, because tests mock the database and TypeScript cannot see a
 * schema. Two gates said the branch was healthy while every read returned 503.
 *
 * It was the SECOND time on this branch. The first was caught in review
 * (`.agent/retrieval-followups.md`, and the LESSONS_LEARNED entry about a read
 * that adds a column production lacks). Review caught one and missed the other,
 * which is what an instrument is for.
 *
 * WHAT IT DOES. Finds `.from('table')...select('cols')` pairs in server code and
 * asks the live database to execute each one with `limit(0)`. No rows are read;
 * PostgREST still validates every column, cast, alias and JSON path. A missing
 * column comes back as 42703 and names itself.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not parse SQL, model the schema, or
 * maintain a pinned column list. A pinned list is a second copy of the truth
 * that drifts silently; this asks the database, which cannot drift from itself.
 *
 * SILENCE IS NOT SUCCESS. A select this cannot parse -- a template literal, a
 * variable, a chain split across a helper -- is REPORTED as unparsed and
 * counted, never skipped quietly. A checker that quietly ignores what it does
 * not understand reports a clean run over the exact code it failed to read.
 * That is the failure shape that made this necessary in the first place.
 *
 *   node scripts/db/check-live-schema.mjs
 *
 * Exit 0 = every parsed select is executable. Exit 1 = at least one is not.
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 * It is READ-ONLY: every query is a limit(0) select and nothing is written.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const ROOT = process.cwd();
const SCAN_DIRS = ['app', 'lib/server', 'lib/infra'];

/* ------------------------------------------------------------------ env */

function readEnv() {
  const file = path.join(ROOT, '.env.local');
  if (!fs.existsSync(file)) throw new Error('.env.local not found');
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

/* ---------------------------------------------------------------- scan */

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      yield* walk(full);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      yield full;
    }
  }
}

/**
 * A `.from(...)` followed by the first `.select(...)` after it. Comments and
 * other chained calls may sit between them, which is why this is not one regex
 * over the whole chain.
 */
/**
 * Module-level `const NAME = 'a, b' + 'c'` string constants, so that the common
 * and GOOD practice of naming a shared column list does not read as uncheckable.
 * Only same-file constants: an imported one is not resolved and is reported
 * unparsed rather than guessed at.
 */
function stringConstants(src) {
  const consts = new Map();
  const re = /^\s*(?:export\s+)?const\s+([A-Za-z0-9_]+)\s*=\s*((?:\s*(['"])(?:\\.|(?!\3)[\s\S])*\3\s*\+?)+);/gm;
  let m;
  while ((m = re.exec(src)) !== null) {
    const pieces = [...m[2].matchAll(/(['"])((?:\\.|(?!\1)[\s\S])*)\1/g)].map((p) => p[2]);
    if (pieces.length > 0) consts.set(m[1], pieces.join(''));
  }
  return consts;
}

function extractSelects(file) {
  const src = fs.readFileSync(file, 'utf8');
  const consts = stringConstants(src);
  const found = [];
  const fromRe = /\.from\(\s*(['"`])([A-Za-z0-9_]+)\1\s*\)/g;
  let m;
  while ((m = fromRe.exec(src)) !== null) {
    const table = m[2];
    const line = src.slice(0, m.index).split('\n').length;
    const rest = src.slice(m.index + m[0].length, m.index + m[0].length + 4000);
    const at = rest.indexOf('.select(');
    if (at === -1) continue;                  // .from with no .select: insert/update/delete
    if (/\.(insert|update|upsert|delete)\(/.test(rest.slice(0, at))) continue;

    // Read the WHOLE argument expression, not the first string literal in it.
    // `.select('a, b, ' + 'c, d')` is one select; taking only 'a, b, ' reports a
    // trailing-comma parse error that is not in the code, and -- far worse --
    // a concatenation whose FIRST half happens to be valid would pass while its
    // second half was never checked at all.
    const argStart = at + '.select('.length;
    let depth = 1;
    let i = argStart;
    for (; i < rest.length && depth > 0; i += 1) {
      const c = rest[i];
      if (c === '(') depth += 1;
      else if (c === ')') depth -= 1;
      else if (c === "'" || c === '"' || c === '`') {
        const quote = c;
        i += 1;
        while (i < rest.length && rest[i] !== quote) i += rest[i] === '\\' ? 2 : 1;
      }
    }
    if (depth !== 0) {
      found.push({ file, line, table, cols: null, reason: 'unterminated .select( within the scan window' });
      continue;
    }
    const arg = rest.slice(argStart, i - 1).trim();

    // Accept only a concatenation of plain string literals. Anything else --
    // a variable, a call, an interpolation -- is UNPARSED and said so.
    const pieces = [];
    let ok = true;
    let rem = arg;
    while (rem.length > 0) {
      const lit = /^\s*(['"`])((?:\\.|(?!\1)[\s\S])*)\1\s*/.exec(rem);
      if (!lit) { ok = false; break; }
      if (lit[1] === '`' && /\$\{/.test(lit[2])) { ok = false; break; }
      pieces.push(lit[2]);
      rem = rem.slice(lit[0].length);
      if (rem.length === 0) break;
      if (rem.startsWith('+')) { rem = rem.slice(1); continue; }
      ok = false; break;                      // a second argument, or anything else
    }
    if (!ok || pieces.length === 0) {
      const ident = /^([A-Za-z0-9_]+)$/.exec(arg);
      if (ident && consts.has(ident[1])) {
        found.push({ file, line, table, cols: consts.get(ident[1]).replace(/\s+/g, ' ').trim() });
        continue;
      }
      found.push({
        file, line, table, cols: null,
        reason: ident ? `constant ${ident[1]} not defined in this file` : 'select argument is not a plain string literal',
      });
      continue;
    }
    found.push({ file, line, table, cols: pieces.join('').replace(/\s+/g, ' ').trim() });
  }
  return found;
}

/* ----------------------------------------------------------------- run */

const env = readEnv();
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const all = [];
for (const dir of SCAN_DIRS) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) continue;
  for (const file of walk(abs)) all.push(...extractSelects(file));
}

const parsed = all.filter((s) => s.cols !== null);
const unparsed = all.filter((s) => s.cols === null);

// One database round trip per DISTINCT table+select, not per call site.
const distinct = new Map();
for (const s of parsed) {
  const key = `${s.table}::${s.cols}`;
  if (!distinct.has(key)) distinct.set(key, { ...s, sites: [] });
  distinct.get(key).sites.push(`${path.relative(ROOT, s.file).replace(/\\/g, '/')}:${s.line}`);
}

console.log(`scanned ${SCAN_DIRS.join(', ')}`);
console.log(`${all.length} selects found, ${distinct.size} distinct, ${unparsed.length} unparsed\n`);

const failures = [];
for (const entry of distinct.values()) {
  const { error } = await db.from(entry.table).select(entry.cols).limit(0);
  if (error) failures.push({ ...entry, error });
}

if (failures.length > 0) {
  console.log(`FAILED -- ${failures.length} select(s) the database will not execute:\n`);
  for (const f of failures) {
    console.log(`  ${f.table}`);
    console.log(`    [${f.error.code}] ${f.error.message}`);
    console.log(`    select: ${f.cols.slice(0, 150)}`);
    for (const site of f.sites.slice(0, 6)) console.log(`    at ${site}`);
    console.log('');
  }
}

if (unparsed.length > 0) {
  // Reported, never silently dropped: these are the selects this gate does NOT
  // cover, and a reader must know the coverage rather than assume it is total.
  console.log(`NOT CHECKED -- ${unparsed.length} select(s) this gate could not read:`);
  for (const u of unparsed) {
    console.log(`  ${path.relative(ROOT, u.file).replace(/\\/g, '/')}:${u.line}  ${u.table}  (${u.reason})`);
  }
  console.log('');
}

if (failures.length === 0) {
  console.log(`OK -- all ${distinct.size} distinct selects execute against the live schema.`);
  if (unparsed.length > 0) console.log(`   (${unparsed.length} unparsed, listed above, NOT covered by this result)`);
}

process.exit(failures.length === 0 ? 0 : 1);
