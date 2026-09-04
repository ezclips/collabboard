/**
 * PDF-R6K-H2A -- LOCAL-ONLY backfill of standalone PDF highlights.
 *
 * Creates one standalone highlight for every source_reference that CURRENTLY
 * resolves to a paintable single-page span, using the same planner the tests
 * exercise. It never updates or deletes a source_reference, a padlet or a Note:
 * the only write it performs is an INSERT into knowledge_source_highlights.
 *
 * Convergent rather than merely repeatable. The unique partial index on
 * source_reference_id makes a rerun conflict instead of duplicating, and that
 * conflict is treated here as "already done".
 *
 * Usage (local Supabase stack only):
 *   KNOWLEDGE_HIGHLIGHT_BACKFILL=1 \
 *   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx vite-node scripts/db/backfillKnowledgeSourceHighlights.ts [--dry-run]
 */
import { createClient } from '@supabase/supabase-js';
import { planKnowledgeSourceHighlightBackfill }
  from '../../lib/server/knowledge/knowledgeSourceHighlightBackfill';
import type { SourceReference } from '../../lib/domain/knowledge/knowledgePersistence';
import { asKnowledgeDocumentId, asPostId, asSourceReferenceId } from '../../lib/domain/core/ids';

/** The columns this backfill reads, named so the query results can be typed. */
interface CitationRow {
  readonly id: string;
  readonly target_padlet_id: string;
  readonly source_document_id: string;
  readonly page_start: number;
  readonly page_end: number;
  readonly quote_text: string | null;
  readonly quote_hash: string | null;
  readonly char_start: number | null;
  readonly char_end: number | null;
}

interface PageRow { readonly page_number: number; readonly text: string | null }
interface PadletRow { readonly id: string; readonly metadata: Record<string, unknown> | null }

export interface BackfillSummary {
  readonly planned: number;
  readonly inserted: number;
  readonly alreadyPresent: number;
  readonly skipped: Readonly<Record<string, number>>;
}

/**
 * Three guards, because this writes rows and a mistake would be a mistake
 * against real annotations. The third is the decisive one: a hosted project URL
 * can never satisfy it, so the script is structurally incapable of reaching
 * production no matter what is exported into its environment.
 */
export function assertLocalBackfillAllowed(env: NodeJS.ProcessEnv): string {
  if (env.KNOWLEDGE_HIGHLIGHT_BACKFILL !== '1') {
    throw new Error('Refusing to run: set KNOWLEDGE_HIGHLIGHT_BACKFILL=1 to confirm.');
  }
  const url = env.SUPABASE_URL ?? '';
  if (!url || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Refusing to run: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  }
  const { hostname } = new URL(url);
  if (!['127.0.0.1', 'localhost', '::1'].includes(hostname)) {
    throw new Error(
      `Refusing to run: ${hostname} is not a local Supabase stack. `
      + 'This backfill is LOCAL ONLY; production rollout follows a separate review.',
    );
  }
  return url;
}

export async function runBackfill(
  env: NodeJS.ProcessEnv,
  options: { readonly dryRun: boolean },
): Promise<BackfillSummary> {
  const url = assertLocalBackfillAllowed(env);
  const db = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

  const documents = await db.from('knowledge_documents').select('id');
  if (documents.error) throw new Error(documents.error.message);

  let planned = 0;
  let inserted = 0;
  let alreadyPresent = 0;
  const skipped: Record<string, number> = {};

  for (const document of documents.data ?? []) {
    const [references, pages] = await Promise.all([
      db.from('source_references')
        .select('id, target_padlet_id, source_document_id, page_start, page_end, '
          + 'quote_text, quote_hash, char_start, char_end')
        .eq('source_document_id', document.id),
      db.from('knowledge_pages').select('page_number, text').eq('document_id', document.id),
    ]);
    if (references.error) throw new Error(references.error.message);
    if (pages.error) throw new Error(pages.error.message);
    const citations = (references.data ?? []) as unknown as CitationRow[];
    const pageRows = (pages.data ?? []) as unknown as PageRow[];
    if (citations.length === 0) continue;

    // The citing Notes' colours -- the renderer's third input, and the only
    // place a highlight's seed colour can come from.
    const padletIds = [...new Set(citations.map((row) => row.target_padlet_id))];
    const padlets = await db.from('padlets').select('id, metadata').in('id', padletIds);
    if (padlets.error) throw new Error(padlets.error.message);
    const noteColors = new Map(
      ((padlets.data ?? []) as unknown as PadletRow[]).map((row) => {
        const metadata = (row.metadata ?? {}) as Record<string, unknown>;
        return [String(row.id), {
          topStrip: typeof metadata.topStrip === 'string' ? metadata.topStrip : undefined,
          cardColor: typeof metadata.cardColor === 'string' ? metadata.cardColor : undefined,
        }];
      }),
    );

    const plan = planKnowledgeSourceHighlightBackfill({
      references: citations.map((row): SourceReference => ({
        id: asSourceReferenceId(String(row.id)),
        targetPadletId: asPostId(String(row.target_padlet_id)),
        sourceDocumentId: asKnowledgeDocumentId(String(row.source_document_id)),
        pageStart: row.page_start,
        pageEnd: row.page_end,
        quoteText: row.quote_text,
        quoteHash: row.quote_hash,
        charStart: row.char_start,
        charEnd: row.char_end,
        // Not read by the planner; a region reference carries no text span and
        // is skipped as page_only regardless.
        region: null,
        locator: null,
        createdAt: '',
      })),
      pages: pageRows.map((row) => ({
        pageNumber: row.page_number,
        text: row.text ?? '',
      })),
      noteColors,
    });

    planned += plan.create.length;
    for (const skip of plan.skipped) {
      skipped[skip.reason] = (skipped[skip.reason] ?? 0) + 1;
    }
    if (options.dryRun) continue;

    for (const row of plan.create) {
      // created_by stays NULL: the highlight was authored by whoever made the
      // citation, which source_references does not record, and attributing it
      // to the operator running this script would be a fabrication.
      const insert = await db.from('knowledge_source_highlights').insert({
        source_document_id: row.sourceDocumentId,
        page_number: row.pageNumber,
        char_start: row.charStart,
        char_end: row.charEnd,
        quote_text: row.quoteText,
        quote_hash: null,
        color: row.color,
        created_by: null,
        source_reference_id: row.sourceReferenceId,
      });
      if (!insert.error) { inserted += 1; continue; }
      if (/duplicate key|unique/i.test(insert.error.message)) { alreadyPresent += 1; continue; }
      throw new Error(insert.error.message);
    }
  }

  return { planned, inserted, alreadyPresent, skipped };
}
