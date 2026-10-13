import { z } from 'zod';

import type { NotesAiResult } from '@/lib/domain/ai/notesAi';

/**
 * PATCH-353. The one client-side caller of `POST /ai/notes-actions` (rule 1:
 * components make no raw network calls). The response is zod-parsed per action,
 * so a malformed body is a plain failure rather than a broken preview.
 *
 * Only refs, titles and texts (or, for translate, segments) are sent; the
 * ref -> note map stays in the hook.
 */

const summarySchema = z.object({
  title: z.string(),
  summary: z.string(),
  points: z.array(z.string()),
});
const taskSchema = z.object({ text: z.string(), sourceRefs: z.array(z.string()) });
const planSchema = z.object({ title: z.string(), tasks: z.array(taskSchema) });
// PATCH-354. Group by theme.
const themesSchema = z.object({
  themes: z.array(z.object({ title: z.string(), noteRefs: z.array(z.string()) })),
});
// PATCH-355. Translate: each note's title and its segments, plus failed refs.
const translationSchema = z.object({
  notes: z.array(z.object({ ref: z.string(), title: z.string(), segments: z.array(z.string()) })),
  failedRefs: z.array(z.string()),
});

export type NotesAiRequestResult =
  | { readonly ok: true; readonly result: NotesAiResult | null }
  | { readonly ok: false; readonly status: number; readonly message: string };

export type NotesAiRequestParams =
  | {
    readonly boardId: string;
    readonly action: 'summary' | 'action_plan' | 'themes';
    readonly notes: readonly { readonly ref: string; readonly title: string; readonly text: string }[];
  }
  | {
    readonly boardId: string;
    readonly action: 'translate';
    readonly language: string;
    readonly notes: readonly { readonly ref: string; readonly title: string; readonly segments: readonly string[] }[];
  };

const OUT_OF_CREDITS = "You're out of AI credits for this board.";
const TOO_MANY_REQUESTS = 'Too many requests — try again in a minute.';
const FAILED = 'The AI request failed.';

export async function requestNotesAi(params: NotesAiRequestParams): Promise<NotesAiRequestResult> {
  const body = params.action === 'translate'
    ? { action: params.action, language: params.language, notes: params.notes }
    : { action: params.action, notes: params.notes };

  let response: Response;
  try {
    response = await fetch(`/api/boards/${encodeURIComponent(params.boardId)}/ai/notes-actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: 0, message: FAILED };
  }

  if (!response.ok) {
    if (response.status === 402) return { ok: false, status: 402, message: OUT_OF_CREDITS };
    if (response.status === 429) return { ok: false, status: 429, message: TOO_MANY_REQUESTS };
    const errorBody = await response.json().catch(() => null) as { error?: unknown } | null;
    const message = typeof errorBody?.error === 'string' && errorBody.error.length > 0 ? errorBody.error : FAILED;
    return { ok: false, status: response.status, message };
  }

  const parsedBody = await response.json().catch(() => null);
  const resultSchema = params.action === 'summary'
    ? summarySchema
    : params.action === 'themes'
      ? themesSchema
      : params.action === 'translate'
        ? translationSchema
        : planSchema;
  const parsed = z.object({ result: resultSchema.nullable() }).safeParse(parsedBody);
  if (!parsed.success) return { ok: false, status: 0, message: FAILED };
  return { ok: true, result: parsed.data.result as NotesAiResult | null };
}
