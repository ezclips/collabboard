// PATCH-353. The ONE server pipeline the two "notes AI" routes share.
//
// SERVER ONLY. Extracted from the PATCH-342 notes-to-cards route so the new
// notes-actions route cannot drift from it: auth, a per-route rate limit, the
// board-read credit check (PRICING Rule 1), the model resolve, one generateText
// under a 25 s clock, the charge on a successful managed run, and the
// AIProviderError mapping. The route supplies the body contract and the prompt;
// nothing else differs.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

import { AI_ROLE_EDIT } from '@/lib/ai/aiRoles';
import { resolveAIModelForRole } from '@/lib/server/ai/resolveAIModelForRole';
import { getAIProviderAdapter } from '@/lib/server/ai/providers/registry';
import { AIProviderError } from '@/lib/server/ai/providers/errors';
import { aiProviderErrorStatus } from '@/lib/server/settings/aiProviderErrorStatus';
import { createAIRolePreferenceRepository } from '@/lib/infra/settings/aiRolePreferenceRepository';
import { createAIProviderCredentialRepository } from '@/lib/infra/settings/aiProviderCredentialRepository';
import {
  allowByokFor,
  checkAiActionCredits,
  recordBoardAiCreditUsage,
} from '@/lib/server/billing/aiCredits';
import type { AiCreditFeature } from '@/lib/domain/billing/plans';
import { canReadBoardKnowledge } from '@/lib/server/knowledge/knowledgeBoardReadAuthorization';
import type { KnowledgeBoardReadAuthorizationClient } from '@/lib/server/knowledge/knowledgeBoardReadAuthorization';
import { asUserId } from '@/lib/domain/core/ids';

/** The bounded duration one notes-AI model call gets. */
export const BOARD_NOTES_AI_TIMEOUT_MS = 25_000;

/**
 * A per-route fixed-window limiter. A factory, not a shared map: the two
 * features must never share a counter.
 */
export function createBoardNotesAiRateLimiter(
  max: number,
  windowMs: number,
): (userId: string) => boolean {
  const map = new Map<string, { count: number; windowStart: number }>();
  return (userId: string) => {
    const now = Date.now();
    const entry = map.get(userId);
    if (!entry || now - entry.windowStart > windowMs) {
      map.set(userId, { count: 1, windowStart: now });
      return true;
    }
    if (entry.count >= max) return false;
    entry.count += 1;
    return true;
  };
}

/** A route's own body contract: the validated body, or a 400 message. */
export type BoardNotesAiBodyParse<TBody> =
  | { readonly ok: true; readonly value: TBody }
  | { readonly ok: false; readonly error: string };

export interface BoardNotesAiRunInput<TBody> {
  readonly request: Request;
  readonly context: { readonly params: Promise<{ readonly id: string }> };
  readonly rateLimit: (userId: string) => boolean;
  readonly feature: AiCreditFeature;
  readonly cost: number;
  /** A fixed cap, or one chosen from the parsed body (translate is larger). */
  readonly maxTokens: number | ((body: TBody) => number);
  /** A fixed clock in ms, or one chosen from the parsed body. Default 25 s. */
  readonly timeoutMs?: number | ((body: TBody) => number);
  readonly parseBody: (body: unknown) => BoardNotesAiBodyParse<TBody>;
  readonly buildPrompt: (body: TBody, boardId: string) => {
    readonly system: string;
    readonly user: string;
  };
}

export type BoardNotesAiRunResult<TBody> =
  | { readonly ok: true; readonly raw: string; readonly body: TBody; readonly boardId: string }
  | { readonly ok: false; readonly response: NextResponse };

/**
 * Run the shared pipeline. A non-`ok` result IS the response to return; an `ok`
 * result carries the raw model text and the validated body for the route's own
 * parser.
 */
export async function runBoardNotesAi<TBody>(
  input: BoardNotesAiRunInput<TBody>,
): Promise<BoardNotesAiRunResult<TBody>> {
  try {
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return { ok: false, response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) };
    }

    if (!input.rateLimit(user.id)) {
      return { ok: false, response: NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 }) };
    }

    const { id: boardId } = await input.context.params;

    let body: unknown;
    try {
      body = await input.request.json();
    } catch {
      return { ok: false, response: NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 }) };
    }

    const parsed = input.parseBody(body);
    if (!parsed.ok) {
      return { ok: false, response: NextResponse.json({ error: parsed.error }, { status: 400 }) };
    }

    // AI credits: the source board's read authority decides, and its owner's
    // plan pays (PRICING.md Rule 1).
    let creditDecision: Awaited<ReturnType<typeof checkAiActionCredits>>;
    try {
      creditDecision = await checkAiActionCredits({
        boardId,
        userId: user.id,
        role: AI_ROLE_EDIT,
        cost: input.cost,
        now: new Date(),
        preferences: createAIRolePreferenceRepository(),
        canReadBoard: (id) => canReadBoardKnowledge(
          supabase as unknown as KnowledgeBoardReadAuthorizationClient,
          id,
          user.id,
        ),
      });
    } catch {
      return { ok: false, response: NextResponse.json({ error: 'Unavailable' }, { status: 503 }) };
    }
    if (creditDecision.kind === 'forbidden') {
      return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
    }
    if (creditDecision.kind === 'refused') {
      return { ok: false, response: NextResponse.json(creditDecision.body, { status: creditDecision.status }) };
    }

    const resolved = await resolveAIModelForRole(asUserId(user.id), AI_ROLE_EDIT, {
      preferences: createAIRolePreferenceRepository(),
      credentials: createAIProviderCredentialRepository(),
    }, { allowByok: allowByokFor(creditDecision) });
    const adapter = getAIProviderAdapter(resolved.provider);

    const controller = new AbortController();
    const maxTokens = typeof input.maxTokens === 'function' ? input.maxTokens(parsed.value) : input.maxTokens;
    const timeoutMs = typeof input.timeoutMs === 'function'
      ? input.timeoutMs(parsed.value)
      : input.timeoutMs ?? BOARD_NOTES_AI_TIMEOUT_MS;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let raw: string;
    try {
      const prompt = input.buildPrompt(parsed.value, boardId);
      raw = await adapter.generateText({
        model: resolved.model,
        apiKey: resolved.apiKey,
        system: prompt.system,
        // Only the route's own payload -- never ids, emails or board names.
        user: prompt.user,
        maxTokens,
        reasoning: 'off',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    // Charged only on a successful managed run.
    if (creditDecision.kind === 'allowed' && creditDecision.charge) {
      try {
        await recordBoardAiCreditUsage({
          plan: creditDecision.plan,
          balance: creditDecision.balance,
          boardId,
          userId: user.id,
          feature: input.feature,
          credits: input.cost,
        });
      } catch {
        console.error('AI credit usage was not recorded', {
          boardId,
          feature: input.feature,
          credits: input.cost,
        });
      }
    }

    return { ok: true, raw, body: parsed.value, boardId };
  } catch (error) {
    if (error instanceof AIProviderError) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: error.message, category: error.category },
          { status: aiProviderErrorStatus(error.category) },
        ),
      };
    }
    return { ok: false, response: NextResponse.json({ error: 'AI request failed.' }, { status: 502 }) };
  }
}
