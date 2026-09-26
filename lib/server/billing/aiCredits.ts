// PATCH-187. The AI credit ledger: reading a board owner's balance, deciding
// whether a managed call may run, and recording what it cost.
//
// SERVER ONLY. Everything here reads and writes with the ADMIN client, for the
// same reason as `resolveBoardPlan`: the caller may be a contributor who cannot
// read the owner's subscription row or the workspace's usage rows, and the
// owner's plan applies to them anyway (PRICING.md Rule 1).
//
// NO AI ROUTE NAMES AN ADMIN CLIENT. The route-facing functions below build it
// here, so a route that carries a standing guard against holding one still
// holds none -- the privileged client never leaves this module.

import type { SupabaseClient } from '@supabase/supabase-js';

import type { AIRole } from '../../ai/aiRoles';
import {
  aiCreditBalance,
  aiCreditPeriod,
  PLAN_CREDITS_EXHAUSTED_CODE,
  PLAN_NO_WORKSPACE_CODE,
  PLAN_NO_WORKSPACE_ERROR,
  PLANS,
  planCreditsExhaustedError,
  splitAiCreditCharge,
  type AiCreditBalance,
  type AiCreditFeature,
} from '../../domain/billing/plans';
import { getSupabaseAdmin } from '../../supabase/admin';
import { resolveAIModelSourceForRole, type AIRolePreferenceReader } from '../ai/resolveAIModelForRole';
import { resolveBoardPlan, type BoardPlan } from './boardPlan';

export type CheckManagedAiCreditsResult =
  | {
    readonly kind: 'allowed';
    readonly plan: BoardPlan;
    readonly balance: AiCreditBalance;
    /** False when a paid plan's board chat answers past the end of the credits. */
    readonly charge: boolean;
  }
  | {
    readonly kind: 'refused';
    readonly status: 402;
    readonly body: { readonly error: string; readonly code: string };
  };

export interface RecordAiCreditUsageInput {
  readonly plan: BoardPlan;
  readonly balance: AiCreditBalance;
  readonly boardId: string;
  readonly userId: string;
  readonly feature: AiCreditFeature;
  readonly credits: number;
}

function sumCredits(rows: unknown): number {
  if (!Array.isArray(rows)) return 0;
  let total = 0;
  for (const row of rows) {
    const credits = (row as { credits?: unknown }).credits;
    if (typeof credits === 'number' && Number.isFinite(credits)) total += credits;
  }
  return total;
}

/**
 * The balance for one board's workspace.
 *
 * BOUNDED BY CONSTRUCTION: both reads select ONLY the `credits` integer column,
 * filtered by `workspace_id` and `bucket` (the allowance read additionally by
 * `created_at >= period.start`), and the sum is done in JS. A workspace spends
 * at most a few thousand rows a month, so this is a small, indexed read and not
 * an unbounded scan. An RPC would need a migration beyond PATCH-187, so it is
 * deliberately not used.
 *
 * A DB error THROWS. A balance that cannot be read must refuse rather than
 * guess.
 */
export async function readAiCreditBalance(
  admin: SupabaseClient,
  plan: BoardPlan,
  now: Date,
): Promise<AiCreditBalance> {
  const workspaceId = plan.workspaceId;
  if (workspaceId === null) {
    throw new Error('readAiCreditBalance requires a workspace');
  }

  const period = aiCreditPeriod(now, plan.subscriptionPeriod);

  const { data: allowanceRows, error: allowanceError } = await admin
    .from('ai_credit_usage')
    .select('credits')
    .eq('workspace_id', workspaceId)
    .eq('bucket', 'allowance')
    .gte('created_at', period.start.toISOString());
  if (allowanceError) throw allowanceError;

  const { data: grantRows, error: grantError } = await admin
    .from('ai_credit_usage')
    .select('credits')
    .eq('workspace_id', workspaceId)
    .eq('bucket', 'grant');
  if (grantError) throw grantError;

  return aiCreditBalance(plan.limits, period, {
    allowanceUsed: sumCredits(allowanceRows),
    grantUsed: sumCredits(grantRows),
  });
}

/**
 * May a managed call of `cost` credits run against the board owner's plan?
 *
 * A board with no workspace has no plan to meter against, so it is refused with
 * its own code and message. A paid plan's board chat keeps answering on an empty
 * balance, uncharged. Everything else is refused with the renewal date.
 *
 * Any throw from the reads PROPAGATES: the route turns it into 503 and never
 * calls the model. Fail closed.
 */
export async function checkManagedAiCredits(
  admin: SupabaseClient,
  boardId: string,
  now: Date,
  cost: number,
  options?: { readonly boardChat?: boolean },
): Promise<CheckManagedAiCreditsResult> {
  const plan = await resolveBoardPlan(admin, boardId);

  if (plan.workspaceId === null) {
    return {
      kind: 'refused',
      status: 402,
      body: { error: PLAN_NO_WORKSPACE_ERROR, code: PLAN_NO_WORKSPACE_CODE },
    };
  }

  const balance = await readAiCreditBalance(admin, plan, now);

  // A positive cost is covered when `remaining >= cost`. A ZERO-cost call (the
  // starter questions) is a board-chat-shaped feature that pauses on Free once
  // the credits are spent, so it additionally requires a non-empty balance:
  // `remaining >= 0` alone would let an exhausted Free workspace keep reading
  // the board through it.
  const affordable = balance.remaining >= cost && (cost > 0 || balance.remaining > 0);
  if (affordable) {
    return { kind: 'allowed', plan, balance, charge: true };
  }

  // PRICING.md §3: basic Q&A on boards stays free on a paid plan.
  if (options?.boardChat === true && plan.limits.boardChatWhenOutOfCredits) {
    return { kind: 'allowed', plan, balance, charge: false };
  }

  return {
    kind: 'refused',
    status: 402,
    body: {
      error: planCreditsExhaustedError(PLANS[plan.planId].name, balance.period.end),
      code: PLAN_CREDITS_EXHAUSTED_CODE,
    },
  };
}

/**
 * Writes the rows `splitAiCreditCharge` produces. Nothing when credits is 0.
 *
 * ACCEPTED RACE: two concurrent calls can both pass the check and both charge,
 * so a workspace can end a few credits below zero. It is not worth a lock -- the
 * overspend is bounded by concurrency, and a lock would serialize every AI call
 * in a workspace to protect a handful of credits.
 *
 * Returns normally or throws.
 */
export async function recordAiCreditUsage(
  admin: SupabaseClient,
  input: RecordAiCreditUsageInput,
): Promise<void> {
  const rows = splitAiCreditCharge(input.balance, input.credits);
  if (rows.length === 0) return;

  const workspaceId = input.plan.workspaceId;
  if (workspaceId === null) return;

  const { error } = await admin
    .from('ai_credit_usage')
    .insert(rows.map((row) => ({
      workspace_id: workspaceId,
      board_id: input.boardId,
      user_id: input.userId,
      feature: input.feature,
      credits: row.credits,
      bucket: row.bucket,
    })));
  if (error) throw error;
}

/**
 * The route-facing check. Resolves the pre-call SOURCE (preference only, no
 * credential) and reads the ledger ONLY for a managed call; a byok caller never
 * reaches the database.
 *
 * A preference read error propagates as the resolver's own `provider_unavailable`,
 * which the route turns into 503 without calling the model.
 */
export type ManagedAiCreditDecision =
  | { readonly kind: 'byok' }
  | {
    readonly kind: 'allowed';
    readonly plan: BoardPlan;
    readonly balance: AiCreditBalance;
    readonly charge: boolean;
  }
  | {
    readonly kind: 'refused';
    readonly status: 402;
    readonly body: { readonly error: string; readonly code: string };
  };

export async function checkBoardAiCredits(input: {
  readonly boardId: string;
  readonly userId: string;
  readonly role: AIRole;
  readonly cost: number;
  readonly now: Date;
  readonly boardChat?: boolean;
  readonly preferences: AIRolePreferenceReader;
}): Promise<ManagedAiCreditDecision> {
  const source = await resolveAIModelSourceForRole(
    input.userId as never,
    input.role,
    input.preferences,
  );
  if (source === 'byok') return { kind: 'byok' };

  const admin = getSupabaseAdmin();
  const checked = await checkManagedAiCredits(
    admin,
    input.boardId,
    input.now,
    input.cost,
    input.boardChat === undefined ? undefined : { boardChat: input.boardChat },
  );
  if (checked.kind === 'refused') {
    return { kind: 'refused', status: checked.status, body: checked.body };
  }
  return {
    kind: 'allowed',
    plan: checked.plan,
    balance: checked.balance,
    charge: checked.charge,
  };
}

/** The route-facing recorder. Builds the admin client here, as the check does. */
export async function recordBoardAiCreditUsage(
  input: RecordAiCreditUsageInput,
): Promise<void> {
  await recordAiCreditUsage(getSupabaseAdmin(), input);
}
