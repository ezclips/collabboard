import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  BOARD_SETUP_DESCRIPTION_MAX,
  boardSetupSystemPrompt,
  isBoardSetupPreset,
  parseBoardSetupResponse,
  type BoardSetupPreset,
} from '@/lib/domain/ai/boardSetup';
import { AI_CREDIT_COSTS } from '@/lib/domain/billing/plans';
import {
  createBoardNotesAiRateLimiter,
  runBoardNotesAi,
} from '@/lib/server/ai/boardNotesAiRun';

/**
 * PATCH-356. BOARD SETUP ASSISTANT: the client sends a preset id and/or a short
 * description, and gets back a starter-board proposal it previews. NOTHING IS
 * STORED here; "Create board" in the browser runs the existing
 * `board.applyTemplate` command (with rollback).
 *
 * ONLY the preset id and the description reach the model -- never ids, emails or
 * board names. The shared pipeline (auth, rate limit, credits, resolve,
 * generate, charge, error mapping) is `boardNotesAiRun`; this route is its own
 * body contract and prompt.
 */

export const runtime = 'nodejs';

const BOARD_SETUP_MAX_TOKENS = 4_096;
const BOARD_SETUP_TIMEOUT_MS = 45_000;

/** This route's own limiter -- never shared with the other notes-AI routes. */
const checkRateLimit = createBoardNotesAiRateLimiter(5, 60_000);

const boardSetupRequestSchema = z
  .object({
    preset: z.string().optional(),
    description: z.string().max(BOARD_SETUP_DESCRIPTION_MAX).optional(),
  })
  .strict();

type BoardSetupBody = {
  readonly preset?: BoardSetupPreset;
  readonly description: string;
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const run = await runBoardNotesAi<BoardSetupBody>({
    request,
    context,
    rateLimit: checkRateLimit,
    feature: 'board_setup',
    cost: AI_CREDIT_COSTS.board_setup,
    maxTokens: BOARD_SETUP_MAX_TOKENS,
    timeoutMs: BOARD_SETUP_TIMEOUT_MS,
    parseBody: (body) => {
      const parsed = boardSetupRequestSchema.safeParse(body);
      if (!parsed.success) return { ok: false, error: 'Invalid board-setup request.' };
      const rawPreset = (parsed.data.preset ?? '').trim();
      const description = (parsed.data.description ?? '').trim();
      if (rawPreset.length > 0 && !isBoardSetupPreset(rawPreset)) {
        return { ok: false, error: 'Unknown preset.' };
      }
      if (rawPreset.length === 0 && description.length === 0) {
        return { ok: false, error: 'Pick an option or describe what you are planning.' };
      }
      const preset = rawPreset.length > 0 ? (rawPreset as BoardSetupPreset) : undefined;
      return { ok: true, value: { preset, description } };
    },
    buildPrompt: (body) => ({
      system: boardSetupSystemPrompt(body.preset),
      // Only the preset id and the description -- never ids, emails or board names.
      user: JSON.stringify({ preset: body.preset ?? null, description: body.description }),
    }),
  });

  if (!run.ok) return run.response;
  // A model that returned prose or a broken body yields `null` -- an answer
  // that could not be used, not a failed request.
  return NextResponse.json({ result: parseBoardSetupResponse(run.raw) });
}
