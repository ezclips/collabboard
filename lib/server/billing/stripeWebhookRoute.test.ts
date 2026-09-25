import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";

import {
  createStripeWebhookHandler,
  type StripeWebhookRouteDependencies,
} from "./stripeWebhookRoute";

/**
 * PATCH-184. The webhook's two hard rules: a processing error answers 500 and
 * marks nothing (so the retry can run), and an event already marked is skipped.
 */

const SUBSCRIPTION = { id: "sub_1", status: "active" } as unknown as Stripe.Subscription;

function event(type: string, object: unknown): Stripe.Event {
  return { id: "evt_1", type, data: { object } } as unknown as Stripe.Event;
}

function makeDeps(
  overrides: Partial<StripeWebhookRouteDependencies> = {},
): StripeWebhookRouteDependencies {
  return {
    getWebhookSecret: vi.fn(() => "whsec_test"),
    constructEvent: vi.fn((_payload: string, _signature: string, _secret: string) =>
      event("customer.subscription.created", SUBSCRIPTION),
    ),
    retrieveSubscription: vi.fn(async () => SUBSCRIPTION),
    alreadyProcessed: vi.fn(async () => false),
    markProcessed: vi.fn(async () => {}),
    upsertCustomerFromStripe: vi.fn(async () => {}),
    upsertSubscriptionFromStripe: vi.fn(async () => {}),
    markSubscriptionCanceled: vi.fn(async () => {}),
    ...overrides,
  };
}

const request = () =>
  new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": "sig_test" },
    body: "{}",
  });

describe("signature is required before anything else", () => {
  it("400s when the signature or secret is missing", async () => {
    const noSecret = makeDeps({ getWebhookSecret: vi.fn(() => undefined) });
    expect((await createStripeWebhookHandler(noSecret)(request())).status).toBe(400);

    const noSignature = createStripeWebhookHandler(makeDeps());
    const response = await noSignature(
      new Request("http://localhost/api/webhooks/stripe", { method: "POST", body: "{}" }),
    );
    expect(response.status).toBe(400);
  });

  it("400s when the event cannot be constructed", async () => {
    const deps = makeDeps({
      constructEvent: vi.fn(() => {
        throw new Error("bad signature");
      }),
    });
    expect((await createStripeWebhookHandler(deps)(request())).status).toBe(400);
  });
});

describe("an error is surfaced, and the event is not marked", () => {
  it("500s a processing error and leaves the event unmarked", async () => {
    const deps = makeDeps({
      upsertSubscriptionFromStripe: vi.fn(async () => {
        throw new Error("sync failed");
      }),
    });
    const response = await createStripeWebhookHandler(deps)(request());

    expect(response.status).toBe(500);
    expect(deps.markProcessed).not.toHaveBeenCalled();
  });

  it("the retry of that event then processes", async () => {
    const failing = makeDeps({
      upsertSubscriptionFromStripe: vi.fn(async () => {
        throw new Error("sync failed");
      }),
    });
    expect((await createStripeWebhookHandler(failing)(request())).status).toBe(500);
    expect(failing.markProcessed).not.toHaveBeenCalled();

    // Stripe redelivers the same event. The marker still says it was never
    // handled, so this delivery processes and only then marks it.
    const retry = makeDeps();
    const response = await createStripeWebhookHandler(retry)(request());

    expect(response.status).toBe(200);
    expect(retry.upsertSubscriptionFromStripe).toHaveBeenCalledTimes(1);
    expect(retry.markProcessed).toHaveBeenCalledTimes(1);
  });
});

describe("an event already marked is skipped", () => {
  it("200s Already processed without processing or re-marking", async () => {
    const deps = makeDeps({ alreadyProcessed: vi.fn(async () => true) });
    const response = await createStripeWebhookHandler(deps)(request());

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("Already processed");
    expect(deps.upsertSubscriptionFromStripe).not.toHaveBeenCalled();
    expect(deps.markProcessed).not.toHaveBeenCalled();
  });
});

describe("lifecycle events sync", () => {
  it("customer.subscription.created syncs the subscription", async () => {
    const deps = makeDeps();
    const response = await createStripeWebhookHandler(deps)(request());

    expect(response.status).toBe(200);
    expect(deps.upsertSubscriptionFromStripe).toHaveBeenCalledWith(SUBSCRIPTION);
    expect(deps.markProcessed).toHaveBeenCalledTimes(1);
  });

  it("checkout.session.completed with a failing sync answers 500", async () => {
    const session = { id: "cs_1", customer: "cus_1", subscription: "sub_1" };
    const deps = makeDeps({
      constructEvent: vi.fn(() => event("checkout.session.completed", session)),
      upsertSubscriptionFromStripe: vi.fn(async () => {
        throw new Error("sync failed");
      }),
    });
    const response = await createStripeWebhookHandler(deps)(request());

    expect(response.status).toBe(500);
    expect(deps.markProcessed).not.toHaveBeenCalled();
  });
});
