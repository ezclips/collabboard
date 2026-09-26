import type { SupabaseClient } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import type Stripe from "stripe";

import { effectivePlanId, type PlanId } from "@/lib/domain/billing/plans";
import { getStripeAdmin } from "@/lib/stripe/admin";
import { planForStripePrice } from "@/lib/stripe/client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveCurrentWorkspace } from "@/lib/workspace/context";

/**
 * PATCH-184. The ONE server-side Stripe <-> Supabase sync, plus the billing
 * authority checks. The webhook, checkout and change-plan routes all import
 * from here, so a subscription row is written in exactly one place.
 */

type StripeSubscriptionRow = {
  workspace_id: string;
  customer_id?: string | null;
  stripe_subscription_id: string;
  stripe_price_id?: string | null;
  stripe_product_id?: string | null;
  plan: PlanId;
  status?: string | null;
  cancel_at_period_end: boolean;
  current_period_start?: string | null;
  current_period_end?: string | null;
  trial_start?: string | null;
  trial_end?: string | null;
  canceled_at?: string | null;
  metadata: Record<string, string>;
};

export interface LiveSubscription {
  readonly stripeSubscriptionId: string;
  readonly plan: PlanId;
  readonly priceId: string | null;
}

function toIsoOrNull(value?: number | null) {
  return value ? new Date(value * 1000).toISOString() : null;
}

/** Only a workspace owner or admin may manage billing. */
export async function canManageWorkspaceBilling(
  supabase: SupabaseClient,
  workspaceId: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("get_workspace_role", {
    workspace_uuid: workspaceId,
    user_uuid: userId,
  });

  if (error) return false;

  return data === "owner" || data === "admin";
}

/**
 * The workspace's live paid subscription, or null. "Live" = a stored
 * stripe_subscription_id AND statusGrantsPlan(status) AND a paid effective plan.
 */
export async function findLivePaidSubscription(
  supabaseAdmin: SupabaseClient,
  workspaceId: string,
): Promise<LiveSubscription | null> {
  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .select("stripe_subscription_id, plan, status, stripe_price_id")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  // Fail CLOSED: an unreadable row must never read as "no subscription", or
  // checkout would open a second one and bill twice. Callers answer 503.
  if (error) throw new Error("subscription lookup failed");
  if (!data) return null;

  const row = data as {
    stripe_subscription_id?: string | null;
    plan?: string | null;
    status?: string | null;
    stripe_price_id?: string | null;
  };

  if (!row.stripe_subscription_id) return null;

  const plan = effectivePlanId(row.plan, row.status);
  if (plan === "free") return null;

  return {
    stripeSubscriptionId: row.stripe_subscription_id,
    plan,
    priceId: row.stripe_price_id ?? null,
  };
}

/** The existing SELECT, split out so the webhook can check before processing. */
export async function alreadyProcessed(
  supabaseAdmin: SupabaseClient,
  event: { id: string },
): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("webhook_events")
    .select("id")
    .eq("provider", "stripe")
    .eq("event_id", event.id)
    .maybeSingle();

  return Boolean(data);
}

/**
 * The existing INSERT, run only AFTER an event has been processed. A 23505
 * (another delivery won the race) is fine; anything else is a real failure.
 */
export async function markProcessed(
  supabaseAdmin: SupabaseClient,
  event: { id: string; type: string },
): Promise<void> {
  const { error } = await supabaseAdmin.from("webhook_events").insert({
    provider: "stripe",
    event_id: event.id,
    event_type: event.type,
    payload: event as unknown as Record<string, unknown>,
  });

  if (error && (error as { code?: string }).code !== "23505") throw error;
}

export async function upsertCustomerFromStripe(customerId: string) {
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

/**
 * PATCH-187. The billing period, as ISO strings. Stripe's API since 2025-03-31
 * (the one `stripe` v18 speaks) reports it on each subscription ITEM, not on the
 * subscription, so reading only the old top-level fields stored null for every
 * subscription -- and AI credits then renewed on the calendar month instead of
 * the billing date. The item wins; the old field is the fallback.
 */
export function stripeSubscriptionPeriod(
  subscription: Stripe.Subscription,
): { start: string | null; end: string | null } {
  const item = subscription.items?.data?.[0] as
    | { current_period_start?: number | null; current_period_end?: number | null }
    | undefined;
  const legacy = subscription as unknown as {
    current_period_start?: number | null;
    current_period_end?: number | null;
  };
  return {
    start: toIsoOrNull(item?.current_period_start ?? legacy.current_period_start),
    end: toIsoOrNull(item?.current_period_end ?? legacy.current_period_end),
  };
}

export async function upsertSubscriptionFromStripe(subscription: Stripe.Subscription) {
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
  const period = stripeSubscriptionPeriod(subscription);
  const row: StripeSubscriptionRow = {
    workspace_id: workspaceId,
    customer_id: customerRow?.id || null,
    stripe_subscription_id: subscription.id,
    stripe_price_id: firstItem?.price?.id || null,
    stripe_product_id:
      typeof firstItem?.price?.product === "string" ? firstItem.price.product : null,
    plan: planForStripePrice(firstItem?.price?.id || null),
    status: subscription.status,
    cancel_at_period_end: subscription.cancel_at_period_end,
    current_period_start: period.start,
    current_period_end: period.end,
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

export async function markSubscriptionCanceled(subscription: Stripe.Subscription) {
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

export interface BillingActor {
  readonly userId: string;
  readonly email: string | null;
  readonly supabase: SupabaseClient;
  readonly supabaseAdmin: SupabaseClient;
}

/** The logged-in user plus the two clients the billing routes need. */
export async function getBillingActor(request: Request): Promise<BillingActor | null> {
  const supabaseAdmin = getSupabaseAdmin();
  const cookieStore = await cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
  const authHeader = request.headers.get("authorization");
  const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  let {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && accessToken) {
    const {
      data: { user: tokenUser },
      error,
    } = await supabaseAdmin.auth.getUser(accessToken);

    if (error) return null;
    user = tokenUser;
  }

  if (!user) return null;

  return {
    userId: user.id,
    email: user.email ?? null,
    supabase,
    supabaseAdmin,
  };
}

export async function resolveActorWorkspace(
  actor: BillingActor,
): Promise<{ workspaceId: string; workspaceName: string } | null> {
  const workspace = await resolveCurrentWorkspace(
    actor.supabase,
    { id: actor.userId, email: actor.email ?? undefined },
    actor.supabaseAdmin,
  );

  if (!workspace) return null;

  return { workspaceId: workspace.workspaceId, workspaceName: workspace.workspaceName };
}
