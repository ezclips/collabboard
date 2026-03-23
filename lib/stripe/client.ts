export const STRIPE_PRICE_IDS = {
  proMonthly: process.env.STRIPE_PRICE_PRO_MONTHLY || "",
  proYearly: process.env.STRIPE_PRICE_PRO_YEARLY || "",
} as const;

export function getStripePriceId(plan: string, interval: "monthly" | "yearly" = "monthly") {
  if (plan !== "pro") return null;
  return interval === "yearly" ? STRIPE_PRICE_IDS.proYearly : STRIPE_PRICE_IDS.proMonthly;
}
