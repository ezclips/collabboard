import { createChangePlanHandler } from "@/lib/server/billing/changePlanRoute";
import {
  canManageWorkspaceBilling,
  findLivePaidSubscription,
  getBillingActor,
  resolveActorWorkspace,
  upsertSubscriptionFromStripe,
} from "@/lib/server/billing/stripeBilling";
import { getStripeAdmin } from "@/lib/stripe/admin";
import { getStripePriceId } from "@/lib/stripe/client";

export const runtime = "nodejs";

export const POST = createChangePlanHandler({
  getAuthenticatedSession: getBillingActor,
  resolveWorkspace: resolveActorWorkspace,
  canManageWorkspaceBilling: (actor, workspaceId) =>
    canManageWorkspaceBilling(actor.supabase, workspaceId, actor.userId),
  findLivePaidSubscription: (actor, workspaceId) =>
    findLivePaidSubscription(actor.supabaseAdmin, workspaceId),
  getStripePriceId,
  retrieveSubscription: (_actor, subscriptionId) =>
    getStripeAdmin().subscriptions.retrieve(subscriptionId),
  updateSubscription: (_actor, subscriptionId, params) =>
    getStripeAdmin().subscriptions.update(subscriptionId, params),
  syncSubscription: upsertSubscriptionFromStripe,
});
