import { createUsageHandler } from "@/lib/server/billing/usageRoute";
import {
  countWorkspaceKnowledgeDocuments,
  resolveWorkspacePlanById,
} from "@/lib/server/billing/boardPlan";
import { readAiCreditBalance } from "@/lib/server/billing/aiCredits";
import { getBillingActor, resolveActorWorkspace } from "@/lib/server/billing/stripeBilling";
import type { BillingActor } from "@/lib/server/billing/stripeBilling";

export const runtime = "nodejs";

/**
 * PATCH-191. The actor's membership, read through their OWN client -- the same
 * `get_workspace_role` RPC every board read uses. Null means "not a member"; an
 * RPC failure throws so the route answers 503 rather than calling it a denial.
 */
async function workspaceRole(
  actor: BillingActor,
  workspaceId: string,
): Promise<string | null> {
  const { data, error } = await actor.supabase.rpc("get_workspace_role", {
    workspace_uuid: workspaceId,
    user_uuid: actor.userId,
  });
  if (error) throw error;
  return (data as string | null) ?? null;
}

export const GET = createUsageHandler({
  getAuthenticatedSession: getBillingActor,
  resolveWorkspace: async (actor) => {
    const workspace = await resolveActorWorkspace(actor);
    return workspace ? { workspaceId: workspace.workspaceId } : null;
  },
  workspaceRole,
  resolveWorkspacePlan: (actor, workspaceId) =>
    resolveWorkspacePlanById(actor.supabaseAdmin, workspaceId),
  readCredits: (actor, plan) =>
    readAiCreditBalance(actor.supabaseAdmin, plan, new Date()),
  countDocuments: (actor, workspaceId) =>
    countWorkspaceKnowledgeDocuments(actor.supabaseAdmin, workspaceId),
  countBoards: async (actor, workspaceId) => {
    const { count, error } = await actor.supabaseAdmin
      .from("boards")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      // Active boards only, exactly as the board limit counts them (template1.ts,
      // CanvasSetupPage): a meter must never disagree with the refusal.
      .is("deleted_at", null);
    if (error) throw error;
    return count ?? 0;
  },
});
