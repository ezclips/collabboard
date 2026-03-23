import Stripe from "stripe";

export function getStripeAdmin() {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

  if (!stripeSecretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY");
  }

  return new Stripe(stripeSecretKey, {
    apiVersion: "2025-08-27.basil" as any,
  });
}
