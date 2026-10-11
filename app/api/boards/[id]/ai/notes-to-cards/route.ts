import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { z } from 'zod';

import {
  NOTES_TO_CARDS_MAX_NOTES,
  NOTES_TO_CARDS_PROMPT,
  NOTES_TO_CARDS_TEXT_MAX,
  NOTES_TO_CARDS_TITLE_MAX,
  NOTES_TO_CARDS_TOTAL_TEXT_MAX,
  parseNotesToCardsResponse,
} from '@/lib/domain/ai/notesToCards';
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
import { AI_CREDIT_COSTS } from '@/lib/domain/billing/plans';
import { canReadBoardKnowledge } from '@/lib/server/knowledge/knowledgeBoardReadAuthorization';
import type { KnowledgeBoardReadAuthorizationClient } from '@/lib/server/knowledge/knowledgeBoardReadAuthorization';
import { asUserId } from '@/lib/domain/core/ids';

/**
 * PATCH-342. SUGGEST CARDS FROM NOTES WITH AI: the client sends the ticked
 * notes (opaque refs + text) and gets back a small list of card suggestions it
 * previews and ticks. NOTHING IS STORED here.
 *
 * ONLY note text goes to the model. The client keeps the ref -> note map, so no
 * post id, user id, email or board name ever leaves the browser, and the route
 * returns refs the client resolves back to its own notes.
 *
 * Credits answer to the SOURCE board's read authority (`canReadBoardKnowledge`
 * on `[id]`): the notes are that board's content. The route names no provider,
 * model or key of its own -- `resolveAIModelForRole` is the one seam.
 */

export const runtime = 'nodejs';

// PATCH-342 Addendum 1. 20 cards x (80-char title + 600-char description) is
// ~13 600 characters (~3 500+ tokens) before JSON overhead, so 1500 cut a full
// answer off mid-JSON and the parser returned null for exactly the large
// brainstorms the feature is for.
const NOTES_TO_CARDS_MAX_TOKENS = 4096;

/** The same per-instance limiter shape the sibling AI routes use. */
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_MAX = 10;
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

/** A note ref: N1..N40. */
const refSchema = z.string().regex(/^N([1-9]|[1-3][0-9]|40)$/);

const notesToCardsRequestSchema = z
  .object({
    notes: z
      .array(
        z
          .object({
            ref: refSchema,
            title: z.string().max(NOTES_TO_CARDS_TITLE_MAX),
            text: z.string().max(NOTES_TO_CARDS_TEXT_MAX),
          })
          .strict(),
      )
      .min(1)
      .max(NOTES_TO_CARDS_MAX_NOTES),
  })
  .strict();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const cookieStore = await cookies();
    const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (!checkRateLimit(user.id)) {
      return NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 });
    }

    const { id: boardId } = await context.params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const parsed = notesToCardsRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid notes-to-cards request.' }, { status: 400 });
    }

    const { notes } = parsed.data;
    const refs = notes.map((note) => note.ref);
    if (new Set(refs).size !== refs.length) {
      return NextResponse.json({ error: 'Note refs must be unique.' }, { status: 400 });
    }
    const totalChars = notes.reduce((sum, note) => sum + note.title.length + note.text.length, 0);
    if (totalChars > NOTES_TO_CARDS_TOTAL_TEXT_MAX) {
      return NextResponse.json({ error: 'The notes are too long together.' }, { status: 400 });
    }

    // AI credits: the source board's read authority decides, and its owner's
    // plan pays (PRICING.md Rule 1).
    let creditDecision: Awaited<ReturnType<typeof checkAiActionCredits>>;
    try {
      creditDecision = await checkAiActionCredits({
        boardId,
        userId: user.id,
        role: AI_ROLE_EDIT,
        cost: AI_CREDIT_COSTS.notes_to_cards,
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

    const resolved = await resolveAIModelForRole(asUserId(user.id), AI_ROLE_EDIT, {
      preferences: createAIRolePreferenceRepository(),
      credentials: createAIProviderCredentialRepository(),
    }, { allowByok: allowByokFor(creditDecision) });
    const adapter = getAIProviderAdapter(resolved.provider);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    let raw: string;
    try {
      raw = await adapter.generateText({
        model: resolved.model,
        apiKey: resolved.apiKey,
        system: `You suggest Kanban cards from brainstorm notes.\n${NOTES_TO_CARDS_PROMPT}`,
        // Only refs, titles and texts -- never ids, emails or board names.
        user: JSON.stringify({ notes: notes.map((note) => ({ ref: note.ref, title: note.title, text: note.text })) }),
        maxTokens: NOTES_TO_CARDS_MAX_TOKENS,
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
          feature: 'notes_to_cards',
          credits: AI_CREDIT_COSTS.notes_to_cards,
        });
      } catch {
        console.error('AI credit usage was not recorded', {
          boardId,
          feature: 'notes_to_cards',
          credits: AI_CREDIT_COSTS.notes_to_cards,
        });
      }
    }

    // A model that returned prose or a broken body yields `null` -- an answer
    // that could not be used, not a failed request.
    return NextResponse.json({ cards: parseNotesToCardsResponse(raw, refs) });
  } catch (error) {
    if (error instanceof AIProviderError) {
      return NextResponse.json(
        { error: error.message, category: error.category },
        { status: aiProviderErrorStatus(error.category) },
      );
    }
    return NextResponse.json({ error: 'AI request failed.' }, { status: 502 });
  }
}
