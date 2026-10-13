import { z } from 'zod';

import type { NotesAiAction, NotesAiActionPlan, NotesAiResult, NotesAiSummary } from '@/lib/domain/ai/notesAi';

/**
 * PATCH-353. The one client-side caller of `POST /ai/notes-actions` (rule 1:
 * components make no raw network calls). The response is zod-parsed per action,
 * so a malformed body is a plain failure rather than a broken preview.
 *
 * Only refs, titles and texts are sent; the ref -> note map stays in the hook.
 */

const summarySchema = z.object({
  title: z.string(),
  summary: z.string(),
  points: z.array(z.string()),
});
const taskSchema = z.object({ text: z.string(), sourceRefs: z.array(z.string()) });
const planSchema = z.object({ title: z.string(), tasks: z.array(taskSchema) });

export type NotesAiRequestResult =
  | { readonly ok: true; readonly result: NotesAiResult | null }
  | { readonly ok: false; readonly status: number; readonly message: string };

const OUT_OF_CREDITS = "You're out of AI credits for this board.";
const TOO_MANY_REQUESTS = 'Too many requests — try again in a minute.';
const FAILED = 'The AI request failed.';

export async function requestNotesAi(params: {
  readonly boardId: string;
  readonly action: NotesAiAction;
  readonly notes: readonly { readonly ref: string; readonly title: string; readonly text: string }[];
}): Promise<NotesAiRequestResult> {
  let response: Response;
  try {
    response = await fetch(`/api/boards/${encodeURIComponent(params.boardId)}/ai/notes-actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: params.action, notes: params.notes }),
    });
  } catch {
    return { ok: false, status: 0, message: FAILED };
  }

  if (!response.ok) {
    if (response.status === 402) return { ok: false, status: 402, message: OUT_OF_CREDITS };
    if (response.status === 429) return { ok: false, status: 429, message: TOO_MANY_REQUESTS };
    const body = await response.json().catch(() => null) as { error?: unknown } | null;
    const message = typeof body?.error === 'string' && body.error.length > 0 ? body.error : FAILED;
    return { ok: false, status: response.status, message };
  }

  const body = await response.json().catch(() => null);
  const schema = z.object({
    result: (params.action === 'summary' ? summarySchema : planSchema).nullable(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return { ok: false, status: 0, message: FAILED };
  return { ok: true, result: parsed.data.result as NotesAiSummary | NotesAiActionPlan | null };
}
