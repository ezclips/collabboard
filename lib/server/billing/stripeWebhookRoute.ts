import type Stripe from "stripe";

/**
 * PATCH-184. The Stripe webhook's HTTP edge.
 *
 * An event is marked processed only AFTER it has been handled, so a processing
 * error answers 500 and Stripe's retry is allowed to process the same event.
 * A checkout sync failure is no longer swallowed into a 200.
 */

export interface StripeWebhookRouteDependencies {
  getWebhookSecret(): string | undefined;
  constructEvent(payload: string, signature: string, secret: string): Stripe.Event;
  retrieveSubscription(subscriptionId: string): Promise<Stripe.Subscription>;
  alreadyProcessed(event: Stripe.Event): Promise<boolean>;
  markProcessed(event: Stripe.Event): Promise<void>;
  upsertCustomerFromStripe(customerId: string): Promise<unknown>;
  upsertSubscriptionFromStripe(subscription: Stripe.Subscription): Promise<void>;
  markSubscriptionCanceled(subscription: Stripe.Subscription): Promise<void>;
}

export function createStripeWebhookHandler(deps: StripeWebhookRouteDependencies) {
  return async function POST(request: Request): Promise<Response> {
    const signature = request.headers.get("stripe-signature");
    const webhookSecret = deps.getWebhookSecret();

    if (!signature || !webhookSecret) {
      return new Response("Missing Stripe webhook configuration", { status: 400 });
    }

    const payload = await request.text();

    let event: Stripe.Event;
    try {
      event = deps.constructEvent(payload, signature, webhookSecret);
    } catch (error) {
      console.error("Stripe webhook signature error:", error);
      return new Response("Invalid signature", { status: 400 });
    }

    try {
      if (await deps.alreadyProcessed(event)) {
        return new Response("Already processed", { status: 200 });
      }

      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          if (typeof session.customer === "string") {
            await deps.upsertCustomerFromStripe(session.customer);
          }
          if (typeof session.subscription === "string") {
            const subscription = await deps.retrieveSubscription(session.subscription);
            await deps.upsertSubscriptionFromStripe(subscription);
          }
          break;
        }
        case "customer.subscription.created":
        case "customer.subscription.updated": {
          await deps.upsertSubscriptionFromStripe(event.data.object as Stripe.Subscription);
          break;
        }
        case "customer.subscription.deleted": {
          await deps.markSubscriptionCanceled(event.data.object as Stripe.Subscription);
          break;
        }
        default:
          break;
      }

      await deps.markProcessed(event);
      return new Response("ok", { status: 200 });
    } catch (error) {
      console.error("Stripe webhook processing error:", {
        eventId: event.id,
        eventType: event.type,
        error,
      });
      return new Response("Webhook error", { status: 500 });
    }
  };
}
