/**
 * PDF-R6K-H2A -- LOCAL-ONLY backfill CLI.
 *
 * Usage (local Supabase stack only):
 *   KNOWLEDGE_HIGHLIGHT_BACKFILL=1 \
 *   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx vite-node scripts/db/backfillKnowledgeSourceHighlights.ts [--dry-run]
 *
 * All logic, and all three refusal guards, live in the runner module so they
 * can be tested without executing anything.
 */
import { runBackfill } from './knowledgeSourceHighlightBackfillRunner';

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const summary = await runBackfill(process.env, { dryRun });
  console.log(dryRun ? '--- DRY RUN ---' : '--- BACKFILL ---');
  console.log(`planned          ${summary.planned}`);
  console.log(`inserted         ${summary.inserted}`);
  console.log(`already present  ${summary.alreadyPresent}`);
  console.log('skipped:');
  for (const [reason, count] of Object.entries(summary.skipped).sort()) {
    console.log(`  ${reason.padEnd(16)} ${count}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
