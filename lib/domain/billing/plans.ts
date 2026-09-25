/**
 * PATCH-183. The plans, in ONE pure module: every price and every limit lives
 * here, and nothing else hard-codes "free or pro". `.fable5/docs/PRICING.md`
 * is the rationale for the numbers below; later patches ENFORCE the limits
 * that are only DECLARED here. No I/O, no env.
 */

import { MB } from '../storage/uploadLimits';

export type PlanId = 'free' | 'pro' | 'premium';
export type ModelTier = 'basic' | 'premium';

export interface PlanLimits {
  readonly boards: number | null; // null = unlimited
  readonly fileSizeBytes: number; // per file
  readonly processedDocuments: number | null; // Knowledge documents processed in total; null = unlimited
  readonly pagesPerPdf: number;
  readonly monthlyAiCredits: number;
  readonly welcomeAiCredits: number; // once, on a new workspace
  readonly modelTier: ModelTier;
}

export interface PlanDefinition {
  readonly id: PlanId;
  readonly name: string; // "Free" | "Pro" | "Premium"
  readonly priceUsd: { readonly monthly: number; readonly yearly: number };
  readonly tagline: string; // one short line for the plan card
  readonly limits: PlanLimits;
}

const GB = 1024 * MB;

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

const PLAN_DEFINITIONS: Record<PlanId, PlanDefinition> = {
  free: {
    id: 'free',
    name: 'Free',
    priceUsd: { monthly: 0, yearly: 0 },
    tagline: 'Three boards and a taste of AI',
    limits: {
      boards: 3,
      fileSizeBytes: 20 * MB,
      processedDocuments: 5,
      pagesPerPdf: 50,
      monthlyAiCredits: 10,
      welcomeAiCredits: 30,
      modelTier: 'basic',
    },
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceUsd: { monthly: 9, yearly: 90 },
    tagline: 'Unlimited boards, files and documents',
    limits: {
      boards: null,
      fileSizeBytes: 250 * MB,
      processedDocuments: null,
      pagesPerPdf: 500,
      monthlyAiCredits: 500,
      welcomeAiCredits: 0,
      modelTier: 'basic',
    },
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    priceUsd: { monthly: 19, yearly: 190 },
    tagline: 'Premium AI models and the largest limits',
    limits: {
      boards: null,
      fileSizeBytes: GB,
      processedDocuments: null,
      pagesPerPdf: 2000,
      monthlyAiCredits: 2000,
      welcomeAiCredits: 0,
      modelTier: 'premium',
    },
  },
};

export const PLANS: Readonly<Record<PlanId, PlanDefinition>> = deepFreeze(PLAN_DEFINITIONS);

export const PLAN_ORDER: readonly PlanId[] = Object.freeze(['free', 'pro', 'premium']);

export const PAID_PLAN_IDS: readonly PlanId[] = Object.freeze(['pro', 'premium']);

export function isPlanId(value: unknown): value is PlanId {
  return value === 'free' || value === 'pro' || value === 'premium';
}

/** A subscription status that grants its plan: active, trialing, past_due. Anything else → Free. */
export function statusGrantsPlan(status: string | null | undefined): boolean {
  return status === 'active' || status === 'trialing' || status === 'past_due';
}

/** The plan whose limits apply NOW: the stored plan when the status grants it, otherwise 'free'. An unknown plan string → 'free'. */
export function effectivePlanId(
  plan: string | null | undefined,
  status: string | null | undefined,
): PlanId {
  if (!isPlanId(plan)) return 'free';
  return statusGrantsPlan(status) ? plan : 'free';
}

export function planLimits(planId: PlanId): PlanLimits {
  return PLANS[planId].limits;
}

/** True when `planId` is at least `required` in PLAN_ORDER (premium ⊇ pro ⊇ free). */
export function planIncludes(planId: PlanId, required: PlanId): boolean {
  return PLAN_ORDER.indexOf(planId) >= PLAN_ORDER.indexOf(required);
}
