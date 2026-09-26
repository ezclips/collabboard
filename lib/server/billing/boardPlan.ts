import type { SupabaseClient } from "@supabase/supabase-js";

// Relative imports (not the '@/...' alias) so the isolated Knowledge worker,
// which bundles this module with esbuild and has no path alias, can reuse it.
import {
  PLANS,
  workspacePlan,
  type PlanId,
  type PlanLimits,
} from "../../domain/billing/plans";

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
  /**
   * PATCH-187, widened by PATCH-189. The window the AI allowance is scoped to:
   * the stored SUBSCRIPTION period on a paid plan, the TRIAL window during the
   * 7-day Premium trial, else null (a Free workspace uses the UTC calendar
   * month). The field keeps its PATCH-187 name on purpose -- renaming it would
   * churn every AI route test fixture for no gain. `aiCreditPeriod` reads it
   * unchanged: a trial window is simply a credit period that contains `now`.
   */
  readonly subscriptionPeriod: { readonly start: string | null; readonly end: string | null } | null;
  /**
   * PATCH-189. The Premium trial's end (ISO), or null when the plan is a paid
   * subscription or plain Free. Present so a surface can say how long is left.
   */
  readonly trial: { readonly endsAt: string } | null;
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
    return {
      workspaceId: null,
      planId: "free",
      limits: PLANS.free.limits,
      subscriptionPeriod: null,
      trial: null,
    };
  }

  return resolveWorkspacePlanById(adminClient, workspaceId);
}

/**
 * PATCH-191. The plan for a workspace id alone: the same read `resolveBoardPlan`
 * does once it knows the workspace, split out so a usage meter can read a plan
 * without a board.
 *
 * PATCH-189. The trial is counted from the workspace's creation, so its row is
 * read too. Read with the SAME admin client as the rest of the plan: the caller
 * may be a contributor who cannot read the owner's workspace row.
 *
 * A DB error THROWS (fail closed), exactly as `resolveBoardPlan` does.
 */
export async function resolveWorkspacePlanById(
  adminClient: SupabaseClient,
  workspaceId: string,
): Promise<BoardPlan> {
  const { data: subscription, error: subscriptionError } = await adminClient
    .from("subscriptions")
    .select("plan, status, current_period_start, current_period_end")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (subscriptionError) throw subscriptionError;

  const { data: workspace, error: workspaceError } = await adminClient
    .from("workspaces")
    .select("created_at")
    .eq("id", workspaceId)
    .maybeSingle();

  if (workspaceError) throw workspaceError;

  const row = subscription as {
    plan?: string | null;
    status?: string | null;
    current_period_start?: string | null;
    current_period_end?: string | null;
  } | null;
  const createdAt =
    (workspace as { created_at?: string | null } | null)?.created_at ?? null;

  const resolved = workspacePlan(row, createdAt, new Date());

  return {
    workspaceId,
    planId: resolved.planId,
    limits: resolved.limits,
    subscriptionPeriod: resolved.creditPeriod,
    trial: resolved.trial ? { endsAt: resolved.trial.endsAt.toISOString() } : null,
  };
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
