/**
 * What the ai_role_preferences read costs on the hottest AI path.
 *
 * WHY IT EXISTS. Moving generate-component, convert-component and
 * classify-intent onto BYOK added ONE database read to each: resolving the
 * user's Component Generation preference. classify-intent runs on every "Auto"
 * generation, which makes it the highest-frequency AI call in the product, and
 * "before" there is not a smaller number -- it is no read at all. So the delta
 * IS this latency, and it deserves a measurement rather than a shrug.
 *
 * WHAT IT MEASURES. Exactly the query the resolver issues on the default path:
 *
 *     select role, connection_id, model_id
 *       from ai_role_preferences
 *      where user_id = $1 and role = $2
 *      limit 1
 *
 * READ ONLY. It issues SELECTs and nothing else. No row is written, created or
 * removed, and it needs SUPABASE_SERVICE_ROLE_KEY only because
 * ai_role_preferences is RLS-protected per user.
 *
 * TWO CASES, BOTH REPORTED, because they are different queries to the planner
 * and the common one is the miss:
 *   MISS -- no preference row. Every user who has never opened Settings → AI.
 *           This is the CollabBoard-default path, and the resolver returns
 *           without touching the credential table at all.
 *   HIT  -- a stored row. Sampled from a real row when one exists.
 *
 * THE NUMBER IS AN UPPER BOUND, NOT THE PRODUCTION NUMBER. It is measured from
 * a developer machine over the public internet to a hosted Supabase, so it
 * carries a WAN round trip that a deployed server colocated with its database
 * does not. Read it as a ceiling. It is still the right ceiling to check
 * against, because the thing it is being compared to -- a provider completion
 * on the same path -- is measured in seconds.
 *
 * USAGE
 *   npx vite-node scripts/db/aiRolePreferenceReadLatency.ts
 *   npx vite-node scripts/db/aiRolePreferenceReadLatency.ts -- --iterations 100
 */

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

import { AI_ROLE_COMPONENT } from '../../lib/ai/aiRoles';

const DEFAULT_ITERATIONS = 50;
/** Discarded: the first call pays for TCP, TLS and connection setup. */
const WARMUP = 5;

function readEnv(name: string): string {
  const file = path.join(process.cwd(), '.env.local');
  const contents = fs.readFileSync(file, 'utf8');
  const match = contents.match(new RegExp(`^${name}=(.*)$`, 'm'));
  if (!match) throw new Error(`${name} is not set in .env.local`);
  return match[1].trim();
}

function parseIterations(argv: readonly string[]): number {
  const index = argv.indexOf('--iterations');
  if (index === -1) return DEFAULT_ITERATIONS;
  const value = Number(argv[index + 1]);
  if (!Number.isFinite(value) || value < 1) throw new Error('--iterations must be a positive number');
  return Math.floor(value);
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index];
}

interface Sample {
  readonly label: string;
  readonly userId: string;
  readonly timings: readonly number[];
}

function report(sample: Sample): void {
  const sorted = [...sample.timings].sort((a, b) => a - b);
  const mean = sorted.reduce((total, value) => total + value, 0) / sorted.length;
  console.log(
    `${sample.label.padEnd(6)} n=${String(sorted.length).padStart(4)}  `
    + `p50=${percentile(sorted, 50).toFixed(1)}ms  `
    + `p95=${percentile(sorted, 95).toFixed(1)}ms  `
    + `max=${Math.max(...sorted).toFixed(1)}ms  `
    + `mean=${mean.toFixed(1)}ms`,
  );
}

async function main(): Promise<void> {
  const iterations = parseIterations(process.argv.slice(2));
  const db = createClient(
    readEnv('NEXT_PUBLIC_SUPABASE_URL'),
    readEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  );

  // The exact read the resolver issues, spelled as the repository spells it.
  const readPreference = async (userId: string): Promise<void> => {
    const { error } = await db
      .from('ai_role_preferences')
      .select('role, connection_id, model_id')
      .eq('user_id', userId)
      .eq('role', AI_ROLE_COMPONENT)
      .maybeSingle();
    if (error) throw new Error(`read failed: ${error.message}`);
  };

  // A real user id that HAS a row, if one exists. Nothing is written to create
  // one: a measurement must not change what it measures.
  const { data: existing, error: listError } = await db
    .from('ai_role_preferences')
    .select('user_id, role')
    .limit(1);
  if (listError) throw new Error(`could not sample a stored preference: ${listError.message}`);

  const hitUserId: string | null = existing?.[0]?.user_id ?? null;
  // A uuid that owns nothing. The MISS case, and the common one.
  const missUserId = '00000000-0000-0000-0000-0000000000ff';

  const measure = async (userId: string): Promise<readonly number[]> => {
    for (let i = 0; i < WARMUP; i += 1) await readPreference(userId);
    const timings: number[] = [];
    for (let i = 0; i < iterations; i += 1) {
      const started = performance.now();
      await readPreference(userId);
      timings.push(performance.now() - started);
    }
    return timings;
  };

  console.log(`ai_role_preferences read latency -- role '${AI_ROLE_COMPONENT}'`);
  console.log(`measured from this machine over the public internet: an UPPER BOUND\n`);

  report({ label: 'MISS', userId: missUserId, timings: await measure(missUserId) });
  if (hitUserId) {
    report({ label: 'HIT', userId: hitUserId, timings: await measure(hitUserId) });
  } else {
    console.log('HIT    no stored preference row exists yet -- nothing to sample, and');
    console.log('       none was created: this script never writes.');
  }

  console.log('\nBEFORE this unit the three component routes issued NO such read.');
  console.log('The delta is therefore the whole of the number above, once per call.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
