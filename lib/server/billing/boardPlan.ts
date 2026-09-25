import type { SupabaseClient } from "@supabase/supabase-js";

import {
  effectivePlanId,
  PLANS,
  type PlanId,
  type PlanLimits,
} from "@/lib/domain/billing/plans";

/**
 * PATCH-185. The plan that applies to a board: the plan of the workspace that
 * OWNS it (PRICING.md Rule 1). A contributor works inside the owner's plan.
 *
 * Read with the ADMIN client: the uploader may be a contributor who cannot read
 * the owner's `subscriptions` row, and Rule 1 says the owner's plan applies to
 * them anyway.
 */

export interface BoardPlan {
  readonly workspaceId: string | null;
  readonly planId: PlanId;
  readonly limits: PlanLimits;
}

/**
 * A board with no `workspace_id`, or a workspace with no subscription row, is
 * Free. A DB error THROWS (fail closed): an error must never read as some plan,
 * neither Free (a wrong refusal for a paying customer) nor paid.
 */
export async function resolveBoardPlan(
  adminClient: SupabaseClient,
  boardId: string,
): Promise<BoardPlan> {
  const { data: board, error: boardError } = await adminClient
    .from("boards")
    .select("workspace_id")
    .eq("id", boardId)
    .maybeSingle();

  if (boardError) throw boardError;

  const workspaceId =
    (board as { workspace_id?: string | null } | null)?.workspace_id ?? null;

  if (!workspaceId) {
    return { workspaceId: null, planId: "free", limits: PLANS.free.limits };
  }

  const { data: subscription, error: subscriptionError } = await adminClient
    .from("subscriptions")
    .select("plan, status")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (subscriptionError) throw subscriptionError;

  const row = subscription as { plan?: string | null; status?: string | null } | null;
  const planId = effectivePlanId(row?.plan, row?.status);

  return { workspaceId, planId, limits: PLANS[planId].limits };
}

/**
 * Knowledge documents that count toward the plan: every row on the workspace's
 * boards except `processing_status = 'failed'` (a failed extraction gave the
 * user nothing). Two queries: the workspace's board ids, then the documents on
 * them. A DB error THROWS.
 */
export async function countWorkspaceKnowledgeDocuments(
  adminClient: SupabaseClient,
  workspaceId: string,
): Promise<number> {
  const { data: boards, error: boardsError } = await adminClient
    .from("boards")
    .select("id")
    .eq("workspace_id", workspaceId);

  if (boardsError) throw boardsError;

  const boardIds = ((boards ?? []) as { id: string }[]).map((board) => board.id);
  if (boardIds.length === 0) return 0;

  const { count, error: countError } = await adminClient
    .from("knowledge_documents")
    .select("id", { count: "exact", head: true })
    .in("board_id", boardIds)
    .neq("processing_status", "failed");

  if (countError) throw countError;

  return count ?? 0;
}
