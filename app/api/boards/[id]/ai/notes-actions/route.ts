import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  NOTES_AI_MAX_NOTES,
  NOTES_AI_TEXT_MAX,
  NOTES_AI_TITLE_MAX,
  NOTES_AI_TOTAL_TEXT_MAX,
  notesAiSystemPrompt,
  parseNotesAiResponse,
} from '@/lib/domain/ai/notesAi';
import { AI_CREDIT_COSTS } from '@/lib/domain/billing/plans';
import {
  createBoardNotesAiRateLimiter,
  runBoardNotesAi,
} from '@/lib/server/ai/boardNotesAiRun';

/**
 * PATCH-353. AI ON NOTES: the client sends the ticked notes (opaque refs +
 * title + text) and an action, and gets back a summary or an action plan it
 * previews. NOTHING IS STORED here; "Add to board" in the browser is the only
 * write.
 *
 * ONLY refs, titles and texts reach the model. The client keeps the ref -> note
 * map, so no post id, user id, email or board name ever leaves the browser.
 * The shared pipeline (auth, rate limit, credits, resolve, generate, charge,
 * error mapping) is `boardNotesAiRun`; this route is its own body contract and
 * prompt.
 */

export const runtime = 'nodejs';

const NOTES_AI_MAX_TOKENS = 2048;

/** This route's own limiter -- never shared with the notes-to-cards route. */
const checkRateLimit = createBoardNotesAiRateLimiter(10, 60_000);

/** A note ref: N1..N60. */
const refSchema = z.string().regex(/^N([1-9]|[1-5][0-9]|60)$/);

const notesActionsRequestSchema = z
  .object({
    action: z.enum(['summary', 'action_plan']),
    notes: z
      .array(
        z
          .object({
            ref: refSchema,
            title: z.string().max(NOTES_AI_TITLE_MAX),
            text: z.string().max(NOTES_AI_TEXT_MAX),
          })
          .strict(),
      )
      .min(1)
      .max(NOTES_AI_MAX_NOTES),
  })
  .strict();

type NotesActionsBody = {
  readonly action: 'summary' | 'action_plan';
  readonly notes: readonly { readonly ref: string; readonly title: string; readonly text: string }[];
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const run = await runBoardNotesAi<NotesActionsBody>({
    request,
    context,
    rateLimit: checkRateLimit,
    feature: 'notes_ai',
    cost: AI_CREDIT_COSTS.notes_ai,
    maxTokens: NOTES_AI_MAX_TOKENS,
    parseBody: (body) => {
      const parsed = notesActionsRequestSchema.safeParse(body);
      if (!parsed.success) return { ok: false, error: 'Invalid notes-actions request.' };
      const { action, notes } = parsed.data;
      const refs = notes.map((note) => note.ref);
      if (new Set(refs).size !== refs.length) {
        return { ok: false, error: 'Note refs must be unique.' };
      }
      const totalChars = notes.reduce((sum, note) => sum + note.title.length + note.text.length, 0);
      if (totalChars > NOTES_AI_TOTAL_TEXT_MAX) {
        return { ok: false, error: 'The notes are too long together.' };
      }
      return { ok: true, value: { action, notes } };
    },
    buildPrompt: (body) => ({
      system: notesAiSystemPrompt(body.action),
      // Only refs, titles and texts -- never ids, emails or board names.
      user: JSON.stringify({
        notes: body.notes.map((note) => ({ ref: note.ref, title: note.title, text: note.text })),
      }),
    }),
  });

  if (!run.ok) return run.response;
  // A model that returned prose or a broken body yields `null` -- an answer
  // that could not be used, not a failed request.
  return NextResponse.json({
    result: parseNotesAiResponse(run.body.action, run.raw, run.body.notes.map((note) => note.ref)),
  });
}
