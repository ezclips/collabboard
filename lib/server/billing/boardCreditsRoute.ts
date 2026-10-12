import { NextResponse } from "next/server";

import type { AiCreditBalance, PlanId } from "@/lib/domain/billing/plans";

import type { BoardPlan } from "./boardPlan";
import { creditMeter, type BillingUsageResponse } from "./usageRoute";

/**
 * PATCH-343. The Board AI credit bar's read edge: the BOARD OWNER's workspace
 * credits, because PRICING.md Rule 1 makes the owner's plan pay for a chat turn.
 *
 * Injected exactly as `usageRoute` is, so the ordering (auth -> board
 * readability -> plan -> balance -> own-key) is testable without a database.
 * The readability check is load-bearing: a board the caller cannot read must
 * not reveal its owner's plan or balance.
 */

export interface BoardAiCredits {
  readonly planId: PlanId;
  readonly credits: BillingUsageResponse["credits"];
  /** True when a chat call would use the caller's own key, skipping credits. */
  readonly ownKey: boolean;
}

export interface BoardCreditsHandlerDependencies {
  /** The authenticated user id, or null. */
  getUserId(request: Request): Promise<string | null>;
  /**
   * Whether the caller may READ the board, through the caller's OWN client. An
   * infrastructure failure THROWS so the route answers 503, never mistaking an
   * outage for a denial.
   */
  canReadBoard(userId: string, boardId: string): Promise<boolean>;
  /** The board owner's plan (admin client). */
  resolvePlan(boardId: string): Promise<BoardPlan>;
  /** The board workspace's credit balance (admin client). */
  readBalance(plan: BoardPlan): Promise<AiCreditBalance>;
  /** Whether a chat call would use the user's own key (Premium + byok). */
  resolveOwnKey(userId: string, plan: BoardPlan): Promise<boolean>;
}

const UNAVAILABLE = "AI credits are unavailable right now.";

/**
 * A balance that reads as nothing. Free has no allowance and no credit period,
 * so `creditMeter` reports all zeroes with no renewal -- and no balance read.
 */
const EMPTY_BALANCE: AiCreditBalance = {
  allowance: 0,
  allowanceUsed: 0,
  grantTotal: 0,
  grantUsed: 0,
  remaining: 0,
  period: { start: new Date(0), end: new Date(0) },
};

export function createBoardCreditsHandler(deps: BoardCreditsHandlerDependencies) {
  return async function GET(
    request: Request,
    context: { params: Promise<{ id: string }> },
  ): Promise<NextResponse> {
    let userId: string | null;
    try {
      userId = await deps.getUserId(request);
    } catch {
      userId = null;
    }
    if (!userId) return NextResponse.json({ error: "Authentication required" }, { status: 401 });

    const { id: boardId } = await context.params;

    let readable: boolean;
    try {
      readable = await deps.canReadBoard(userId, boardId);
    } catch {
      return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });
    }
    if (!readable) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    let plan: BoardPlan;
    let credits: BillingUsageResponse["credits"];
    let ownKey: boolean;
    try {
      plan = await deps.resolvePlan(boardId);
      // Free has no AI allowance and no credit period: `creditMeter` reports all
      // zeroes with no renewal, and the balance is never read.
      credits = plan.planId === "free"
        ? creditMeter(plan, EMPTY_BALANCE)
        : creditMeter(plan, await deps.readBalance(plan));
      ownKey = await deps.resolveOwnKey(userId, plan);
    } catch {
      return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });
    }

    const body: BoardAiCredits = { planId: plan.planId, credits, ownKey };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  };
}
