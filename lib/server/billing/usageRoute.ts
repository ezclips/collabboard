import { NextResponse } from "next/server";

import type { AiCreditBalance, PlanId } from "@/lib/domain/billing/plans";

import type { BoardPlan } from "./boardPlan";
import type { BillingActor } from "./stripeBilling";

/**
 * PATCH-191. The usage HTTP edge: one workspace's credits, documents and
 * boards, from the same functions the server enforces with.
 *
 * ANY MEMBER may read usage -- a contributor lives under the owner's plan
 * (PRICING.md Rule 1) and is told where the workspace stands. Only owners and
 * admins manage billing, and that lives in the checkout route, unchanged.
 *
 * It is injected exactly as `checkoutRoute` is, so the ordering (auth ->
 * workspace -> membership -> reads) is testable without a database.
 */

export interface BillingUsageResponse {
  readonly planId: PlanId;
  readonly trialEndsAt: string | null;
  readonly credits: {
    readonly used: number;
    readonly total: number;
    readonly remaining: number;
    readonly renewsOn: string | null;
  };
  readonly documents: { readonly used: number; readonly limit: number | null };
  readonly boards: { readonly used: number; readonly limit: number | null };
}

export interface UsageHandlerDependencies {
  getAuthenticatedSession(request: Request): Promise<BillingActor | null>;
  resolveWorkspace(
    actor: BillingActor,
  ): Promise<{ workspaceId: string } | null>;
  /**
   * The actor's role in the workspace, read through the actor's OWN client, or
   * null when the actor is not a member. An infrastructure failure THROWS so
   * the route answers 503 rather than mistaking an outage for a non-member.
   */
  workspaceRole(actor: BillingActor, workspaceId: string): Promise<string | null>;
  resolveWorkspacePlan(
    actor: BillingActor,
    workspaceId: string,
  ): Promise<BoardPlan>;
  readCredits(actor: BillingActor, plan: BoardPlan): Promise<AiCreditBalance>;
  countDocuments(actor: BillingActor, workspaceId: string): Promise<number>;
  countBoards(actor: BillingActor, workspaceId: string): Promise<number>;
}

const UNAVAILABLE = "Usage is unavailable right now.";

/**
 * The credit meter. `total` is the whole allowance for the period (monthly
 * allowance plus the welcome grant); `used` is capped at `total` so an
 * overdrawn workspace reads "500 of 500", never "503 of 500".
 *
 * Free after the trial has no AI allowance at all, so it reports all zeroes
 * and NO renewal: it has no credit period to renew. The page renders "No AI on
 * Free" from `planId`, not from these numbers.
 */
function creditMeter(
  plan: BoardPlan,
  balance: AiCreditBalance,
): BillingUsageResponse["credits"] {
  if (plan.planId === "free") {
    return { used: 0, total: 0, remaining: 0, renewsOn: null };
  }
  const total = balance.allowance + balance.grantTotal;
  const used = Math.min(balance.allowanceUsed + balance.grantUsed, total);
  return {
    used,
    total,
    remaining: balance.remaining,
    renewsOn: balance.period.end.toISOString(),
  };
}

export function createUsageHandler(deps: UsageHandlerDependencies) {
  return async function GET(request: Request): Promise<NextResponse> {
    let actor: BillingActor | null;
    try {
      actor = await deps.getAuthenticatedSession(request);
    } catch {
      actor = null;
    }
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let workspace: { workspaceId: string } | null;
    try {
      workspace = await deps.resolveWorkspace(actor);
    } catch {
      workspace = null;
    }
    if (!workspace) {
      return NextResponse.json({ error: "No active workspace" }, { status: 400 });
    }

    // Membership through the actor's OWN client. Any role may read; a missing
    // role is not a member. A failed role read is an outage, not a denial.
    let role: string | null;
    try {
      role = await deps.workspaceRole(actor, workspace.workspaceId);
    } catch {
      return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });
    }
    if (role === null) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let plan: BoardPlan;
    let balance: AiCreditBalance;
    let documents: number;
    let boards: number;
    try {
      plan = await deps.resolveWorkspacePlan(actor, workspace.workspaceId);
      balance = await deps.readCredits(actor, plan);
      documents = await deps.countDocuments(actor, workspace.workspaceId);
      boards = await deps.countBoards(actor, workspace.workspaceId);
    } catch {
      return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });
    }

    const body: BillingUsageResponse = {
      planId: plan.planId,
      trialEndsAt: plan.trial ? plan.trial.endsAt : null,
      credits: creditMeter(plan, balance),
      documents: { used: documents, limit: plan.limits.processedDocuments },
      boards: { used: boards, limit: plan.limits.boards },
    };

    return NextResponse.json(body, {
      headers: { "Cache-Control": "no-store" },
    });
  };
}
