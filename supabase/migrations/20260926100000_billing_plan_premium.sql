-- PATCH-183. The Premium plan (.fable5/docs/PRICING.md). ADD VALUE is additive and
-- idempotent; no row changes. It cannot run inside a transaction block on older
-- Postgres, so this file contains nothing else.
ALTER TYPE billing_plan ADD VALUE IF NOT EXISTS 'premium';
-- Rollback: an enum value cannot be dropped in place; to undo, no row may use 'premium'
-- and the type must be recreated. Nothing depends on it until a Premium checkout.
