import { createStripeWebhookHandler } from "@/lib/server/billing/stripeWebhookRoute";
import {
  alreadyProcessed,
  markProcessed,
  markSubscriptionCanceled,
  upsertCustomerFromStripe,
  upsertSubscriptionFromStripe,
} from "@/lib/server/billing/stripeBilling";
import { getStripeAdmin } from "@/lib/stripe/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export const POST = createStripeWebhookHandler({
  getWebhookSecret: () => process.env.STRIPE_WEBHOOK_SECRET,
  constructEvent: (payload, signature, secret) =>
    getStripeAdmin().webhooks.constructEvent(payload, signature, secret),
  retrieveSubscription: (subscriptionId) =>
    getStripeAdmin().subscriptions.retrieve(subscriptionId),
  alreadyProcessed: (event) => alreadyProcessed(getSupabaseAdmin(), event),
  markProcessed: (event) => markProcessed(getSupabaseAdmin(), event),
  upsertCustomerFromStripe,
  upsertSubscriptionFromStripe,
  markSubscriptionCanceled,
});
