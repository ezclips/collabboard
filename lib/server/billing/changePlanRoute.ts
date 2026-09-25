import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { parseCheckoutRequest } from "@/lib/stripe/client";

import type { BillingActor, LiveSubscription } from "./stripeBilling";

/**
 * PATCH-184. Changing the plan on the workspace's EXISTING subscription, so an
 * upgrade cannot open a second one and double-charge. The HTTP edge only; the
 * app route is a thin wrapper that supplies the real collaborators.
 */

export interface ChangePlanHandlerDependencies {
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
  retrieveSubscription(actor: BillingActor, subscriptionId: string): Promise<Stripe.Subscription>;
  updateSubscription(
    actor: BillingActor,
    subscriptionId: string,
    params: Stripe.SubscriptionUpdateParams,
  ): Promise<Stripe.Subscription>;
  syncSubscription(subscription: Stripe.Subscription): Promise<void>;
}

const STRIPE_FAILED = "Stripe could not change the plan. Nothing was changed.";
const NOT_MANAGER = "Only a workspace owner or admin can manage billing.";
const NO_SUBSCRIPTION = "No active subscription to change.";
const MULTIPLE_ITEMS = "This subscription cannot be changed here. Use the billing portal.";

export function createChangePlanHandler(deps: ChangePlanHandlerDependencies) {
  return async function POST(request: Request): Promise<NextResponse> {
    const body = await request.json().catch(() => ({}));
    const parsed = parseCheckoutRequest(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const { plan, interval } = parsed;

    let actor: BillingActor | null;
    try {
      actor = await deps.getAuthenticatedSession(request);
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

    let live: Awaited<ReturnType<typeof deps.findLivePaidSubscription>>;
    try {
      live = await deps.findLivePaidSubscription(actor, workspace.workspaceId);
    } catch {
      return NextResponse.json({ error: "Billing is unavailable right now. Try again." }, { status: 503 });
    }
    if (!live) {
      return NextResponse.json(
        { error: NO_SUBSCRIPTION, code: "no_subscription" },
        { status: 409 },
      );
    }

    const newPriceId = deps.getStripePriceId(plan, interval);
    if (!newPriceId) {
      return NextResponse.json({ error: "Unknown pricing configuration" }, { status: 400 });
    }
    if (live.priceId && newPriceId === live.priceId) {
      return NextResponse.json({ error: "This is already your plan." }, { status: 400 });
    }

    let subscription: Stripe.Subscription;
    try {
      subscription = await deps.retrieveSubscription(actor, live.stripeSubscriptionId);
    } catch (error) {
      console.error("Stripe change-plan retrieve failed:", {
        subscriptionId: live.stripeSubscriptionId,
        error,
      });
      return NextResponse.json({ error: STRIPE_FAILED }, { status: 502 });
    }

    const items = subscription.items?.data ?? [];
    if (items.length !== 1) {
      return NextResponse.json({ error: MULTIPLE_ITEMS }, { status: 409 });
    }
    const itemId = items[0].id;

    let updated: Stripe.Subscription;
    try {
      updated = await deps.updateSubscription(actor, live.stripeSubscriptionId, {
        items: [{ id: itemId, price: newPriceId }],
        proration_behavior: "create_prorations",
        metadata: { ...subscription.metadata, workspaceId: workspace.workspaceId },
      });
    } catch (error) {
      console.error("Stripe change-plan update failed:", {
        subscriptionId: live.stripeSubscriptionId,
        error,
      });
      return NextResponse.json({ error: STRIPE_FAILED }, { status: 502 });
    }

    await deps.syncSubscription(updated);

    return NextResponse.json({ plan, status: updated.status });
  };
}
