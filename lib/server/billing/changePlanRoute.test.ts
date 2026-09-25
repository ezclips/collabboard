import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";

import {
  createChangePlanHandler,
  type ChangePlanHandlerDependencies,
} from "./changePlanRoute";
import type { BillingActor, LiveSubscription } from "./stripeBilling";

/**
 * PATCH-184. The plan-change HTTP edge. The Stripe subscription is injected, so
 * these assert the exact update shaped to keep the double charge away.
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

const SUBSCRIPTION = {
  id: "sub_1",
  status: "active",
  metadata: { workspaceId: WORKSPACE, userId: USER },
  items: { data: [{ id: "si_1", price: { id: "price_pro_monthly" } }] },
} as unknown as Stripe.Subscription;

const UPDATED = {
  id: "sub_1",
  status: "active",
  metadata: { workspaceId: WORKSPACE, userId: USER },
  items: { data: [{ id: "si_1", price: { id: "price_premium_monthly" } }] },
} as unknown as Stripe.Subscription;

function makeDeps(
  overrides: Partial<ChangePlanHandlerDependencies> = {},
): ChangePlanHandlerDependencies {
  return {
    getAuthenticatedSession: vi.fn(async () => ACTOR),
    resolveWorkspace: vi.fn(async () => ({
      workspaceId: WORKSPACE,
      workspaceName: "Workspace",
    })),
    canManageWorkspaceBilling: vi.fn(async () => true),
    findLivePaidSubscription: vi.fn(async () => LIVE),
    getStripePriceId: vi.fn((plan: string, interval: string) => `price_${plan}_${interval}`),
    retrieveSubscription: vi.fn(async () => SUBSCRIPTION),
    updateSubscription: vi.fn(async () => UPDATED),
    syncSubscription: vi.fn(async () => {}),
    ...overrides,
  };
}

const request = (body: unknown) =>
  new Request("http://localhost/api/stripe/change-plan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("refusals happen before anything is changed", () => {
  it("400s a bad plan before it even authenticates", async () => {
    const deps = makeDeps();
    const response = await createChangePlanHandler(deps)(request({ plan: "gold" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Unknown plan" });
    expect(deps.getAuthenticatedSession).not.toHaveBeenCalled();
  });

  it("401s when there is no session", async () => {
    const deps = makeDeps({ getAuthenticatedSession: vi.fn(async () => null) });
    const response = await createChangePlanHandler(deps)(request({ plan: "premium" }));
    expect(response.status).toBe(401);
  });

  it("403s a member who cannot manage billing", async () => {
    const deps = makeDeps({ canManageWorkspaceBilling: vi.fn(async () => false) });
    const response = await createChangePlanHandler(deps)(request({ plan: "premium" }));
    expect(response.status).toBe(403);
    expect(deps.findLivePaidSubscription).not.toHaveBeenCalled();
  });

  it("409s when there is no active subscription to change", async () => {
    const deps = makeDeps({ findLivePaidSubscription: vi.fn(async () => null) });
    const response = await createChangePlanHandler(deps)(request({ plan: "premium" }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "no_subscription" });
    expect(deps.updateSubscription).not.toHaveBeenCalled();
  });

  it("400s when the requested price is already the current one", async () => {
    const deps = makeDeps({
      findLivePaidSubscription: vi.fn(async () => ({ ...LIVE, priceId: "price_pro_monthly" })),
      getStripePriceId: vi.fn(() => "price_pro_monthly"),
    });
    const response = await createChangePlanHandler(deps)(
      request({ plan: "pro", interval: "monthly" }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "This is already your plan." });
    expect(deps.updateSubscription).not.toHaveBeenCalled();
  });

  it("409s when the Stripe subscription does not have exactly one item", async () => {
    const twoItems = {
      ...SUBSCRIPTION,
      items: { data: [{ id: "si_1" }, { id: "si_2" }] },
    } as unknown as Stripe.Subscription;
    const deps = makeDeps({ retrieveSubscription: vi.fn(async () => twoItems) });
    const response = await createChangePlanHandler(deps)(request({ plan: "premium" }));
    expect(response.status).toBe(409);
    expect(deps.updateSubscription).not.toHaveBeenCalled();
    expect(deps.syncSubscription).not.toHaveBeenCalled();
  });
});

describe("the change is one item on the existing subscription", () => {
  it("updates with the single item and create_prorations, then syncs the RETURNED subscription", async () => {
    const deps = makeDeps();
    const response = await createChangePlanHandler(deps)(
      request({ plan: "premium", interval: "monthly" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ plan: "premium", status: "active" });

    expect(deps.updateSubscription).toHaveBeenCalledTimes(1);
    const [actor, subscriptionId, params] = vi.mocked(deps.updateSubscription).mock.calls[0];
    expect(actor).toBe(ACTOR);
    expect(subscriptionId).toBe("sub_1");
    expect(params.items).toEqual([{ id: "si_1", price: "price_premium_monthly" }]);
    expect(params.proration_behavior).toBe("create_prorations");
    expect((params.metadata as Record<string, string> | undefined)?.workspaceId).toBe(WORKSPACE);

    expect(deps.syncSubscription).toHaveBeenCalledTimes(1);
    expect(deps.syncSubscription).toHaveBeenCalledWith(UPDATED);
  });
});

describe("a Stripe failure changes nothing", () => {
  it("502s and does not sync when the retrieve fails", async () => {
    const deps = makeDeps({
      retrieveSubscription: vi.fn(async () => {
        throw new Error("stripe down");
      }),
    });
    const response = await createChangePlanHandler(deps)(request({ plan: "premium" }));
    expect(response.status).toBe(502);
    expect(deps.syncSubscription).not.toHaveBeenCalled();
  });

  it("502s and does not sync when the update fails", async () => {
    const deps = makeDeps({
      updateSubscription: vi.fn(async () => {
        throw new Error("stripe down");
      }),
    });
    const response = await createChangePlanHandler(deps)(request({ plan: "premium" }));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Stripe could not change the plan. Nothing was changed.",
    });
    expect(deps.syncSubscription).not.toHaveBeenCalled();
  });
});

describe("an unreadable subscription fails closed", () => {
  it("503s and touches nothing in Stripe", async () => {
    const deps = makeDeps({
      findLivePaidSubscription: vi.fn(async () => {
        throw new Error("subscription lookup failed");
      }),
    });
    const response = await createChangePlanHandler(deps)(request({ plan: "premium" }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Billing is unavailable right now. Try again." });
    expect(deps.retrieveSubscription).not.toHaveBeenCalled();
    expect(deps.updateSubscription).not.toHaveBeenCalled();
    expect(deps.syncSubscription).not.toHaveBeenCalled();
  });
});
