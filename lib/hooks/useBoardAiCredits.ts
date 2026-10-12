'use client';

/**
 * PATCH-343. The Board AI credit bar's data: the BOARD owner's workspace
 * credits, read once on mount and whenever `refresh()` is called.
 *
 * While loading or after a failure `data` is `null` -- the bar never shows a
 * guessed number. The response is validated with zod (rule 6): a malformed body
 * is treated exactly like a failed read.
 */
import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';

import type { PlanId } from '@/lib/domain/billing/plans';

export interface BoardAiCredits {
  planId: PlanId;
  credits: {
    used: number;
    total: number;
    remaining: number;
    renewsOn: string | null;
  };
  /** True when a chat call uses the caller's own key and spends no credits. */
  ownKey: boolean;
}

/** The shape `GET /api/boards/[id]/ai/credits` must return. */
const boardAiCreditsSchema = z.object({
  planId: z.enum(['free', 'pro', 'premium']),
  credits: z.object({
    used: z.number().nonnegative(),
    total: z.number().nonnegative(),
    remaining: z.number().nonnegative(),
    renewsOn: z.string().nullable(),
  }),
  ownKey: z.boolean(),
});

export function useBoardAiCredits(boardId: string | null | undefined): {
  data: BoardAiCredits | null;
  refresh: () => Promise<void>;
} {
  const [data, setData] = useState<BoardAiCredits | null>(null);

  const refresh = useCallback(async () => {
    if (!boardId) {
      setData(null);
      return;
    }
    try {
      const response = await fetch(`/api/boards/${encodeURIComponent(boardId)}/ai/credits`);
      if (!response.ok) {
        setData(null);
        return;
      }
      const body = await response.json().catch(() => null);
      const parsed = boardAiCreditsSchema.safeParse(body);
      setData(parsed.success ? parsed.data : null);
    } catch {
      setData(null);
    }
  }, [boardId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, refresh };
}
