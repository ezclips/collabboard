import { describe, expect, it, vi } from "vitest";

import {
  createCheckoutHandler,
  type CheckoutHandlerDependencies,
} from "./checkoutRoute";
import type { BillingActor, LiveSubscription } from "./stripeBilling";

/**
 * PATCH-184. Checkout must not open a second subscription, and must refuse a
 * caller who is not a workspace owner or admin.
 */

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

const ACTOR = {
  userId: USER,
  email: "user@example.test",
  supabase: {},
  supabaseAdmin: {},
} as unknown as BillingActor;

const LIVE: LiveSubscription = {
  stripeSubscriptionId: "sub_1",
  plan: "pro",
  priceId: "price_pro_monthly",
};

function makeDeps(
  overrides: Partial<CheckoutHandlerDependencies> = {},
): CheckoutHandlerDependencies {
  return {
    getAuthenticatedSession: vi.fn(async () => ACTOR),
    resolveWorkspace: vi.fn(async () => ({
      workspaceId: WORKSPACE,
      workspaceName: "Workspace",
    })),
    canManageWorkspaceBilling: vi.fn(async () => true),
    findLivePaidSubscription: vi.fn(async () => null),
    getStripePriceId: vi.fn(() => "price_premium_monthly"),
    ensureCustomer: vi.fn(async () => "cus_1"),
    createCheckoutSession: vi.fn(async () => ({ url: "https://checkout.test/session" })),
    ...overrides,
  };
}

const request = (body: unknown) =>
  new Request("http://localhost/api/stripe/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("who may start a checkout", () => {
  it("401s when there is no session", async () => {
    const deps = makeDeps({ getAuthenticatedSession: vi.fn(async () => null) });
    const response = await createCheckoutHandler(deps)(request({ plan: "premium" }));
    expect(response.status).toBe(401);
  });

  it("403s a member who cannot manage billing", async () => {
    const deps = makeDeps({ canManageWorkspaceBilling: vi.fn(async () => false) });
    const response = await createCheckoutHandler(deps)(request({ plan: "premium" }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Only a workspace owner or admin can manage billing.",
    });
    expect(deps.findLivePaidSubscription).not.toHaveBeenCalled();
  });
});

describe("a second subscription is refused", () => {
  it("409s already_subscribed and creates no Stripe session", async () => {
    const deps = makeDeps({ findLivePaidSubscription: vi.fn(async () => LIVE) });
    const response = await createCheckoutHandler(deps)(request({ plan: "premium" }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "This workspace already has a subscription. Change the plan instead.",
      code: "already_subscribed",
    });
    expect(deps.createCheckoutSession).not.toHaveBeenCalled();
  });
});

describe("the happy path still opens one checkout session", () => {
  it("creates the session with the parsed paid plan", async () => {
    const deps = makeDeps();
    const response = await createCheckoutHandler(deps)(request({ plan: "premium" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: "https://checkout.test/session" });
    expect(deps.createCheckoutSession).toHaveBeenCalledTimes(1);
    expect(vi.mocked(deps.createCheckoutSession).mock.calls[0][1]).toMatchObject({
      priceId: "price_premium_monthly",
      plan: "premium",
      interval: "monthly",
      customerId: "cus_1",
      workspaceId: WORKSPACE,
      userId: USER,
    });
  });
});

describe("an unreadable subscription fails closed", () => {
  it("503s and touches nothing in Stripe", async () => {
    const deps = makeDeps({ findLivePaidSubscription: vi.fn(async () => { throw new Error("subscription lookup failed"); }) });
    const response = await createCheckoutHandler(deps)(request({"plan":"premium"}));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Billing is unavailable right now. Try again." });
    expect(deps.ensureCustomer).not.toHaveBeenCalled();
    expect(deps.createCheckoutSession).not.toHaveBeenCalled();
  });
});
