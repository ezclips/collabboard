import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

import { aiCreditFeatureLabel } from '@/lib/domain/billing/aiCreditFeatureLabels';

import type { BillingActor } from './stripeBilling';

/**
 * PATCH-344. The AI usage history HTTP edge: the actor's workspace ledger, read
 * through the actor's OWN client so the members-only RLS policy decides. The
 * board titles are read the same way, so a board the viewer cannot open is
 * never named.
 *
 * Injected exactly as `usageRoute` is, so the ordering (auth -> workspace ->
 * membership -> reads) is testable without a database.
 *
 * NO PERSONAL DATA: the response carries no user_id; the client shows "You" or
 * "Another member" from `byYou` alone.
 */

export interface AiCreditUsageRow {
  readonly id: string;
  readonly board_id: string | null;
  readonly user_id: string | null;
  readonly feature: string;
  readonly credits: number;
  readonly bucket: string;
  readonly created_at: string;
}

export interface UsageHistoryEntry {
  readonly id: string;
  readonly createdAt: string;
  readonly feature: string;
  readonly featureLabel: string;
  readonly boardId: string | null;
  readonly boardTitle: string | null;
  readonly boardGone: boolean;
  readonly byYou: boolean;
  readonly credits: number;
  readonly bucket: 'allowance' | 'grant';
}

export interface UsageHistoryResponse {
  readonly entries: UsageHistoryEntry[];
  readonly nextBefore: string | null;
}

export interface UsageHistoryHandlerDependencies {
  getAuthenticatedSession(request: Request): Promise<BillingActor | null>;
  resolveWorkspace(actor: BillingActor): Promise<{ workspaceId: string } | null>;
  /**
   * The actor's role in the workspace, read through the actor's OWN client, or
   * null when the actor is not a member. A failure THROWS so the route answers
   * 503 rather than mistaking an outage for a non-member.
   */
  workspaceRole(actor: BillingActor, workspaceId: string): Promise<string | null>;
  /** The ledger page, via the actor's own client (RLS). Asks for limit+1. */
  readLedger(
    actor: BillingActor,
    workspaceId: string,
    params: { before: string | null; limit: number },
  ): Promise<AiCreditUsageRow[]>;
  /** Board titles for distinct ids, via the actor's own client, ONE read. */
  readBoardTitles(actor: BillingActor, boardIds: string[]): Promise<Map<string, string>>;
}

const UNAVAILABLE = 'Usage history is unavailable right now.';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

const querySchema = z
  .object({
    // `offset: true` because `nextBefore` is Postgres's `created_at` verbatim,
    // e.g. `2026-10-05T09:18:14.950477+00:00` -- a `Z`-only datetime rejects the
    // route's own cursor (PATCH-344 Addendum 1).
    before: z.string().datetime({ offset: true }).optional(),
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional(),
  })
  .strict();

/** The ledger page, newest first. A DB error THROWS (fail closed). */
export async function readAiCreditUsage(
  client: SupabaseClient,
  workspaceId: string,
  params: { before: string | null; limit: number },
): Promise<AiCreditUsageRow[]> {
  let query = client
    .from('ai_credit_usage')
    .select('id, board_id, user_id, feature, credits, bucket, created_at')
    .eq('workspace_id', workspaceId);
  if (params.before) query = query.lt('created_at', params.before);
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(params.limit);
  if (error) throw error;
  return (data ?? []) as AiCreditUsageRow[];
}

/**
 * Board titles for a set of ids, in ONE `.in()` read. A board the actor cannot
 * open is simply absent from the result; the caller reads that as `boardGone`.
 */
export async function readBoardTitlesById(
  client: SupabaseClient,
  boardIds: string[],
): Promise<Map<string, string>> {
  const titles = new Map<string, string>();
  if (boardIds.length === 0) return titles;
  const { data, error } = await client.from('boards').select('id, title').in('id', boardIds);
  if (error) throw error;
  for (const row of (data ?? []) as Array<{ id: string; title?: string | null }>) {
    titles.set(row.id, row.title?.trim() || 'Untitled board');
  }
  return titles;
}

function toEntry(
  row: AiCreditUsageRow,
  titles: Map<string, string>,
  actorUserId: string,
): UsageHistoryEntry {
  const title = row.board_id ? titles.get(row.board_id) : undefined;
  const boardGone = row.board_id === null || title === undefined;
  return {
    id: row.id,
    createdAt: row.created_at,
    feature: row.feature,
    featureLabel: aiCreditFeatureLabel(row.feature),
    boardId: row.board_id,
    boardTitle: boardGone ? null : title ?? null,
    boardGone,
    byYou: row.user_id !== null && row.user_id === actorUserId,
    credits: row.credits,
    bucket: row.bucket === 'grant' ? 'grant' : 'allowance',
  };
}

export function createUsageHistoryHandler(deps: UsageHistoryHandlerDependencies) {
  return async function GET(request: Request): Promise<NextResponse> {
    let actor: BillingActor | null;
    try {
      actor = await deps.getAuthenticatedSession(request);
    } catch {
      actor = null;
    }
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    let workspace: { workspaceId: string } | null;
    try {
      workspace = await deps.resolveWorkspace(actor);
    } catch {
      workspace = null;
    }
    if (!workspace) {
      return NextResponse.json({ error: 'No active workspace' }, { status: 400 });
    }

    let role: string | null;
    try {
      role = await deps.workspaceRole(actor, workspace.workspaceId);
    } catch {
      return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });
    }
    if (role === null) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      before: url.searchParams.get('before') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid query' }, { status: 400 });
    }
    const before = parsed.data.before ?? null;
    const limit = parsed.data.limit ?? DEFAULT_LIMIT;

    // Ask for one extra to know whether there is another page.
    let rows: AiCreditUsageRow[];
    try {
      rows = await deps.readLedger(actor, workspace.workspaceId, { before, limit: limit + 1 });
    } catch {
      return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });
    }

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    const boardIds = Array.from(
      new Set(page.map((row) => row.board_id).filter((id): id is string => id !== null)),
    );
    let titles = new Map<string, string>();
    if (boardIds.length > 0) {
      try {
        titles = await deps.readBoardTitles(actor, boardIds);
      } catch {
        return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });
      }
    }

    const body: UsageHistoryResponse = {
      entries: page.map((row) => toEntry(row, titles, actor.userId)),
      nextBefore: hasMore && page.length > 0 ? page[page.length - 1].created_at : null,
    };

    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
  };
}
