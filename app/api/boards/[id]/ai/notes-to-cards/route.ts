import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  NOTES_TO_CARDS_MAX_NOTES,
  NOTES_TO_CARDS_PROMPT,
  NOTES_TO_CARDS_TEXT_MAX,
  NOTES_TO_CARDS_TITLE_MAX,
  NOTES_TO_CARDS_TOTAL_TEXT_MAX,
  parseNotesToCardsResponse,
} from '@/lib/domain/ai/notesToCards';
import { AI_CREDIT_COSTS } from '@/lib/domain/billing/plans';
import {
  createBoardNotesAiRateLimiter,
  runBoardNotesAi,
} from '@/lib/server/ai/boardNotesAiRun';

/**
 * PATCH-342. SUGGEST CARDS FROM NOTES WITH AI: the client sends the ticked
 * notes (opaque refs + text) and gets back a small list of card suggestions it
 * previews and ticks. NOTHING IS STORED here.
 *
 * ONLY note text goes to the model. The client keeps the ref -> note map, so no
 * post id, user id, email or board name ever leaves the browser, and the route
 * returns refs the client resolves back to its own notes.
 *
 * PATCH-353 moved the shared pipeline (auth, rate limit, credits, resolve,
 * generate, charge, error mapping) into `boardNotesAiRun`; this route is now
 * only its own body contract and prompt, with identical behaviour.
 */

export const runtime = 'nodejs';

// PATCH-342 Addendum 1. 20 cards x (80-char title + 600-char description) is
// ~13 600 characters (~3 500+ tokens) before JSON overhead, so 1500 cut a full
// answer off mid-JSON and the parser returned null for exactly the large
// brainstorms the feature is for.
const NOTES_TO_CARDS_MAX_TOKENS = 4096;

/** This route's own limiter -- never shared with the notes-actions route. */
const checkRateLimit = createBoardNotesAiRateLimiter(10, 60_000);

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

type NotesToCardsNote = { ref: string; title: string; text: string };

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const run = await runBoardNotesAi<readonly NotesToCardsNote[]>({
    request,
    context,
    rateLimit: checkRateLimit,
    feature: 'notes_to_cards',
    cost: AI_CREDIT_COSTS.notes_to_cards,
    maxTokens: NOTES_TO_CARDS_MAX_TOKENS,
    parseBody: (body) => {
      const parsed = notesToCardsRequestSchema.safeParse(body);
      if (!parsed.success) return { ok: false, error: 'Invalid notes-to-cards request.' };
      const notes = parsed.data.notes;
      const refs = notes.map((note) => note.ref);
      if (new Set(refs).size !== refs.length) {
        return { ok: false, error: 'Note refs must be unique.' };
      }
      const totalChars = notes.reduce((sum, note) => sum + note.title.length + note.text.length, 0);
      if (totalChars > NOTES_TO_CARDS_TOTAL_TEXT_MAX) {
        return { ok: false, error: 'The notes are too long together.' };
      }
      return { ok: true, value: notes };
    },
    buildPrompt: (notes) => ({
      system: `You suggest Kanban cards from brainstorm notes.\n${NOTES_TO_CARDS_PROMPT}`,
      // Only refs, titles and texts -- never ids, emails or board names.
      user: JSON.stringify({ notes: notes.map((note) => ({ ref: note.ref, title: note.title, text: note.text })) }),
    }),
  });

  if (!run.ok) return run.response;
  // A model that returned prose or a broken body yields `null` -- an answer
  // that could not be used, not a failed request.
  return NextResponse.json({ cards: parseNotesToCardsResponse(run.raw, run.body.map((note) => note.ref)) });
}
