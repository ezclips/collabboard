import { NextResponse } from "next/server";

import type { PlanId } from "@/lib/domain/billing/plans";
import { parseCheckoutRequest } from "@/lib/stripe/client";

import type { BillingActor, LiveSubscription } from "./stripeBilling";

/**
 * PATCH-184. The checkout HTTP edge. It refuses anyone who is not a workspace
 * owner/admin, and refuses to open a SECOND subscription for a workspace that
 * already has a live paid one -- the fix for the double-charge found live.
 */

export interface CreateCheckoutSessionInput {
  customerId: string;
  priceId: string;
  plan: PlanId;
  interval: "monthly" | "yearly";
  workspaceId: string;
  userId: string;
  origin: string;
}

export interface CheckoutHandlerDependencies {
  getAuthenticatedSession(request: Request): Promise<BillingActor | null>;
  resolveWorkspace(
    actor: BillingActor,
  ): Promise<{ workspaceId: string; workspaceName: string } | null>;
  canManageWorkspaceBilling(actor: BillingActor, workspaceId: string): Promise<boolean>;
  findLivePaidSubscription(
    actor: BillingActor,
    workspaceId: string,
  ): Promise<LiveSubscription | null>;
  getStripePriceId(plan: string, interval: "monthly" | "yearly"): string | null;
  ensureCustomer(
    actor: BillingActor,
    workspace: { workspaceId: string; workspaceName: string },
  ): Promise<string>;
  createCheckoutSession(
    actor: BillingActor,
    input: CreateCheckoutSessionInput,
  ): Promise<{ url: string | null }>;
}

const NOT_MANAGER = "Only a workspace owner or admin can manage billing.";

export function createCheckoutHandler(deps: CheckoutHandlerDependencies) {
  return async function POST(request: Request): Promise<NextResponse> {
    let actor: BillingActor | null;
    try {
      actor = await deps.getAuthenticatedSession(request);
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const parsed = parseCheckoutRequest(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { plan, interval } = parsed;

    let workspace: { workspaceId: string; workspaceName: string } | null;
    try {
      workspace = await deps.resolveWorkspace(actor);
    } catch {
      workspace = null;
    }
    if (!workspace) {
      return NextResponse.json({ error: "No active workspace" }, { status: 400 });
    }

    if (!(await deps.canManageWorkspaceBilling(actor, workspace.workspaceId))) {
      return NextResponse.json({ error: NOT_MANAGER }, { status: 403 });
    }

    let live: unknown;
    try {
      live = await deps.findLivePaidSubscription(actor, workspace.workspaceId);
    } catch {
      return NextResponse.json({ error: "Billing is unavailable right now. Try again." }, { status: 503 });
    }
    if (live) {
      return NextResponse.json(
        {
          error: "This workspace already has a subscription. Change the plan instead.",
          code: "already_subscribed",
        },
        { status: 409 },
      );
    }

    const priceId = deps.getStripePriceId(plan, interval);
    if (!priceId) {
      return NextResponse.json({ error: "Unknown pricing configuration" }, { status: 400 });
    }

    try {
      const customerId = await deps.ensureCustomer(actor, workspace);
      const origin =
        request.headers.get("origin") ||
        process.env.NEXT_PUBLIC_APP_URL ||
        "http://localhost:3000";

      const session = await deps.createCheckoutSession(actor, {
        customerId,
        priceId,
        plan,
        interval,
        workspaceId: workspace.workspaceId,
        userId: actor.userId,
        origin,
      });

      return NextResponse.json({ url: session.url });
    } catch (error) {
      console.error("Stripe checkout error:", error);
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Failed to create checkout session",
        },
        { status: 500 },
      );
    }
  };
}
