import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { z } from 'zod';

import { projectTranscriptPunctuation } from '@/lib/domain/knowledge/transcriptPunctuationProjection';
import {
  TRANSCRIPT_PUNCTUATE_INSTRUCTION,
  TRANSCRIPT_PUNCTUATE_RETRY_INSTRUCTION,
} from '@/lib/domain/knowledge/transcriptPunctuationInstructions';
import { AI_ROLE_SOURCE } from '@/lib/ai/aiRoles';
import { resolveAIModelForRole } from '@/lib/server/ai/resolveAIModelForRole';
import { getAIProviderAdapter } from '@/lib/server/ai/providers/registry';
import { AIProviderError } from '@/lib/server/ai/providers/errors';
import { aiProviderErrorStatus } from '@/lib/server/settings/aiProviderErrorStatus';
import { createAIRolePreferenceRepository } from '@/lib/infra/settings/aiRolePreferenceRepository';
import { createAIProviderCredentialRepository } from '@/lib/infra/settings/aiProviderCredentialRepository';
import {
  checkAiActionCredits,
  recordBoardAiCreditUsage,
} from '@/lib/server/billing/aiCredits';
import { transcriptPunctuateCredits } from '@/lib/domain/billing/plans';
import { canReadBoardKnowledge } from '@/lib/server/knowledge/knowledgeBoardReadAuthorization';
import type { KnowledgeBoardReadAuthorizationClient } from '@/lib/server/knowledge/knowledgeBoardReadAuthorization';
import { asUserId } from '@/lib/domain/core/ids';

/**
 * MAKE A TRANSCRIPT READABLE, in BATCHES.
 *
 * The reader used to send one `/api/ai/text-action` request per passage, which
 * ran a long video past that route's per-minute limit and left the extra
 * passages silently raw. This route takes up to twelve passages at once, runs
 * them in parallel on the server, and retries a refused passage ONCE with a
 * stricter instruction.
 *
 * THE SAFETY RULE IS UNCHANGED. Every model answer is projected through
 * `projectTranscriptPunctuation`, which discards the model's text and rebuilds
 * from the original words; a passage whose words changed is refused (and its
 * retry attempted), never emitted.
 *
 * NOTHING IS STORED, and no board or document is read: the client sends the
 * text, exactly as `text-action` does today.
 */

export const runtime = 'nodejs';

/** How many passages the route works on at once. */
const MAX_CONCURRENT = 4;
/** How many tokens one passage's answer may use. */
const PASSAGE_MAX_TOKENS = 1500;

const MAX_PASSAGES = 12;
const MAX_PASSAGE_CHARS = 1_200;
const MAX_TOTAL_CHARS = 12_000;

/** The same per-instance limiter the sibling AI routes use. */
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_MAX = 6;
const RATE_LIMIT_WINDOW_MS = 60_000;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(userId, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count += 1;
  return true;
}

const transcriptPunctuateRequestSchema = z.object({
  passages: z.array(z.string().min(1).max(MAX_PASSAGE_CHARS)).min(1).max(MAX_PASSAGES),
  /** PATCH-188. The board this transcript belongs to; the owner's plan pays. */
  boardId: z.string().uuid().optional(),
}).strict();

/** What one passage resolved to. */
type PassageOutcome =
  | { readonly status: 'projected'; readonly text: string }
  | { readonly status: 'refused' }
  | { readonly status: 'failed' };

/**
 * One model call for one passage, projected.
 *
 * Returns the projected text, `refused` when the words changed, and `failed`
 * when the call itself threw (a timeout or a provider error) -- the shape the
 * route distinguishes, because a refusal is worth a retry and a failure is not.
 */
async function punctuateOnce(
  adapter: ReturnType<typeof getAIProviderAdapter>,
  resolved: { model: string; apiKey: string },
  passage: string,
  instruction: string,
  signal: AbortSignal,
): Promise<PassageOutcome> {
  let raw: string;
  try {
    raw = await adapter.generateText({
      model: resolved.model,
      apiKey: resolved.apiKey,
      system: instruction,
      user: passage,
      maxTokens: PASSAGE_MAX_TOKENS,
      // Thinking off (PATCH-162): a thinking model spends the budget reasoning
      // and returns nothing on this shape of request.
      reasoning: 'off',
      signal,
    });
  } catch {
    // A failure is NEVER retried: a timeout or provider error hitting every
    // passage must not multiply the work.
    return { status: 'failed' };
  }
  const projected = projectTranscriptPunctuation(passage, raw);
  return projected.ok ? { status: 'projected', text: projected.value.text } : { status: 'refused' };
}

/** One passage: a normal pass, and ONE retry when the projection refuses. */
async function punctuatePassage(
  adapter: ReturnType<typeof getAIProviderAdapter>,
  resolved: { model: string; apiKey: string },
  passage: string,
  signal: AbortSignal,
): Promise<PassageOutcome> {
  const first = await punctuateOnce(adapter, resolved, passage, TRANSCRIPT_PUNCTUATE_INSTRUCTION, signal);
  if (first.status !== 'refused') return first;
  // Refused: the model changed a word. Ask ONCE more, naming that failure.
  return punctuateOnce(adapter, resolved, passage, TRANSCRIPT_PUNCTUATE_RETRY_INSTRUCTION, signal);
}

/** Runs `task` over `items` with at most `limit` in flight, preserving order. */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await task(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Per USER, not per IP: the unit the model choice and the quota belong to.
    if (!checkRateLimit(user.id)) {
      return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const parsed = transcriptPunctuateRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid transcript-punctuate request.' }, { status: 400 });
    }
    const { passages, boardId } = parsed.data;
    if (passages.reduce((sum, passage) => sum + passage.length, 0) > MAX_TOTAL_CHARS) {
      return NextResponse.json({ error: 'The passages carry too much text.' }, { status: 400 });
    }

    // PATCH-188. One credit per ten passages. Checked before the model runs;
    // the board is read through the CALLER'S OWN session client.
    const creditCost = transcriptPunctuateCredits(passages.length);
    let creditDecision: Awaited<ReturnType<typeof checkAiActionCredits>>;
    try {
      creditDecision = await checkAiActionCredits({
        boardId: boardId ?? null,
        userId: user.id,
        role: AI_ROLE_SOURCE,
        cost: creditCost,
        now: new Date(),
        preferences: createAIRolePreferenceRepository(),
        canReadBoard: (id) => canReadBoardKnowledge(
          supabase as unknown as KnowledgeBoardReadAuthorizationClient,
          id,
          user.id,
        ),
      });
    } catch {
      return NextResponse.json({ error: 'Unavailable' }, { status: 503 });
    }
    if (creditDecision.kind === 'forbidden') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (creditDecision.kind === 'refused') {
      return NextResponse.json(creditDecision.body, { status: creditDecision.status });
    }

    const resolved = await resolveAIModelForRole(asUserId(user.id), AI_ROLE_SOURCE, {
      preferences: createAIRolePreferenceRepository(),
      credentials: createAIProviderCredentialRepository(),
    });
    const adapter = getAIProviderAdapter(resolved.provider);

    // ONE abort for the whole request: when it fires, any passage still working
    // throws and becomes `failed`, and the others are unaffected.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    let results: PassageOutcome[];
    try {
      results = await mapWithConcurrency(
        passages,
        MAX_CONCURRENT,
        (passage) => punctuatePassage(adapter, resolved, passage, controller.signal),
      );
    } finally {
      clearTimeout(timer);
    }

    // PATCH-188. Charged only on a successful managed run. Even when every
    // passage failed, the request itself succeeded and the call was paid for.
    if (creditDecision.kind === 'allowed' && creditDecision.charge && boardId) {
      try {
        await recordBoardAiCreditUsage({
          plan: creditDecision.plan,
          balance: creditDecision.balance,
          boardId,
          userId: user.id,
          feature: 'transcript_punctuate',
          credits: creditCost,
        });
      } catch {
        console.error('AI credit usage was not recorded', {
          boardId,
          feature: 'transcript_punctuate',
          credits: creditCost,
        });
      }
    }

    // 200 even when every passage failed: the client decides what that means.
    return NextResponse.json({ results });
  } catch (error) {
    // The only reachable provider error here is from resolving the model; a
    // generateText failure is already a per-passage `failed`.
    if (error instanceof AIProviderError) {
      return NextResponse.json(
        { error: error.message, category: error.category },
        { status: aiProviderErrorStatus(error.category) },
      );
    }
    return NextResponse.json({ error: 'AI request failed.' }, { status: 502 });
  }
}
