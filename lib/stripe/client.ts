import { isPlanId, PAID_PLAN_IDS } from "@/lib/domain/billing/plans";
import type { PlanId } from "@/lib/domain/billing/plans";

export const STRIPE_PRICE_IDS = {
  proMonthly: process.env.STRIPE_PRICE_PRO_MONTHLY || "",
  proYearly: process.env.STRIPE_PRICE_PRO_YEARLY || "",
  premiumMonthly: process.env.STRIPE_PRICE_PREMIUM_MONTHLY || "",
  premiumYearly: process.env.STRIPE_PRICE_PREMIUM_YEARLY || "",
} as const;

export function getStripePriceId(
  plan: string,
  interval: "monthly" | "yearly" = "monthly",
): string | null {
  if (plan === "pro") {
    return interval === "yearly" ? STRIPE_PRICE_IDS.proYearly : STRIPE_PRICE_IDS.proMonthly;
  }
  if (plan === "premium") {
    return interval === "yearly"
      ? STRIPE_PRICE_IDS.premiumYearly
      : STRIPE_PRICE_IDS.premiumMonthly;
  }
  return null;
}

/** The ONE reverse mapping. An unknown, empty or missing price is Free. */
export function planForStripePrice(priceId?: string | null): PlanId {
  if (!priceId) return "free";
  if (priceId === STRIPE_PRICE_IDS.proMonthly || priceId === STRIPE_PRICE_IDS.proYearly) {
    return "pro";
  }
  if (
    priceId === STRIPE_PRICE_IDS.premiumMonthly ||
    priceId === STRIPE_PRICE_IDS.premiumYearly
  ) {
    return "premium";
  }
  return "free";
}

/**
 * PATCH-183. The checkout body, parsed once. `plan` must be a PAID PlanId;
 * anything else (Free, missing, unknown) is refused rather than defaulted.
 * `interval` defaults to monthly.
 */
export function parseCheckoutRequest(
  body: unknown,
):
  | { ok: true; plan: PlanId; interval: "monthly" | "yearly" }
  | { ok: false; error: "Unknown plan" } {
  const record =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const plan = record.plan;

  if (!isPlanId(plan) || !PAID_PLAN_IDS.includes(plan)) {
    return { ok: false, error: "Unknown plan" };
  }

  return {
    ok: true,
    plan,
    interval: record.interval === "yearly" ? "yearly" : "monthly",
  };
}
