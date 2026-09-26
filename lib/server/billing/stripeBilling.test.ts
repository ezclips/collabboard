import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type Stripe from "stripe";

import {
  canManageWorkspaceBilling,
  findLivePaidSubscription,
  stripeSubscriptionPeriod,
} from "./stripeBilling";

/**
 * PATCH-184. The two billing authority helpers, with injected clients so no
 * test ever reaches a real database.
 */

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

function rpcClient(result: { data: unknown; error: unknown }): SupabaseClient {
  return { rpc: vi.fn(async () => result) } as unknown as SupabaseClient;
}

function subscriptionClient(row: unknown, error: unknown = null): SupabaseClient {
  const maybeSingle = vi.fn(async () => ({ data: row, error }));
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { from } as unknown as SupabaseClient;
}

describe("canManageWorkspaceBilling", () => {
  it("is true for an owner", async () => {
    expect(
      await canManageWorkspaceBilling(
        rpcClient({ data: "owner", error: null }),
        WORKSPACE,
        USER,
      ),
    ).toBe(true);
  });

  it("is true for an admin", async () => {
    expect(
      await canManageWorkspaceBilling(
        rpcClient({ data: "admin", error: null }),
        WORKSPACE,
        USER,
      ),
    ).toBe(true);
  });

  it("is false for a member", async () => {
    expect(
      await canManageWorkspaceBilling(
        rpcClient({ data: "member", error: null }),
        WORKSPACE,
        USER,
      ),
    ).toBe(false);
  });

  it("is false for a viewer (readonly)", async () => {
    expect(
      await canManageWorkspaceBilling(
        rpcClient({ data: "viewer", error: null }),
        WORKSPACE,
        USER,
      ),
    ).toBe(false);
  });

  it("is false when the role RPC errors", async () => {
    expect(
      await canManageWorkspaceBilling(
        rpcClient({ data: null, error: { message: "boom" } }),
        WORKSPACE,
        USER,
      ),
    ).toBe(false);
  });
});

describe("findLivePaidSubscription", () => {
  it("finds a pro subscription with a granting status", async () => {
    const client = subscriptionClient({
      stripe_subscription_id: "sub_pro",
      plan: "pro",
      status: "active",
      stripe_price_id: "price_pro_monthly",
    });

    expect(await findLivePaidSubscription(client, WORKSPACE)).toEqual({
      stripeSubscriptionId: "sub_pro",
      plan: "pro",
      priceId: "price_pro_monthly",
    });
  });

  it("finds a premium subscription past_due", async () => {
    const client = subscriptionClient({
      stripe_subscription_id: "sub_premium",
      plan: "premium",
      status: "past_due",
      stripe_price_id: "price_premium_yearly",
    });

    expect(await findLivePaidSubscription(client, WORKSPACE)).toEqual({
      stripeSubscriptionId: "sub_premium",
      plan: "premium",
      priceId: "price_premium_yearly",
    });
  });

  it("is null for pro canceled (the status no longer grants the plan)", async () => {
    const client = subscriptionClient({
      stripe_subscription_id: "sub_pro",
      plan: "pro",
      status: "canceled",
      stripe_price_id: "price_pro_monthly",
    });

    expect(await findLivePaidSubscription(client, WORKSPACE)).toBeNull();
  });

  it("is null for free active", async () => {
    const client = subscriptionClient({
      stripe_subscription_id: "sub_free",
      plan: "free",
      status: "active",
      stripe_price_id: null,
    });

    expect(await findLivePaidSubscription(client, WORKSPACE)).toBeNull();
  });

  it("THROWS when the row cannot be read -- never reads as no subscription", async () => {
    // Fail closed: a null here would let checkout open a second subscription.
    await expect(
      findLivePaidSubscription(subscriptionClient(null, { message: "boom" }), WORKSPACE),
    ).rejects.toThrow("subscription lookup failed");
  });

  it("is null when there is no row", async () => {
    expect(await findLivePaidSubscription(subscriptionClient(null), WORKSPACE)).toBeNull();
  });

  it("is null when the row has no stripe subscription id", async () => {
    const client = subscriptionClient({
      stripe_subscription_id: null,
      plan: "pro",
      status: "active",
      stripe_price_id: "price_pro_monthly",
    });

    expect(await findLivePaidSubscription(client, WORKSPACE)).toBeNull();
  });
});

describe("stripeSubscriptionPeriod", () => {
  const START = 1790000000; // 2026-09-21T...
  const END = 1792592000;
  const sub = (shape: unknown) => shape as Stripe.Subscription;

  it("reads the period from the subscription item (the current Stripe API)", () => {
    expect(
      stripeSubscriptionPeriod(
        sub({ items: { data: [{ current_period_start: START, current_period_end: END }] } }),
      ),
    ).toEqual({
      start: new Date(START * 1000).toISOString(),
      end: new Date(END * 1000).toISOString(),
    });
  });

  it("falls back to the old top-level fields", () => {
    expect(
      stripeSubscriptionPeriod(
        sub({ current_period_start: START, current_period_end: END, items: { data: [{}] } }),
      ),
    ).toEqual({
      start: new Date(START * 1000).toISOString(),
      end: new Date(END * 1000).toISOString(),
    });
  });

  it("is null when neither place has it", () => {
    expect(stripeSubscriptionPeriod(sub({ items: { data: [] } }))).toEqual({ start: null, end: null });
  });
});
