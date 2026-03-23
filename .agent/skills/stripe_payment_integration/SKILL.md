---
name: Stripe Payment Integration
description: Architecture of the Stripe payment integration including checkout flow, webhook handling, billing UI, and the database schema for customers and subscriptions.
---

# Stripe Payment Integration

## Overview

The app uses **Stripe** for subscription billing at the workspace level. Users subscribe to a "Pro" plan (monthly or yearly). The integration includes checkout sessions, a customer billing portal, and webhook processing.

## Key Files

| File | Purpose |
|------|---------|
| `app/api/stripe/checkout/route.ts` | Creates Stripe Checkout sessions |
| `app/api/stripe/portal/route.ts` | Opens the Stripe Customer Billing Portal |
| `app/api/webhooks/stripe/route.ts` | Handles Stripe webhook events |
| `app/dashboard/settings/billing/page.tsx` | Billing UI — plan selection, checkout initiation |
| `lib/stripe/admin.ts` | `getStripeAdmin()` — server-side Stripe client |
| `lib/stripe/client.ts` | `getStripePriceId()` — resolves price IDs from env vars |
| `lib/supabase/admin.ts` | `getSupabaseAdmin()` — service-role Supabase client |
| `supabase/migrations/20260310_add_billing_schema.sql` | Creates `customers`, `subscriptions` tables |
| `supabase/migrations/20260310_add_webhook_events.sql` | Creates `webhook_events` table |

## Environment Variables

```env
STRIPE_SECRET_KEY          # Server-side Stripe API key
STRIPE_WEBHOOK_SECRET      # Webhook signature verification
STRIPE_PRICE_PRO_MONTHLY   # Price ID for monthly Pro plan
STRIPE_PRICE_PRO_YEARLY    # Price ID for yearly Pro plan
NEXT_PUBLIC_APP_URL        # Base URL for redirect URLs
```

## Database Schema

### `customers` table

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid (PK) | Auto-generated |
| `workspace_id` | uuid (FK → workspaces, UNIQUE) | One customer per workspace |
| `stripe_customer_id` | text | Stripe's `cus_xxx` ID |
| `email` | text | Customer email |
| `name` | text | Workspace name |

### `subscriptions` table

| Column | Type | Notes |
|--------|------|-------|
| `workspace_id` | uuid (FK, UNIQUE) | One subscription per workspace |
| `customer_id` | uuid (FK → customers) | Link to customer record |
| `stripe_subscription_id` | text | Stripe's `sub_xxx` ID |
| `stripe_price_id` | text | Active price ID |
| `stripe_product_id` | text | Active product ID |
| `plan` | text | `'free'` or `'pro'` |
| `status` | text | Stripe subscription status |
| `cancel_at_period_end` | boolean | Whether cancellation is pending |
| `current_period_start/end` | timestamptz | Billing period |
| `trial_start/end` | timestamptz | Trial period (if any) |
| `canceled_at` | timestamptz | When canceled |
| `metadata` | jsonb | Stripe metadata |

### `webhook_events` table

| Column | Type | Notes |
|--------|------|-------|
| `provider` | text | Always `'stripe'` |
| `event_id` | text (UNIQUE) | Stripe event ID for idempotency |
| `event_type` | text | e.g. `checkout.session.completed` |
| `payload` | jsonb | Full event payload |

## Checkout Flow

```
User clicks "Upgrade" on Billing page
  → POST /api/stripe/checkout { plan, interval }
  → Resolves workspace via resolveCurrentWorkspace()
  → Finds or creates Stripe Customer (upserts to `customers` table)
  → Creates Stripe Checkout Session
  → Returns { url } → redirects browser to Stripe
  → User completes payment on Stripe
  → Stripe redirects to /dashboard/settings/billing?checkout=success
```

## Webhook Processing

The webhook handler (`POST /api/webhooks/stripe`) processes these events:

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Upserts customer, upserts subscription |
| `customer.subscription.updated` | Upserts subscription (plan changes, renewals) |
| `customer.subscription.deleted` | Marks subscription as canceled, sets plan to `'free'` |

### Idempotency

All webhook events are recorded in `webhook_events` table. Duplicate events (same `event_id`) are skipped.

### Key Helper Functions (in webhook route)

| Function | Purpose |
|----------|---------|
| `recordWebhookEvent()` | Idempotent event recording |
| `upsertCustomerFromStripe()` | Syncs Stripe customer data to `customers` table |
| `upsertSubscriptionFromStripe()` | Syncs subscription data including plan resolution |
| `markSubscriptionCanceled()` | Handles subscription deletion |
| `resolvePlanFromPrice()` | Maps Stripe price IDs → `'pro'` or `'free'` |

## Billing Portal

```
User clicks "Manage Subscription" on Billing page
  → POST /api/stripe/portal
  → Creates Stripe Billing Portal session for the customer
  → Returns { url } → opens portal in new tab
```

## Billing UI (`billing/page.tsx`)

- Displays current plan status (Free/Pro)
- Shows plan cards with feature lists and pricing (monthly/yearly toggle)
- "Upgrade" button → triggers Stripe Checkout
- "Manage Subscription" button → opens Stripe Portal
- Uses `getBoardLimitForEntitlements()` and `getPermissionContext()` from `lib/auth/permissions`

## Gotchas

- Workspace must exist before checkout — `resolveCurrentWorkspace()` is called server-side
- Customer records are workspace-scoped (one per workspace), not user-scoped
- The `resolvePlanFromPrice()` function only recognizes price IDs from env vars — unknown prices default to `'free'`
- Webhook events use `{ runtime: 'nodejs' }` — required for Stripe signature verification
