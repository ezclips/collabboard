import {
  createUsageHistoryHandler,
  readAiCreditUsage,
  readBoardTitlesById,
} from '@/lib/server/billing/usageHistoryRoute';
import { getBillingActor, resolveActorWorkspace } from '@/lib/server/billing/stripeBilling';
import type { BillingActor } from '@/lib/server/billing/stripeBilling';

export const runtime = 'nodejs';

/**
 * PATCH-344. The actor's membership, read through their OWN client -- the same
 * `get_workspace_role` RPC every board read uses. Null means "not a member"; an
 * RPC failure throws so the route answers 503 rather than calling it a denial.
 */
async function workspaceRole(
  actor: BillingActor,
  workspaceId: string,
): Promise<string | null> {
  const { data, error } = await actor.supabase.rpc('get_workspace_role', {
    workspace_uuid: workspaceId,
    user_uuid: actor.userId,
  });
  if (error) throw error;
  return (data as string | null) ?? null;
}

export const GET = createUsageHistoryHandler({
  getAuthenticatedSession: getBillingActor,
  resolveWorkspace: async (actor) => {
    const workspace = await resolveActorWorkspace(actor);
    return workspace ? { workspaceId: workspace.workspaceId } : null;
  },
  workspaceRole,
  // Both reads use the ACTOR's client (RLS decides), never the admin client.
  readLedger: (actor, workspaceId, params) =>
    readAiCreditUsage(actor.supabase, workspaceId, params),
  readBoardTitles: (actor, boardIds) => readBoardTitlesById(actor.supabase, boardIds),
});
