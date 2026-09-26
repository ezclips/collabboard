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
  /** PRICING.md §3: on a paid plan, basic Board AI chat keeps answering when the credits run out. */
  readonly boardChatWhenOutOfCredits: boolean;
}

export interface PlanDefinition {
  readonly id: PlanId;
  readonly name: string; // "Free" | "Pro" | "Premium"
  readonly price: { readonly monthly: number; readonly yearly: number };
  readonly tagline: string; // one short line for the plan card
  readonly limits: PlanLimits;
}

/** PATCH-184. Stripe charges CHF, so the screens must say so. */
export const PLAN_CURRENCY = 'CHF' as const;

/** "CHF 9" / "CHF 9.50" / "CHF 190": no decimals when whole, two otherwise. */
export function formatPlanPrice(amount: number): string {
  const value = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return `${PLAN_CURRENCY} ${value}`;
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
    price: { monthly: 0, yearly: 0 },
    // PATCH-189. Free is for evaluating (PRICING.md Rule 4): its boards stay
    // usable and shareable, but AI and new document processing are off. The
    // grant bucket is kept at 0 (not removed) for future top-up packs.
    tagline: 'Share boards with anyone, free',
    limits: {
      boards: 3,
      fileSizeBytes: 20 * MB,
      processedDocuments: 0,
      pagesPerPdf: 50,
      monthlyAiCredits: 0,
      welcomeAiCredits: 0,
      modelTier: 'basic',
      boardChatWhenOutOfCredits: false,
    },
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: { monthly: 9, yearly: 90 },
    tagline: 'Unlimited boards, files and documents',
    limits: {
      boards: null,
      fileSizeBytes: 250 * MB,
      processedDocuments: null,
      pagesPerPdf: 500,
      monthlyAiCredits: 500,
      welcomeAiCredits: 0,
      modelTier: 'basic',
      boardChatWhenOutOfCredits: true,
    },
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    price: { monthly: 19, yearly: 190 },
    tagline: 'Premium AI models and the largest limits',
    limits: {
      boards: null,
      fileSizeBytes: GB,
      processedDocuments: null,
      pagesPerPdf: 2000,
      monthlyAiCredits: 2000,
      welcomeAiCredits: 0,
      modelTier: 'premium',
      boardChatWhenOutOfCredits: true,
    },
  },
};

export const PLANS: Readonly<Record<PlanId, PlanDefinition>> = deepFreeze(PLAN_DEFINITIONS);

export const PLAN_ORDER: readonly PlanId[] = Object.freeze(['free', 'pro', 'premium']);

export const PAID_PLAN_IDS: readonly PlanId[] = Object.freeze(['pro', 'premium']);

export function isPlanId(value: unknown): value is PlanId {
  return value === 'free' || value === 'pro' || value === 'premium';
}

/**
 * PATCH-186. The stored, user-facing page-limit refusal. A fixed shape so the
 * UI can recognise it and never show any other processing error.
 */
export const PLAN_PAGE_LIMIT_PREFIX = 'Page limit: ';

export function planPageLimitError(pageCount: number, limit: number, planName: string): string {
  return `${PLAN_PAGE_LIMIT_PREFIX}This PDF has ${pageCount} pages. The ${planName} plan allows ${limit} pages per PDF.`;
}

/** True only for the page-limit refusal, by its fixed prefix. */
export function isPlanPageLimitError(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(PLAN_PAGE_LIMIT_PREFIX);
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

/**
 * PATCH-189. The 7-day Premium trial a new workspace gets with no card
 * (PRICING.md Rule 4). Its AI allowance is deliberately small -- a workspace can
 * be created every week, so a full 2,000 would be a free Premium plan.
 */
export const PLAN_TRIAL_DAYS = 7;
export const TRIAL_AI_CREDITS = 100;

/** The trial's limits: Premium's, with the trial's own AI allowance. */
const TRIAL_LIMITS: PlanLimits = Object.freeze({
  ...PLANS.premium.limits,
  monthlyAiCredits: TRIAL_AI_CREDITS,
});

/** The plan a workspace ACTUALLY has right now, and why. */
export interface WorkspacePlan {
  /** 'premium' during the trial, the subscription's plan when it grants, else 'free'. */
  readonly planId: PlanId;
  /** The trial's limits during the trial, the plan's otherwise. */
  readonly limits: PlanLimits;
  /** Non-null only while the trial applies. */
  readonly trial: { readonly endsAt: Date } | null;
  /** The window the AI allowance is scoped to: the subscription period, the trial window, or null. */
  readonly creditPeriod: { start: string | null; end: string | null } | null;
}

const TRIAL_MS = PLAN_TRIAL_DAYS * 24 * 60 * 60 * 1000;

/**
 * The plan a workspace actually has now: a PAYING subscription wins, else the
 * 7-day trial window counted from `workspaceCreatedAt`, else Free.
 *
 * A trial is NOT a live paid subscription -- `effectivePlanId` (and therefore
 * checkout and `findLivePaidSubscription`) is untouched: a trialing workspace
 * can still check out. A missing or unparseable `created_at` fails closed to
 * Free, never to a trial.
 */
export function workspacePlan(
  subscription: {
    plan?: string | null;
    status?: string | null;
    current_period_start?: string | null;
    current_period_end?: string | null;
  } | null,
  workspaceCreatedAt: string | null,
  now: Date,
): WorkspacePlan {
  const planId = effectivePlanId(subscription?.plan, subscription?.status);
  if (planId !== 'free') {
    return {
      planId,
      limits: PLANS[planId].limits,
      trial: null,
      creditPeriod: {
        start: subscription?.current_period_start ?? null,
        end: subscription?.current_period_end ?? null,
      },
    };
  }

  const createdAt = workspaceCreatedAt ? new Date(workspaceCreatedAt) : null;
  if (createdAt && !Number.isNaN(createdAt.getTime())) {
    const endsAt = new Date(createdAt.getTime() + TRIAL_MS);
    if (now < endsAt) {
      return {
        planId: 'premium',
        limits: TRIAL_LIMITS,
        trial: { endsAt },
        creditPeriod: { start: createdAt.toISOString(), end: endsAt.toISOString() },
      };
    }
  }

  return { planId: 'free', limits: PLANS.free.limits, trial: null, creditPeriod: null };
}

/**
 * PATCH-187. The AI features the ledger meters. Every one is declared now, so
 * the migration's check constraint already allows them; PATCH-188 meters the
 * board-less routes and needs no second migration.
 */
export type AiCreditFeature =
  | 'board_chat'
  | 'table_from_document'
  | 'wiki_compile'
  | 'text_action'
  | 'table_fill'
  | 'table_plan'
  | 'transcript_punctuate'
  | 'component';

/**
 * PRICING.md §4, basic model. Must be calibrated against measured costs before
 * launch.
 */
export const AI_CREDIT_COSTS: Readonly<Record<AiCreditFeature, number>> = deepFreeze({
  board_chat: 1,
  table_from_document: 3,
  wiki_compile: 10,
  text_action: 1,
  table_fill: 1,
  table_plan: 1,
  transcript_punctuate: 1,
  component: 1,
});

/** The extra credit a Board AI chat answer costs when board search ran for it. */
export const BOARD_CHAT_SEARCH_SURCHARGE = 1;

/** A half-open window `[start, end)`. */
export interface AiCreditPeriod {
  readonly start: Date;
  readonly end: Date;
}

/**
 * A paid plan with a subscription period that contains `now` uses it;
 * everything else uses the UTC calendar month.
 *
 * The caller passes the stored period only for a paid plan (`BoardPlan`
 * nulls it on Free), so a non-null-but-expired period correctly falls back.
 */
export function aiCreditPeriod(
  now: Date,
  subscriptionPeriod: { start: string | null; end: string | null } | null,
): AiCreditPeriod {
  if (subscriptionPeriod?.start && subscriptionPeriod?.end) {
    const start = new Date(subscriptionPeriod.start);
    const end = new Date(subscriptionPeriod.end);
    if (
      !Number.isNaN(start.getTime())
      && !Number.isNaN(end.getTime())
      && start <= now
      && now < end
    ) {
      return { start, end };
    }
  }
  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  };
}

export interface AiCreditBalance {
  readonly allowance: number; // limits.monthlyAiCredits
  readonly allowanceUsed: number; // this period, bucket 'allowance'
  readonly grantTotal: number; // limits.welcomeAiCredits (top-ups later add here)
  readonly grantUsed: number; // ALL TIME, bucket 'grant'
  readonly remaining: number; // max(0, allowance − allowanceUsed) + max(0, grantTotal − grantUsed)
  readonly period: AiCreditPeriod;
}

export function aiCreditBalance(
  limits: PlanLimits,
  period: AiCreditPeriod,
  used: { allowanceUsed: number; grantUsed: number },
): AiCreditBalance {
  const allowance = limits.monthlyAiCredits;
  const grantTotal = limits.welcomeAiCredits;
  const remaining =
    Math.max(0, allowance - used.allowanceUsed)
    + Math.max(0, grantTotal - used.grantUsed);
  return {
    allowance,
    allowanceUsed: used.allowanceUsed,
    grantTotal,
    grantUsed: used.grantUsed,
    remaining,
    period,
  };
}

export type AiCreditBucket = 'allowance' | 'grant';

/**
 * The monthly allowance is spent first, then the grant. Returns 1 or 2 rows.
 *
 * A charge larger than `remaining` puts the overflow on `'allowance'`, so
 * `allowanceUsed` can exceed the allowance. It never goes the other way: the
 * grant is never overdrawn.
 */
export function splitAiCreditCharge(
  balance: AiCreditBalance,
  credits: number,
): ReadonlyArray<{ bucket: AiCreditBucket; credits: number }> {
  if (credits <= 0) return [];
  const allowanceHeadroom = Math.max(0, balance.allowance - balance.allowanceUsed);
  const grantHeadroom = Math.max(0, balance.grantTotal - balance.grantUsed);
  const fromAllowance = Math.min(credits, allowanceHeadroom);
  const fromGrant = Math.min(credits - fromAllowance, grantHeadroom);
  const overflow = credits - fromAllowance - fromGrant;

  const rows: { bucket: AiCreditBucket; credits: number }[] = [];
  const allowanceCharge = fromAllowance + overflow;
  if (allowanceCharge > 0) rows.push({ bucket: 'allowance', credits: allowanceCharge });
  if (fromGrant > 0) rows.push({ bucket: 'grant', credits: fromGrant });
  return rows;
}

/** PATCH-187. The code a credits refusal carries, so the UI can offer an upgrade. */
export const PLAN_CREDITS_EXHAUSTED_CODE = 'plan_limit_credits';

const PLAN_RENEWAL_DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

export function planCreditsExhaustedError(planName: string, renewsOn: Date): string {
  return `The ${planName} plan's AI credits for this month are used up. They renew on ${PLAN_RENEWAL_DATE_FORMAT.format(renewsOn)}. Upgrade for more.`;
}

/** PATCH-187. A board with no workspace has no plan to meter against. */
export const PLAN_NO_WORKSPACE_CODE = 'plan_limit_no_workspace';

export const PLAN_NO_WORKSPACE_ERROR =
  "This board isn't in a workspace, so it has no AI credits.";

/**
 * PATCH-188. The board-less AI actions refuse on the MANAGED path when the
 * request names no board: there is no owner's plan to meter. A byok caller
 * needs no board at all, and never sees this.
 */
export const PLAN_NO_BOARD_CODE = 'plan_limit_no_board';

export const PLAN_NO_BOARD_ERROR =
  "This AI action isn't linked to a board, so it has no AI credits.";

/**
 * PATCH-189. A plan whose `processedDocuments` is 0 (Free, after the trial)
 * cannot process a new document; the old "The Free plan includes 0 documents"
 * reading would be nonsense. The non-zero wording from PATCH-185 stays for any
 * future non-zero limit.
 */
export const PLAN_DOCUMENTS_ZERO_CODE = 'plan_limit_documents';

export const PLAN_DOCUMENTS_ZERO_ERROR =
  'Processing documents needs a paid plan. Your trial has ended -- upgrade to add more.';

/**
 * PATCH-188. A Readable transcript (transcript-punctuate) costs one credit per
 * ten passages, and at least one for any request that carries a passage.
 */
export function transcriptPunctuateCredits(passageCount: number): number {
  return Math.max(1, Math.ceil(passageCount / 10));
}
