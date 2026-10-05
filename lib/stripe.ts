import Stripe from "stripe";

let client: Stripe | undefined;

/**
 * Lazily-created Stripe client, mirroring lib/db.ts's getDb(): importing
 * this module must never throw at build time (Vercel's build step has no
 * environment secrets and no reason to need one).
 *
 * This app uses Stripe PaymentIntents directly (not Products/Prices) for
 * bookings, since each order's amount is computed dynamically by the
 * pricing engine. Stripe Price/subscription objects are reserved for the
 * later Realtor subscription feature.
 */
export function getStripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error(
        "STRIPE_SECRET_KEY is not set. Add it to your environment configuration (see .env.example)."
      );
    }
    client = new Stripe(key);
  }
  return client;
}

export function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error(
      "STRIPE_WEBHOOK_SECRET is not set. Add it to your environment configuration (see .env.example)."
    );
  }
  return secret;
}
