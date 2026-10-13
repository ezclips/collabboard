import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  NOTES_AI_MAX_NOTES,
  NOTES_AI_TEXT_MAX,
  NOTES_AI_TITLE_MAX,
  NOTES_AI_TOTAL_TEXT_MAX,
  NOTES_AI_TRANSLATE_MAX_SEGMENTS_PER_NOTE,
  NOTES_AI_TRANSLATE_SEGMENT_MAX,
  NOTES_AI_TRANSLATE_TOTAL_MAX,
  isNotesAiLanguage,
  notesAiSystemPrompt,
  parseNotesAiResponse,
  parseTranslation,
} from '@/lib/domain/ai/notesAi';
import { AI_CREDIT_COSTS } from '@/lib/domain/billing/plans';
import {
  BOARD_NOTES_AI_TIMEOUT_MS,
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
 *
 * PATCH-355 adds `translate`: the body carries a language and each note's
 * format-preserving SEGMENTS instead of one text blob. It gets a bigger output
 * cap and a longer clock because a translation is as long as its input.
 */

export const runtime = 'nodejs';

const NOTES_AI_MAX_TOKENS = 2048;
const NOTES_AI_TRANSLATE_MAX_TOKENS = 8_192;
const NOTES_AI_TRANSLATE_TIMEOUT_MS = 60_000;

/** This route's own limiter -- never shared with the notes-to-cards route. */
const checkRateLimit = createBoardNotesAiRateLimiter(10, 60_000);

/** A note ref: N1..N60. */
const refSchema = z.string().regex(/^N([1-9]|[1-5][0-9]|60)$/);

const nonTranslateRequestSchema = z
  .object({
    // PATCH-354 adds 'themes' (Group by theme); same limits, credit, feature.
    action: z.enum(['summary', 'action_plan', 'themes']),
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

const translateRequestSchema = z
  .object({
    action: z.literal('translate'),
    language: z.string(),
    notes: z
      .array(
        z
          .object({
            ref: refSchema,
            title: z.string().max(NOTES_AI_TITLE_MAX),
            segments: z
              .array(z.string().max(NOTES_AI_TRANSLATE_SEGMENT_MAX))
              .max(NOTES_AI_TRANSLATE_MAX_SEGMENTS_PER_NOTE),
          })
          .strict(),
      )
      .min(1)
      .max(NOTES_AI_MAX_NOTES),
  })
  .strict();

const notesActionsRequestSchema = z.union([nonTranslateRequestSchema, translateRequestSchema]);

type NonTranslateBody = {
  readonly action: 'summary' | 'action_plan' | 'themes';
  readonly notes: readonly { readonly ref: string; readonly title: string; readonly text: string }[];
};

type TranslateBody = {
  readonly action: 'translate';
  readonly language: string;
  readonly notes: readonly { readonly ref: string; readonly title: string; readonly segments: readonly string[] }[];
};

type NotesActionsBody = NonTranslateBody | TranslateBody;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const run = await runBoardNotesAi<NotesActionsBody>({
    request,
    context,
    rateLimit: checkRateLimit,
    feature: 'notes_ai',
    cost: AI_CREDIT_COSTS.notes_ai,
    // A translation is as long as its input, so it needs a bigger cap and clock.
    maxTokens: (body) => (body.action === 'translate' ? NOTES_AI_TRANSLATE_MAX_TOKENS : NOTES_AI_MAX_TOKENS),
    timeoutMs: (body) => (body.action === 'translate' ? NOTES_AI_TRANSLATE_TIMEOUT_MS : BOARD_NOTES_AI_TIMEOUT_MS),
    parseBody: (body) => {
      const parsed = notesActionsRequestSchema.safeParse(body);
      if (!parsed.success) return { ok: false, error: 'Invalid notes-actions request.' };
      const data = parsed.data;
      const refs = data.notes.map((note) => note.ref);
      if (new Set(refs).size !== refs.length) {
        return { ok: false, error: 'Note refs must be unique.' };
      }
      if (data.action === 'translate') {
        if (!isNotesAiLanguage(data.language)) {
          return { ok: false, error: 'That is not a language name.' };
        }
        const totalChars = data.notes.reduce(
          (sum, note) => sum + note.title.length + note.segments.reduce((chars, segment) => chars + segment.length, 0),
          0,
        );
        if (totalChars > NOTES_AI_TRANSLATE_TOTAL_MAX) {
          return { ok: false, error: 'The notes are too long together.' };
        }
        return { ok: true, value: data };
      }
      const totalChars = data.notes.reduce((sum, note) => sum + note.title.length + note.text.length, 0);
      if (totalChars > NOTES_AI_TOTAL_TEXT_MAX) {
        return { ok: false, error: 'The notes are too long together.' };
      }
      return { ok: true, value: data };
    },
    buildPrompt: (body) => (body.action === 'translate'
      ? {
        system: notesAiSystemPrompt('translate', body.language),
        // Only refs, titles and segments -- never ids, emails or board names.
        user: JSON.stringify({
          notes: body.notes.map((note) => ({ ref: note.ref, title: note.title, segments: note.segments })),
        }),
      }
      : {
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
  if (run.body.action === 'translate') {
    const expected = new Map(run.body.notes.map((note) => [note.ref, note.segments.length]));
    return NextResponse.json({ result: parseTranslation(run.raw, expected) });
  }
  return NextResponse.json({
    result: parseNotesAiResponse(run.body.action, run.raw, run.body.notes.map((note) => note.ref)),
  });
}
