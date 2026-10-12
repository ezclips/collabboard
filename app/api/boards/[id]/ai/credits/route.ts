import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

import { AI_ROLE_CHAT } from '@/lib/ai/aiRoles';
import { asUserId } from '@/lib/domain/core/ids';
import { planIncludes } from '@/lib/domain/billing/plans';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { canReadBoardKnowledge } from '@/lib/server/knowledge/knowledgeBoardReadAuthorization';
import type { KnowledgeBoardReadAuthorizationClient } from '@/lib/server/knowledge/knowledgeBoardReadAuthorization';
import { createAIRolePreferenceRepository } from '@/lib/infra/settings/aiRolePreferenceRepository';
import { resolveAIModelSourceForRole } from '@/lib/server/ai/resolveAIModelForRole';
import { resolveBoardPlan } from '@/lib/server/billing/boardPlan';
import { readAiCreditBalance } from '@/lib/server/billing/aiCredits';
import { createBoardCreditsHandler } from '@/lib/server/billing/boardCreditsRoute';

/**
 * PATCH-343. GET /api/boards/[id]/ai/credits -- the Board AI credit bar's read.
 *
 * Wires the real deps into the injected handler. The board's readability is
 * checked with the CALLER's own client; the plan and balance are read with the
 * admin client (a contributor cannot read the owner's subscription), exactly as
 * the AI routes' credit checks do.
 */
export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });

  const handler = createBoardCreditsHandler({
    getUserId: async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      return error || !user ? null : user.id;
    },
    canReadBoard: (userId, boardId) => canReadBoardKnowledge(
      supabase as unknown as KnowledgeBoardReadAuthorizationClient,
      boardId,
      userId,
    ),
    resolvePlan: (boardId) => resolveBoardPlan(getSupabaseAdmin(), boardId),
    readBalance: (plan) => readAiCreditBalance(getSupabaseAdmin(), plan, new Date()),
    resolveOwnKey: async (userId, plan) => {
      // The same condition `decideBoardAiCredits` uses to skip the ledger: a
      // configured own key on a Premium plan.
      if (!planIncludes(plan.planId, 'premium')) return false;
      const source = await resolveAIModelSourceForRole(
        asUserId(userId),
        AI_ROLE_CHAT,
        createAIRolePreferenceRepository(),
      );
      return source === 'byok';
    },
  });

  return handler(request, context);
}
