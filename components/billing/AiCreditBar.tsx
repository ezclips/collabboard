'use client';

/**
 * PATCH-343. The Board AI credit bar: a thin line that shrinks from full to
 * empty, plus a one-time low/empty warning. It shows the BOARD owner's
 * workspace credits (the owner's plan pays -- PRICING.md Rule 1).
 *
 * Renders nothing until real data arrives: a guessed number is worse than none.
 */
import React from 'react';
import Link from 'next/link';
import { toast } from 'sonner';

import {
  creditFillPercent,
  creditLevel,
  shouldWarnCreditOnce,
  type CreditWarningStorage,
} from '@/lib/domain/billing/creditLevel';
import { formatBillingDate } from '@/lib/domain/billing/formatBillingDate';
import type { BoardAiCredits } from '@/lib/hooks/useBoardAiCredits';

/** Warned keys for THIS page load, used when storage is unavailable. */
const WARNED_THIS_LOAD = new Set<string>();

function browserStorage(): CreditWarningStorage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function AiCreditBar({ data }: { data: BoardAiCredits | null }) {
  // Defined at render time so the module has no top-level JSX (the test's
  // classic JSX transform resolves React from the global at render).
  const seePlans = (
    <Link href="/dashboard/settings/billing" className="underline">
      See plans
    </Link>
  );
  const level = data ? creditLevel(data.credits.remaining, data.credits.total) : null;
  const renewsOn = data?.credits.renewsOn ?? null;
  const renews = renewsOn ? ` · renews ${formatBillingDate(renewsOn)}` : '';

  const lowText = data ? `AI credits running low: ${data.credits.remaining.toLocaleString()} left${renews}` : '';
  const emptyText = data
    ? `No AI credits left${renewsOn ? ` until ${formatBillingDate(renewsOn)}` : ''}`
    : '';

  React.useEffect(() => {
    if (!data || data.ownKey || data.planId === 'free') return;
    if (level !== 'low' && level !== 'empty') return;
    const text = level === 'empty' ? emptyText : lowText;
    if (shouldWarnCreditOnce(browserStorage(), WARNED_THIS_LOAD, renewsOn, level)) {
      toast.warning(`${text} · See plans`);
    }
  }, [data, level, renewsOn, emptyText, lowText]);

  if (!data) return null;

  if (data.ownKey) {
    return (
      <p data-ai-credit-bar="own-key" className="mb-1 text-[10px] text-gray-400">
        Using your own AI key — no credits used
      </p>
    );
  }

  if (data.planId === 'free') {
    return (
      <p data-ai-credit-bar="free" className="mb-1 text-[10px] text-gray-400">
        No AI on Free · {seePlans}
      </p>
    );
  }

  const { remaining, total } = data.credits;
  const fill = creditFillPercent(remaining, total);
  const aria = `${remaining.toLocaleString()} of ${total.toLocaleString()} AI credits left${renews}`;
  const trackClass = level === 'empty' ? 'bg-red-500' : 'bg-gray-200';
  const fillClass = level === 'low' ? 'bg-amber-500' : 'bg-blue-500';

  return (
    <div data-ai-credit-bar={level} className="mb-1 w-full">
      <div
        role="meter"
        aria-valuenow={remaining}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={aria}
        title={aria}
        className={`h-1 w-full overflow-hidden rounded ${trackClass}`}
      >
        <div className={`h-1 rounded ${fillClass}`} style={{ width: `${fill}%` }} />
      </div>
      {level === 'low' && (
        <p className="mt-1 text-[10px] text-amber-600">
          {lowText} · {seePlans}
        </p>
      )}
      {level === 'empty' && (
        <p className="mt-1 text-[10px] text-red-600">
          {emptyText} · {seePlans}
        </p>
      )}
    </div>
  );
}

export default AiCreditBar;
