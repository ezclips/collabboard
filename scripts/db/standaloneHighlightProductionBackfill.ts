/**
 * PDF-R6K-H3B -- controlled PRODUCTION backfill of standalone PDF highlights.
 *
 * Purpose-built for one release, never a generic migration tool; the local-only
 * runner (knowledgeSourceHighlightBackfillRunner.ts) is unchanged.
 *
 * RELEASE ORDER IS LOAD-BEARING:
 *   1. apply + verify the H3A database rollout
 *   2. deploy the ATOMIC WRITER while the OLD citation-derived renderer is live
 *   3. PLAN -> record PLAN_HASH -> EXECUTE with that hash -> VERIFY
 *   4. only on RENDERER_BACKFILL_READY=YES may the standalone renderer deploy
 *
 * Step 2 closes the race: until every writer creates the citation and its mark
 * atomically, a new citation-only gap can appear after the plan was taken, and
 * the renderer would paint nothing where a user sees a mark. The plan comes from
 * the SAME authority the reader uses -- planKnowledgeSourceHighlightBackfill
 * over resolveKnowledgeSourceSpan and the Note accent-colour rule; none of it is
 * reimplemented here or in SQL.
 *
 * Usage (see the runbook beside the rollout SQL):
 *   COLLABBOARD_HIGHLIGHT_BACKFILL_DATABASE_URL=... \
 *   COLLABBOARD_HIGHLIGHT_BACKFILL_DENY_DOCUMENT_NAMES=... \
 *   npx vite-node scripts/db/standaloneHighlightProductionBackfill.ts [plan|execute|verify]
 */
import { createHash } from 'node:crypto';
import { Client } from 'pg';
import { planKnowledgeSourceHighlightBackfill }
  from '../../lib/server/knowledge/knowledgeSourceHighlightBackfill';
import type { PlannedKnowledgeSourceHighlight }
  from '../../lib/server/knowledge/knowledgeSourceHighlightBackfill';
import type { SourceReference } from '../../lib/domain/knowledge/knowledgePersistence';
import type { KnowledgeSourceNoteColorFields }
  from '../../lib/domain/knowledge/knowledgeSourceHighlightColor';
import { asKnowledgeDocumentId, asPostId, asSourceReferenceId } from '../../lib/domain/core/ids';

export const BACKFILL_URL_ENV = 'COLLABBOARD_HIGHLIGHT_BACKFILL_DATABASE_URL';
export const DENY_NAMES_ENV = 'COLLABBOARD_HIGHLIGHT_BACKFILL_DENY_DOCUMENT_NAMES';
export const EXPECTED_HASH_ENV = 'COLLABBOARD_HIGHLIGHT_BACKFILL_EXPECTED_PLAN_HASH';
export const ATOMIC_WRITER_ENV = 'COLLABBOARD_HIGHLIGHT_ATOMIC_WRITER_CONFIRMED';
export const ATOMIC_WRITER_TOKEN = 'PDF-R6K-H2B-ATOMIC-WRITER-ACTIVE';
export const APPLICATION_NAME = 'collabboard-pdf-highlight-backfill-20260904';
export const PLAN_PAYLOAD_VERSION = 'PDF_R6K_H3B_PLAN_V1';
/** Stable, release-specific lock identity. Derived, so the string is the record. */
export const ADVISORY_LOCK_SUBJECT = 'collabboard:standalone-highlight-backfill:20260904';

export type BackfillMode = 'plan' | 'execute' | 'verify';

/** Roles that answer to RLS. This backfill is trusted tooling, never one of them. */
const APPLICATION_ROLES = new Set(['anon', 'authenticated', 'authenticator']);
/** Hosts that mean "this is not production". No flag turns this off. */
const LOCAL_HOSTS = new Set([
  'localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0', 'host.docker.internal',
  'db', 'postgres', 'supabase_db_collabboard',
]);
/** Supavisor transaction mode. It cannot hold one backend session across steps. */
const TRANSACTION_POOLER_PORT = '6543';
const SESSION_PORT = '5432';

export const REQUIRED_INSERT_COLUMNS = [
  'char_end', 'char_start', 'color', 'page_number',
  'quote_hash', 'quote_text', 'source_document_id', 'source_reference_id',
] as const;

export interface BackfillTarget {
  readonly connectionString: string;
  /** Host only, for the operator log. The connection string is never printed. */
  readonly host: string;
}

/**
 * Refuses anything that is not a production PostgreSQL session BEFORE a client
 * exists. Only the dedicated variable is read: a stray DATABASE_URL must never
 * become the target, and `.env.local` is not loaded.
 */
export function resolveBackfillTarget(env: NodeJS.ProcessEnv): BackfillTarget {
  const raw = (env[BACKFILL_URL_ENV] ?? '').trim();
  if (raw === '') {
    throw new Error(
      `Refusing to run: ${BACKFILL_URL_ENV} is required. This tool never falls back to `
      + 'DATABASE_URL, SUPABASE_URL, SUPABASE_DB_URL, NEXT_PUBLIC_* or .env.local.',
    );
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // The value itself is never echoed; a malformed URL can still carry a password.
    throw new Error(`Refusing to run: ${BACKFILL_URL_ENV} is not a valid connection URL.`);
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error(`Refusing to run: ${BACKFILL_URL_ENV} must be a postgres:// connection URL.`);
  }

  const host = url.hostname.toLowerCase();
  if (LOCAL_HOSTS.has(host) || host.endsWith('.local') || host.endsWith('.localhost')) {
    throw new Error(
      `Refusing to run: ${host} is a local or test target. The production CLI has no `
      + 'override; local integration runs through the internal executor seam instead.',
    );
  }

  // Transaction-mode pooling hands each statement a different backend, so the
  // lock, the snapshot and the inserts could land on three sessions.
  if (url.port === TRANSACTION_POOLER_PORT) {
    throw new Error(
      `Refusing to run: port ${TRANSACTION_POOLER_PORT} is Supavisor TRANSACTION mode, which `
      + `cannot hold one backend session. Use direct PostgreSQL or SESSION mode on ${SESSION_PORT}.`,
    );
  }
  if (host.endsWith('.pooler.supabase.com') && url.port !== SESSION_PORT) {
    throw new Error(
      `Refusing to run: a Supabase pooler host requires the SESSION-mode port ${SESSION_PORT}.`,
    );
  }

  const sslmode = (url.searchParams.get('sslmode') ?? '').toLowerCase();
  if (['disable', 'allow', 'prefer'].includes(sslmode)) {
    throw new Error(
      `Refusing to run: sslmode=${sslmode} does not guarantee an encrypted connection. `
      + 'Use sslmode=require (or stricter) for a production backfill.',
    );
  }

  return { connectionString: raw, host };
}

/** One pinned backend session. Never a Pool: its operations can hop connections. */
export function createBackfillClient(target: BackfillTarget): Client {
  return new Client({
    connectionString: target.connectionString,
    application_name: APPLICATION_NAME,
    ssl: { rejectUnauthorized: true },
  });
}

/** The surface the executor needs, so tests can drive a local scratch client. */
export interface BackfillSession {
  query(sql: string, values?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export interface BackfillOptions {
  readonly mode: BackfillMode;
  readonly denyDocumentNames: readonly string[];
  readonly expectedPlanHash?: string;
  readonly atomicWriterToken?: string;
}

export type ReconciliationClass = 'EXACT_EXISTING' | 'TO_CREATE' | 'MISMATCH';

export interface BackfillSummary {
  readonly mode: BackfillMode;
  readonly schemaReady: boolean;
  readonly adminRoleReady: boolean;
  readonly totalReferences: number;
  readonly paintable: number;
  readonly exactExisting: number;
  readonly toCreate: number;
  readonly mismatches: number;
  readonly skippedPageOnly: number;
  readonly skippedRegion: number;
  readonly skippedCrossPage: number;
  readonly skippedUnresolved: number;
  readonly skippedNoPageText: number;
  readonly protectedBlocked: number;
  readonly documentsConsidered: number;
  readonly pagesConsidered: number;
  readonly planHash: string;
  readonly inserted: number;
  readonly committed: boolean;
  readonly mutated: boolean;
  readonly rendererBackfillReady: boolean;
  readonly noWork: boolean;
}

interface DocumentRow { id: string; original_filename: string | null; candidate_references: string }
interface CitationRow {
  id: string; target_padlet_id: string; source_document_id: string;
  page_start: number; page_end: number;
  quote_text: string | null; quote_hash: string | null;
  char_start: number | null; char_end: number | null; has_region: boolean;
}
interface PageRow { document_id: string; page_number: number; text: string | null }
interface HighlightRow {
  id: string; source_document_id: string; source_reference_id: string;
  page_number: number; char_start: number; char_end: number;
  quote_text: string; quote_hash: string | null; color: string;
}

/** One decision per candidate citation. The hash covers all of them, not just writes. */
interface Decision {
  readonly referenceId: string;
  readonly classification: ReconciliationClass | 'SKIPPED';
  readonly documentId: string;
  readonly page: number | null;
  readonly charStart: number | null;
  readonly charEnd: number | null;
  readonly color: string | null;
  readonly quoteDigest: string | null;
  readonly existingHighlightId: string | null;
  readonly reason: string | null;
}

const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

/** Two int4 keys for pg_try_advisory_xact_lock, derived from the release subject. */
export function advisoryLockKeys(subject: string = ADVISORY_LOCK_SUBJECT): [number, number] {
  const digest = createHash('sha256').update(subject, 'utf8').digest();
  return [digest.readInt32BE(0), digest.readInt32BE(4)];
}

const normaliseName = (value: string) => value.trim().toLowerCase();

/**
 * Deterministic plan identity: sorted, versioned, content-free. Quote text is
 * reduced to a digest, so the payload can never carry a passage or a filename.
 */
export function computePlanHash(decisions: readonly Decision[]): string {
  const lines = decisions
    .map((d) => JSON.stringify([
      d.referenceId, d.classification, d.documentId, d.page, d.charStart, d.charEnd,
      d.color, d.quoteDigest, d.existingHighlightId, d.reason,
    ]))
    .sort();
  return sha256([PLAN_PAYLOAD_VERSION, ...lines].join('\n'));
}

const ROLE_CAPABILITY_SQL = `
SELECT current_user AS role,
  COALESCE(r.rolsuper, false) OR COALESCE(r.rolbypassrls, false) AS trusted_maintenance,
  COALESCE(has_table_privilege(current_user, 'public.knowledge_source_highlights', 'INSERT'), false) AS table_insert,
  COALESCE(has_column_privilege(current_user, 'public.knowledge_source_highlights', 'created_by', 'INSERT'), false) AS created_by_insert,
  COALESCE(has_column_privilege(current_user, 'public.knowledge_source_highlights', 'quote_hash', 'INSERT'), false) AS quote_hash_insert,
  COALESCE(has_table_privilege(current_user, 'public.source_references', 'SELECT'), false) AS read_references,
  COALESCE(has_table_privilege(current_user, 'public.knowledge_pages', 'SELECT'), false) AS read_pages,
  COALESCE(has_table_privilege(current_user, 'public.knowledge_documents', 'SELECT'), false) AS read_documents,
  COALESCE(has_table_privilege(current_user, 'public.padlets', 'SELECT'), false) AS read_padlets
  FROM pg_roles r WHERE r.rolname = current_user`;

/**
 * Capability, not a name: the repository documents no single production role. It
 * asks what the connection can DO -- read the migration inputs, and insert a
 * highlight naming `created_by` and `quote_hash`, which the ordinary
 * `authenticated` grant cannot (it holds neither column nor table INSERT).
 * `trusted_maintenance` (superuser or BYPASSRLS) is what makes this maintenance
 * rather than an operation answering to application RLS. Reads role metadata
 * only: nothing grants, elevates, SETs ROLE or touches RLS.
 */
async function assertTrustedRole(session: BackfillSession): Promise<void> {
  const { rows } = await session.query(ROLE_CAPABILITY_SQL);
  const row = rows[0];
  if (row === undefined) throw new Error('Refusing to run: ADMIN_ROLE_READY=NO (no such role).');
  if (APPLICATION_ROLES.has(String(row.role))) {
    throw new Error(
      'Refusing to run: ADMIN_ROLE_READY=NO. This connection uses an application data-API role, '
      + 'which answers to RLS and cannot write authorship. Use the approved administrative '
      + 'session connection supplied for this release.',
    );
  }
  const missing = Object.entries(row)
    .filter(([key, value]) => key !== 'role' && value !== true).map(([key]) => key);
  if (missing.length > 0) {
    // The role name is deliberately absent from the message.
    throw new Error(
      `Refusing to run: ADMIN_ROLE_READY=NO. Missing capabilities: ${missing.sort().join(', ')}.`,
    );
  }
}

const FINGERPRINT_SQL = `
SELECT
  to_regclass('public.knowledge_source_highlights') IS NOT NULL AS table_exists,
  COALESCE((SELECT relrowsecurity FROM pg_class
             WHERE oid = to_regclass('public.knowledge_source_highlights')), false) AS rls_enabled,
  NOT EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='knowledge_source_highlights'
                 AND column_name='board_id') AS no_board_id,
  COALESCE((SELECT column_default FROM information_schema.columns
             WHERE table_schema='public' AND table_name='knowledge_source_highlights'
               AND column_name='created_by') LIKE '%auth.uid()%', false) AS creator_default,
  EXISTS (SELECT 1 FROM information_schema.table_privileges
           WHERE table_schema='public' AND table_name='knowledge_source_highlights'
             AND grantee='authenticated' AND privilege_type='SELECT') AS auth_select,
  EXISTS (SELECT 1 FROM information_schema.table_privileges
           WHERE table_schema='public' AND table_name='knowledge_source_highlights'
             AND grantee='authenticated' AND privilege_type='DELETE') AS auth_delete,
  NOT EXISTS (SELECT 1 FROM information_schema.table_privileges
               WHERE table_schema='public' AND table_name='knowledge_source_highlights'
                 AND grantee IN ('authenticated','anon')
                 AND privilege_type IN ('INSERT','UPDATE','TRUNCATE')) AS no_table_write,
  COALESCE((SELECT array_agg(column_name::text ORDER BY column_name::text)
              FROM information_schema.column_privileges
             WHERE table_schema='public' AND table_name='knowledge_source_highlights'
               AND grantee='authenticated' AND privilege_type='INSERT') = $1::text[], false)
    AS insert_columns,
  COALESCE((SELECT array_agg(column_name::text ORDER BY column_name::text)
              FROM information_schema.column_privileges
             WHERE table_schema='public' AND table_name='knowledge_source_highlights'
               AND grantee='authenticated' AND privilege_type='UPDATE') = ARRAY['color'], false)
    AS update_columns,
  NOT EXISTS (SELECT 1 FROM information_schema.column_privileges
               WHERE table_schema='public' AND table_name='knowledge_source_highlights'
                 AND grantee='anon') AS anon_no_columns,
  EXISTS (SELECT 1 FROM pg_trigger
           WHERE tgrelid = to_regclass('public.knowledge_source_highlights')
             AND NOT tgisinternal
             AND tgname='knowledge_source_highlights_origin_check') AS origin_trigger,
  COALESCE((SELECT prosecdef FROM pg_proc
             WHERE oid = to_regprocedure(
               'public.knowledge_source_highlight_origin_matches_document()')), false)
    AS origin_definer,
  NOT COALESCE(has_function_privilege('authenticated', to_regprocedure(
    'public.knowledge_source_highlight_origin_matches_document()'), 'EXECUTE'), true)
    AS origin_not_client_callable,
  to_regprocedure($2) IS NOT NULL AS rpc_present,
  NOT COALESCE((SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure($2)), true)
    AS rpc_invoker,
  COALESCE(has_function_privilege('authenticated', to_regprocedure($2), 'EXECUTE'), false)
    AS rpc_authenticated,
  NOT COALESCE(has_function_privilege('anon', to_regprocedure($2), 'EXECUTE'), true)
    AS rpc_not_anon,
  NOT COALESCE(has_function_privilege('public', to_regprocedure($2), 'EXECUTE'), true)
    AS rpc_not_public`;

const RPC_SIGNATURE = 'public.create_knowledge_source_citation(uuid, uuid, integer, integer, '
  + 'text, text, integer, integer, double precision, double precision, double precision, '
  + 'double precision, text)';

/**
 * Fails closed unless the whole reviewed H3A posture is present. Runs BEFORE any
 * citation or page content is read.
 */
export async function assertH3AFingerprint(session: BackfillSession): Promise<void> {
  const { rows } = await session.query(FINGERPRINT_SQL, [[...REQUIRED_INSERT_COLUMNS], RPC_SIGNATURE]);
  const row = rows[0] ?? {};
  const failed = Object.entries(row).filter(([, value]) => value !== true).map(([key]) => key);
  if (failed.length > 0) {
    throw new Error(
      `Refusing to run: the H3A rollout is not fully present or has drifted. Failing checks: `
      + `${failed.sort().join(', ')}.`,
    );
  }
}

/**
 * The whole mode, on ONE session, in ONE transaction. PLAN and VERIFY are READ
 * ONLY and roll back; EXECUTE is the only mutating path and commits only when
 * every planned insert succeeded.
 */
export async function runStandaloneHighlightBackfill(
  session: BackfillSession,
  options: BackfillOptions,
): Promise<BackfillSummary> {
  const denyNames = new Set(
    options.denyDocumentNames.map(normaliseName).filter((name) => name !== ''),
  );
  if (denyNames.size === 0) {
    throw new Error(
      `Refusing to run: ${DENY_NAMES_ENV} must name at least one protected document. `
      + 'An empty denylist would let this tool read every document in the project.',
    );
  }

  // Operator acknowledgements, checked before a write transaction is opened.
  if (options.mode === 'execute') {
    if (options.atomicWriterToken !== ATOMIC_WRITER_TOKEN) {
      throw new Error(
        `Refusing to execute: set ${ATOMIC_WRITER_ENV}=${ATOMIC_WRITER_TOKEN} only after runtime `
        + 'verification proves every production writer creates the citation and its highlight '
        + 'atomically while the old citation renderer is still live.',
      );
    }
    if (!options.expectedPlanHash) {
      throw new Error(`Refusing to execute: ${EXPECTED_HASH_ENV} is required.`);
    }
  }

  const readWrite = options.mode === 'execute' ? 'READ WRITE' : 'READ ONLY';
  await session.query(`BEGIN ISOLATION LEVEL REPEATABLE READ ${readWrite}`);
  let committed = false;
  try {
    if (options.mode === 'execute') {
      const [lockA, lockB] = advisoryLockKeys();
      const lock = await session.query(
        'SELECT pg_try_advisory_xact_lock($1::int, $2::int) AS acquired', [lockA, lockB],
      );
      if (lock.rows[0]?.acquired !== true) {
        throw new Error(
          'Refusing to execute: another backfill run holds the release advisory lock. '
          + 'This lock is never waited on; retry once the other run has finished.',
        );
      }
    }

    await assertTrustedRole(session);
    await assertH3AFingerprint(session);

    const plan = await buildPlan(session, denyNames);
    if (plan.protectedBlocked > 0) {
      throw new Error(
        `Refusing to run: ${plan.protectedBlocked} protected document(s) carry candidate `
        + 'citations. Their page text was NOT read. Resolve them out of band before backfilling.',
      );
    }

    let inserted = 0;
    if (options.mode === 'execute') {
      if (plan.planHash !== options.expectedPlanHash) {
        throw new Error(
          'Refusing to execute: the plan recomputed inside this transaction does not match the '
          + `expected plan hash (expected ${options.expectedPlanHash}, actual ${plan.planHash}). `
          + 'The data drifted since PLAN; take a fresh plan.',
        );
      }
      if (plan.mismatches > 0) {
        throw new Error(
          `Refusing to execute: ${plan.mismatches} existing highlight(s) disagree with the plan. `
          + 'This tool never repairs or overwrites an existing row.',
        );
      }
      inserted = await insertPlanned(session, plan.toCreateRows);
      if (inserted !== plan.toCreateRows.length) {
        throw new Error(
          `Refusing to commit: inserted ${inserted} of ${plan.toCreateRows.length} planned rows.`,
        );
      }
      await session.query('COMMIT');
      committed = true;
    } else {
      await session.query('ROLLBACK');
    }

    const gaps = plan.toCreateRows.length === 0 && plan.mismatches === 0
      && plan.protectedBlocked === 0;
    return {
      mode: options.mode,
      schemaReady: true,
      adminRoleReady: true,
      totalReferences: plan.totalReferences,
      paintable: plan.paintable,
      exactExisting: plan.exactExisting,
      toCreate: plan.toCreateRows.length,
      mismatches: plan.mismatches,
      skippedPageOnly: plan.skips.pageOnly,
      skippedRegion: plan.skips.region,
      skippedCrossPage: plan.skips.crossPage,
      skippedUnresolved: plan.skips.unresolved,
      skippedNoPageText: plan.skips.noPageText,
      protectedBlocked: plan.protectedBlocked,
      documentsConsidered: plan.documentsConsidered,
      pagesConsidered: plan.pagesConsidered,
      planHash: plan.planHash,
      inserted,
      committed,
      mutated: committed && inserted > 0,
      rendererBackfillReady: gaps,
      noWork: options.mode === 'execute' && plan.toCreateRows.length === 0,
    };
  } catch (error) {
    if (!committed) {
      // The transaction may already be aborted; the original failure wins.
      try { await session.query('ROLLBACK'); } catch { /* the original error wins */ }
    }
    throw error;
  }
}

interface PlanResult {
  readonly totalReferences: number;
  readonly paintable: number;
  readonly exactExisting: number;
  readonly mismatches: number;
  readonly toCreateRows: readonly PlannedKnowledgeSourceHighlight[];
  readonly skips: {
    pageOnly: number; region: number; crossPage: number; unresolved: number; noPageText: number;
  };
  readonly protectedBlocked: number;
  readonly documentsConsidered: number;
  readonly pagesConsidered: number;
  readonly planHash: string;
}

/**
 * Metadata, then denylist, then page text. That ORDER is the protected-document
 * guarantee: a denied document's passages are never read, hashed or reported.
 */
async function buildPlan(session: BackfillSession, denyNames: ReadonlySet<string>): Promise<PlanResult> {
  // METADATA ONLY: candidates are counted in SQL, so a denied document never
  // has its quote text pulled into this process.
  const documents = (await session.query(`
    SELECT d.id, d.original_filename,
           (SELECT count(*) FROM public.source_references r
             WHERE r.source_document_id = d.id
               AND r.char_start IS NOT NULL AND r.char_end IS NOT NULL
               AND r.page_start = r.page_end) AS candidate_references
      FROM public.knowledge_documents d`)).rows as unknown as DocumentRow[];

  const denied = documents.filter((d) => denyNames.has(normaliseName(d.original_filename ?? '')));
  const protectedBlocked = denied.filter((d) => Number(d.candidate_references) > 0).length;
  if (protectedBlocked > 0) {
    return emptyPlan(protectedBlocked, documents.length);
  }

  const deniedIds = new Set(denied.map((d) => d.id));
  const allowedIds = documents.map((d) => d.id).filter((id) => !deniedIds.has(id));
  if (allowedIds.length === 0) return emptyPlan(0, documents.length);

  const citations = (await session.query(`
    SELECT id, target_padlet_id, source_document_id, page_start, page_end,
           quote_text, quote_hash, char_start, char_end,
           (region_x IS NOT NULL OR region_width IS NOT NULL) AS has_region
      FROM public.source_references WHERE source_document_id = ANY($1::uuid[])`,
  [allowedIds])).rows as unknown as CitationRow[];

  const pages = (await session.query(
    'SELECT document_id, page_number, text FROM public.knowledge_pages '
    + 'WHERE document_id = ANY($1::uuid[])', [allowedIds],
  )).rows as unknown as PageRow[];

  const padletIds = [...new Set(citations.map((c) => c.target_padlet_id))];
  const padlets = padletIds.length === 0 ? [] : (await session.query(
    'SELECT id, metadata FROM public.padlets WHERE id = ANY($1::uuid[])', [padletIds],
  )).rows as unknown as { id: string; metadata: Record<string, unknown> | null }[];
  const noteColors = new Map<string, KnowledgeSourceNoteColorFields>(padlets.map((row) => {
    const metadata = row.metadata ?? {};
    return [String(row.id), {
      topStrip: typeof metadata.topStrip === 'string' ? metadata.topStrip : undefined,
      cardColor: typeof metadata.cardColor === 'string' ? metadata.cardColor : undefined,
    }];
  }));

  const referenceIds = citations.map((c) => c.id);
  const existing = referenceIds.length === 0 ? [] : (await session.query(`
    SELECT id, source_document_id, source_reference_id, page_number, char_start, char_end,
           quote_text, quote_hash, color
      FROM public.knowledge_source_highlights
     WHERE source_reference_id = ANY($1::uuid[])`, [referenceIds])).rows as unknown as HighlightRow[];

  const existingByReference = new Map<string, HighlightRow[]>();
  for (const row of existing) {
    const list = existingByReference.get(row.source_reference_id) ?? [];
    list.push(row);
    existingByReference.set(row.source_reference_id, list);
  }

  const citationsByDocument = groupBy(citations, (c) => c.source_document_id);
  const pagesByDocument = groupBy(pages, (p) => p.document_id);
  const hasRegion = new Map(citations.map((c) => [c.id, c.has_region === true]));
  const citationHash = new Map(citations.map((c) => [c.id, c.quote_hash]));

  const decisions: Decision[] = [];
  const toCreateRows: PlannedKnowledgeSourceHighlight[] = [];
  const skips = { pageOnly: 0, region: 0, crossPage: 0, unresolved: 0, noPageText: 0 };
  let exactExisting = 0;
  let mismatches = 0;

  for (const documentId of allowedIds) {
    const documentCitations = citationsByDocument.get(documentId) ?? [];
    if (documentCitations.length === 0) continue;
    const documentPages = pagesByDocument.get(documentId) ?? [];

    const plan = planKnowledgeSourceHighlightBackfill({
      references: documentCitations.map(toDomainReference),
      pages: documentPages.map((p) => ({ pageNumber: p.page_number, text: p.text ?? '' })),
      noteColors,
    });

    for (const skip of plan.skipped) {
      // The planner owns classification; `has_region` only splits its page_only
      // bucket for the operator, never changing what is paintable.
      const region = skip.reason === 'page_only' && hasRegion.get(skip.sourceReferenceId) === true;
      if (region) skips.region += 1;
      else if (skip.reason === 'page_only') skips.pageOnly += 1;
      else if (skip.reason === 'cross_page') skips.crossPage += 1;
      else if (skip.reason === 'no_page_text') skips.noPageText += 1;
      else skips.unresolved += 1;
      decisions.push({
        referenceId: skip.sourceReferenceId, classification: 'SKIPPED', documentId,
        page: null, charStart: null, charEnd: null, color: null, quoteDigest: null,
        existingHighlightId: null, reason: region ? 'region' : skip.reason,
      });
    }

    for (const planned of plan.create) {
      const rows = existingByReference.get(planned.sourceReferenceId) ?? [];
      const verdict = reconcile(planned, rows, citationHash.get(planned.sourceReferenceId) ?? null);
      if (verdict.classification === 'TO_CREATE') toCreateRows.push(planned);
      else if (verdict.classification === 'EXACT_EXISTING') exactExisting += 1;
      else mismatches += 1;
      decisions.push({
        referenceId: planned.sourceReferenceId,
        classification: verdict.classification,
        documentId: planned.sourceDocumentId,
        page: planned.pageNumber,
        charStart: planned.charStart,
        charEnd: planned.charEnd,
        color: planned.color,
        quoteDigest: sha256(planned.quoteText),
        existingHighlightId: verdict.existingId,
        reason: verdict.reason,
      });
    }
  }

  const paintable = exactExisting + mismatches + toCreateRows.length;
  return {
    totalReferences: citations.length,
    paintable,
    exactExisting,
    mismatches,
    toCreateRows,
    skips,
    protectedBlocked: 0,
    documentsConsidered: allowedIds.length,
    pagesConsidered: pages.length,
    planHash: computePlanHash(decisions),
  };
}

function emptyPlan(protectedBlocked: number, documentsConsidered: number): PlanResult {
  return {
    totalReferences: 0, paintable: 0, exactExisting: 0, mismatches: 0, toCreateRows: [],
    skips: { pageOnly: 0, region: 0, crossPage: 0, unresolved: 0, noPageText: 0 },
    protectedBlocked, documentsConsidered, pagesConsidered: 0,
    planHash: computePlanHash([]),
  };
}

/**
 * Canonical comparison. `quote_hash` corroborates: legacy rows carry NULL and
 * atomic-writer rows carry the citation's hash, so a NULL on either side is
 * never a disagreement -- but two present-and-different hashes are.
 */
function reconcile(
  planned: PlannedKnowledgeSourceHighlight,
  rows: readonly HighlightRow[],
  expectedQuoteHash: string | null,
): { classification: ReconciliationClass; existingId: string | null; reason: string | null } {
  if (rows.length === 0) return { classification: 'TO_CREATE', existingId: null, reason: null };
  // The unique partial origin index should make this impossible; if it ever
  // happens, fail closed rather than pick a winner.
  if (rows.length > 1) {
    return { classification: 'MISMATCH', existingId: null, reason: 'multiple_origin_rows' };
  }

  const row = rows[0];
  const differs: string[] = [];
  if (row.source_document_id !== planned.sourceDocumentId) differs.push('document');
  if (row.page_number !== planned.pageNumber) differs.push('page');
  if (row.char_start !== planned.charStart) differs.push('char_start');
  if (row.char_end !== planned.charEnd) differs.push('char_end');
  if (row.quote_text !== planned.quoteText) differs.push('quote_text');
  if (row.color !== planned.color) differs.push('color');
  if (row.quote_hash !== null && expectedQuoteHash !== null && row.quote_hash !== expectedQuoteHash) {
    differs.push('quote_hash');
  }
  return differs.length === 0
    ? { classification: 'EXACT_EXISTING', existingId: row.id, reason: null }
    : { classification: 'MISMATCH', existingId: row.id, reason: differs.sort().join('+') };
}

/**
 * The ONLY write this tool performs. `created_by` stays NULL: the mark was
 * authored by whoever made the citation, which source_references does not
 * record, and naming the operator would be a fabrication. `quote_hash` stays
 * NULL too -- inventing one would disguise a migrated row as an atomic write.
 */
async function insertPlanned(
  session: BackfillSession,
  rows: readonly PlannedKnowledgeSourceHighlight[],
): Promise<number> {
  let inserted = 0;
  for (const row of rows) {
    const result = await session.query(`
      INSERT INTO public.knowledge_source_highlights
        (source_document_id, page_number, char_start, char_end,
         quote_text, quote_hash, color, created_by, source_reference_id)
      VALUES ($1::uuid, $2::int, $3::int, $4::int, $5::text, NULL, $6::text, NULL, $7::uuid)
      RETURNING id`,
    [row.sourceDocumentId, row.pageNumber, row.charStart, row.charEnd,
      row.quoteText, row.color, row.sourceReferenceId]);
    inserted += result.rows.length;
  }
  return inserted;
}

function toDomainReference(row: CitationRow): SourceReference {
  return {
    id: asSourceReferenceId(String(row.id)),
    targetPadletId: asPostId(String(row.target_padlet_id)),
    sourceDocumentId: asKnowledgeDocumentId(String(row.source_document_id)),
    pageStart: row.page_start,
    pageEnd: row.page_end,
    quoteText: row.quote_text,
    quoteHash: row.quote_hash,
    charStart: row.char_start,
    charEnd: row.char_end,
    // Neither is read by the span resolver; a region citation carries no
    // offsets and the planner skips it as page_only regardless.
    region: null,
    locator: null,
    createdAt: '',
  };
}

function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const list = map.get(key(row)) ?? [];
    list.push(row);
    map.set(key(row), list);
  }
  return map;
}

/** Counts and hashes only. No filename, quote, page text or Note content. */
export function formatSummary(summary: BackfillSummary): string {
  const lines = [
    `MODE=${summary.mode.toUpperCase()}`,
    `SCHEMA_READY=${summary.schemaReady ? 'YES' : 'NO'}`,
    `ADMIN_ROLE_READY=${summary.adminRoleReady ? 'YES' : 'NO'}`,
    `TOTAL_REFERENCES=${summary.totalReferences}`,
    `PAINTABLE=${summary.paintable}`,
    `EXACT_EXISTING=${summary.exactExisting}`,
    `TO_CREATE=${summary.toCreate}`,
    `MISMATCHES=${summary.mismatches}`,
    `SKIPPED_PAGE_ONLY=${summary.skippedPageOnly}`,
    `SKIPPED_REGION=${summary.skippedRegion}`,
    `SKIPPED_CROSS_PAGE=${summary.skippedCrossPage}`,
    `SKIPPED_UNRESOLVED=${summary.skippedUnresolved}`,
    `SKIPPED_NO_PAGE_TEXT=${summary.skippedNoPageText}`,
    `PROTECTED_BLOCKED=${summary.protectedBlocked}`,
    `DOCUMENTS_CONSIDERED=${summary.documentsConsidered}`,
    `PAGES_CONSIDERED=${summary.pagesConsidered}`,
    `PLAN_HASH=${summary.planHash}`,
  ];
  if (summary.mode === 'execute') {
    lines.push(`INSERTED=${summary.inserted}`, `COMMITTED=${summary.committed ? 'YES' : 'NO'}`);
    if (summary.noWork) lines.push('NO_WORK=YES');
  }
  if (summary.mode === 'verify') {
    lines.push(`RENDERER_BACKFILL_READY=${summary.rendererBackfillReady ? 'YES' : 'NO'}`);
  }
  lines.push(`MUTATED=${summary.mutated ? 'YES' : 'NO'}`);
  return lines.join('\n');
}

export function parseMode(argv: readonly string[]): BackfillMode {
  const arg = (argv.find((value) => !value.startsWith('-')) ?? 'plan').toLowerCase();
  if (arg === 'plan' || arg === 'execute' || arg === 'verify') return arg;
  throw new Error(`Unknown mode "${arg}". Use plan (default), execute or verify.`);
}

export function parseDenyList(env: NodeJS.ProcessEnv): string[] {
  return (env[DENY_NAMES_ENV] ?? '').split(/[\n,]/).map((name) => name.trim()).filter(Boolean);
}

export async function main(
  argv: readonly string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const mode = parseMode(argv);
  const target = resolveBackfillTarget(env);
  const client = createBackfillClient(target);
  await client.connect();
  try {
    const summary = await runStandaloneHighlightBackfill(client, {
      mode,
      denyDocumentNames: parseDenyList(env),
      expectedPlanHash: env[EXPECTED_HASH_ENV],
      atomicWriterToken: env[ATOMIC_WRITER_ENV],
    });
    return `TARGET_HOST=${target.host}\n${formatSummary(summary)}`;
  } finally {
    await client.end();
  }
}
