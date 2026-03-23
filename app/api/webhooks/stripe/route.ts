import Stripe from "stripe";

import { getStripeAdmin } from "@/lib/stripe/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type StripeSubscriptionRow = {
  workspace_id: string;
  customer_id?: string | null;
  stripe_subscription_id: string;
  stripe_price_id?: string | null;
  stripe_product_id?: string | null;
  plan: "free" | "pro";
  status?: string | null;
  cancel_at_period_end: boolean;
  current_period_start?: string | null;
  current_period_end?: string | null;
  trial_start?: string | null;
  trial_end?: string | null;
  canceled_at?: string | null;
  metadata: Record<string, string>;
};

function toIsoOrNull(value?: number | null) {
  return value ? new Date(value * 1000).toISOString() : null;
}

function resolvePlanFromPrice(priceId?: string | null): "free" | "pro" {
  if (!priceId) return "free";
  const known = [
    process.env.STRIPE_PRICE_PRO_MONTHLY,
    process.env.STRIPE_PRICE_PRO_YEARLY,
  ].filter(Boolean);
  return known.includes(priceId) ? "pro" : "free";
}

async function recordWebhookEvent(event: Stripe.Event) {
  const supabaseAdmin = getSupabaseAdmin();
  const { data: existing } = await supabaseAdmin
    .from("webhook_events")
    .select("id")
    .eq("provider", "stripe")
    .eq("event_id", event.id)
    .maybeSingle();

  if (existing) return false;

  const { error } = await supabaseAdmin.from("webhook_events").insert({
    provider: "stripe",
    event_id: event.id,
    event_type: event.type,
    payload: event as unknown as Record<string, unknown>,
  });

  if (error) {
    if ((error as { code?: string }).code === "23505") return false;
    throw error;
  }

  return true;
}

async function upsertCustomerFromStripe(customerId: string) {
  const stripeAdmin = getStripeAdmin();
  const supabaseAdmin = getSupabaseAdmin();
  const customer = await stripeAdmin.customers.retrieve(customerId);
  if (customer.deleted) return null;

  const workspaceId = customer.metadata?.workspaceId;
  if (!workspaceId) return null;

  const { data, error } = await supabaseAdmin
    .from("customers")
    .upsert(
      {
        workspace_id: workspaceId,
        stripe_customer_id: customer.id,
        email: customer.email || null,
        name: customer.name || null,
      },
      {
        onConflict: "workspace_id",
      },
    )
    .select("id, workspace_id, stripe_customer_id")
    .single();

  if (error) throw error;
  return data;
}

async function upsertSubscriptionFromStripe(subscription: Stripe.Subscription) {
  const supabaseAdmin = getSupabaseAdmin();
  const workspaceId =
    subscription.metadata?.workspaceId ||
    (typeof subscription.customer === "string"
      ? (
          await supabaseAdmin
            .from("customers")
            .select("workspace_id")
            .eq("stripe_customer_id", subscription.customer)
            .maybeSingle()
        ).data?.workspace_id
      : null);

  if (!workspaceId) return;

  const customerRow =
    typeof subscription.customer === "string"
      ? (
          await supabaseAdmin
            .from("customers")
            .select("id")
            .eq("stripe_customer_id", subscription.customer)
            .maybeSingle()
        ).data
      : null;

  const firstItem = subscription.items.data[0];
  const row: StripeSubscriptionRow = {
    workspace_id: workspaceId,
    customer_id: customerRow?.id || null,
    stripe_subscription_id: subscription.id,
    stripe_price_id: firstItem?.price?.id || null,
    stripe_product_id:
      typeof firstItem?.price?.product === "string" ? firstItem.price.product : null,
    plan: resolvePlanFromPrice(firstItem?.price?.id || null),
    status: subscription.status,
    cancel_at_period_end: subscription.cancel_at_period_end,
    current_period_start: toIsoOrNull((subscription as any).current_period_start),
    current_period_end: toIsoOrNull((subscription as any).current_period_end),
    trial_start: toIsoOrNull(subscription.trial_start),
    trial_end: toIsoOrNull(subscription.trial_end),
    canceled_at: toIsoOrNull(subscription.canceled_at),
    metadata: subscription.metadata,
  };

  const { error } = await supabaseAdmin.from("subscriptions").upsert(row, {
    onConflict: "workspace_id",
  });
  if (error) throw error;
}

async function markSubscriptionCanceled(subscription: Stripe.Subscription) {
  const supabaseAdmin = getSupabaseAdmin();
  const { error } = await supabaseAdmin
    .from("subscriptions")
    .update({
      status: subscription.status,
      canceled_at: toIsoOrNull(subscription.canceled_at),
      cancel_at_period_end: subscription.cancel_at_period_end,
      plan: "free",
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", subscription.id);

  if (error) throw error;
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return new Response("Missing Stripe webhook configuration", { status: 400 });
  }

  const payload = await request.text();

  let event: Stripe.Event;
  try {
    const stripeAdmin = getStripeAdmin();
    event = stripeAdmin.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (error) {
    console.error("Stripe webhook signature error:", error);
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    const shouldProcess = await recordWebhookEvent(event);
    if (!shouldProcess) {
      return new Response("Already processed", { status: 200 });
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        try {
          if (typeof session.customer === "string") {
            await upsertCustomerFromStripe(session.customer);
          }
          if (typeof session.subscription === "string") {
            const stripeAdmin = getStripeAdmin();
            const subscription = await stripeAdmin.subscriptions.retrieve(session.subscription);
            await upsertSubscriptionFromStripe(subscription);
          }
        } catch (error) {
          // Subscription lifecycle events will also sync the canonical state.
          console.warn("Stripe checkout session sync warning:", {
            eventId: event.id,
            sessionId: session.id,
            error,
          });
        }
        break;
      }
      case "customer.subscription.updated": {
        await upsertSubscriptionFromStripe(event.data.object as Stripe.Subscription);
        break;
      }
      case "customer.subscription.deleted": {
        await markSubscriptionCanceled(event.data.object as Stripe.Subscription);
        break;
      }
      default:
        break;
    }

    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error("Stripe webhook processing error:", {
      eventId: event.id,
      eventType: event.type,
      error,
    });
    return new Response("Webhook error", { status: 500 });
  }
}
