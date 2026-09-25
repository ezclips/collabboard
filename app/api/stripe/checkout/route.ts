import { createCheckoutHandler } from "@/lib/server/billing/checkoutRoute";
import {
  canManageWorkspaceBilling,
  findLivePaidSubscription,
  getBillingActor,
  resolveActorWorkspace,
} from "@/lib/server/billing/stripeBilling";
import { getStripeAdmin } from "@/lib/stripe/admin";
import { getStripePriceId } from "@/lib/stripe/client";

export const runtime = "nodejs";

export const POST = createCheckoutHandler({
  getAuthenticatedSession: getBillingActor,
  resolveWorkspace: resolveActorWorkspace,
  canManageWorkspaceBilling: (actor, workspaceId) =>
    canManageWorkspaceBilling(actor.supabase, workspaceId, actor.userId),
  findLivePaidSubscription: (actor, workspaceId) =>
    findLivePaidSubscription(actor.supabaseAdmin, workspaceId),
  getStripePriceId,
  ensureCustomer: async (actor, workspace) => {
    const stripeAdmin = getStripeAdmin();
    const { data: customerRow } = await actor.supabaseAdmin
      .from("customers")
      .select("id, stripe_customer_id")
      .eq("workspace_id", workspace.workspaceId)
      .maybeSingle();

    const existing = customerRow as { stripe_customer_id?: string | null } | null;
    let stripeCustomerId = existing?.stripe_customer_id ?? null;

    if (!stripeCustomerId) {
      const customer = await stripeAdmin.customers.create({
        email: actor.email || undefined,
        name: workspace.workspaceName,
        metadata: {
          workspaceId: workspace.workspaceId,
          userId: actor.userId,
        },
      });

      stripeCustomerId = customer.id;

      await actor.supabaseAdmin.from("customers").upsert({
        workspace_id: workspace.workspaceId,
        stripe_customer_id: customer.id,
        email: actor.email || null,
        name: workspace.workspaceName,
      });
    }

    return stripeCustomerId;
  },
  createCheckoutSession: async (actor, input) => {
    const session = await getStripeAdmin().checkout.sessions.create({
      mode: "subscription",
      customer: input.customerId,
      line_items: [{ price: input.priceId, quantity: 1 }],
      success_url: `${input.origin}/dashboard/settings/billing?checkout=success`,
      cancel_url: `${input.origin}/dashboard/settings/billing?checkout=cancelled`,
      allow_promotion_codes: true,
      metadata: {
        workspaceId: input.workspaceId,
        userId: input.userId,
        plan: input.plan,
        interval: input.interval,
      },
      subscription_data: {
        metadata: {
          workspaceId: input.workspaceId,
          userId: input.userId,
          plan: input.plan,
          interval: input.interval,
        },
      },
    });

    return { url: session.url };
  },
});
