import { z } from 'zod';

import type { BoardSetupPreset, BoardSetupResult } from '@/lib/domain/ai/boardSetup';

/**
 * PATCH-356. The one client-side caller of `POST /ai/board-setup` (rule 1:
 * components make no raw network calls). The response is zod-parsed, so a
 * malformed body is a plain failure rather than a broken preview.
 *
 * Only the preset id and the description are sent.
 */

const itemSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('note'), title: z.string(), text: z.string() }),
  z.object({ type: z.literal('todo'), title: z.string(), tasks: z.array(z.string()) }),
  z.object({ type: z.literal('table'), title: z.string(), rows: z.array(z.array(z.string())) }),
]);
const resultSchema = z.object({
  title: z.string(),
  intro: z.string(),
  columns: z.array(z.object({ title: z.string(), items: z.array(itemSchema) })),
});

export type BoardSetupRequestResult =
  | { readonly ok: true; readonly result: BoardSetupResult | null }
  | { readonly ok: false; readonly status: number; readonly message: string };

const OUT_OF_CREDITS = "You're out of AI credits for this board.";
const TOO_MANY_REQUESTS = 'Too many requests — try again in a minute.';
const FAILED = 'The AI request failed.';

export async function requestBoardSetup(params: {
  readonly boardId: string;
  readonly preset?: BoardSetupPreset;
  readonly description?: string;
}): Promise<BoardSetupRequestResult> {
  const body: Record<string, unknown> = {};
  if (params.preset) body.preset = params.preset;
  if (params.description) body.description = params.description;

  let response: Response;
  try {
    response = await fetch(`/api/boards/${encodeURIComponent(params.boardId)}/ai/board-setup`, {
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
  const parsed = z.object({ result: resultSchema.nullable() }).safeParse(parsedBody);
  if (!parsed.success) return { ok: false, status: 0, message: FAILED };
  return { ok: true, result: parsed.data.result as BoardSetupResult | null };
}
