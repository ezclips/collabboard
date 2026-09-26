'use client';

import React from 'react';

/**
 * PATCH-188. ONE shared piece for the plan-limit refusal the AI routes return.
 *
 * Six surfaces already inline the same `See plans` link; those are deliberately
 * left alone. This is the piece the board-less AI callers use so the same
 * refusal reads identically everywhere it can appear, and so a new caller gets
 * the behaviour by importing rather than by copying.
 */

/**
 * The server's plan-limit refusal, or null for any other error body.
 *
 * Non-null ONLY when `body.code` is a string starting with `plan_limit_` and
 * `body.error` is a non-empty string. Everything else keeps the caller's own,
 * fixed message: an intermediary's body, or a handler that stringified a driver
 * error, must never reach the screen.
 */
export function planLimitFromResponse(
  _status: number,
  body: unknown,
): { message: string; code: string } | null {
  if (typeof body !== 'object' || body === null) return null;
  const code = (body as { code?: unknown }).code;
  const error = (body as { error?: unknown }).error;
  if (typeof code !== 'string' || !code.startsWith('plan_limit_')) return null;
  if (typeof error !== 'string' || error.trim().length === 0) return null;
  return { message: error, code };
}

export interface PlanLimitNoticeProps {
  readonly message: string;
  /** Extra classes for the surrounding element, so each caller keeps its layout. */
  readonly className?: string;
}

export default function PlanLimitNotice({ message, className }: PlanLimitNoticeProps) {
  return (
    <span data-plan-limit-notice="true" className={className}>
      {message}{' '}
      <a href="/dashboard/settings/billing" className="font-medium underline">
        See plans
      </a>
    </span>
  );
}
