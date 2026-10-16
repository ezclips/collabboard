// PATCH-380. The ONE place a guest's permission is decided.
//
// SERVER ONLY. Everything here reads with the ADMIN client: the caller is a
// guest, who cannot read the board row's owner-only switches, and the activity
// ledger is closed to every role but the service role.
//
// FAIL CLOSED, ALWAYS. Anything missing (no board, no user), any refusal, and any
// throw all mean "not allowed" -- the throw reaching the route as a 503. There is
// no path through this module that turns an error into permission.

import type { SupabaseClient } from '@supabase/supabase-js';

import { boardPermissionSatisfies, getBoardPermission } from '@/lib/auth/permissions';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import {
  GUEST_AI_REFUSAL_BODY,
  GUEST_LIMIT_REFUSAL,
  GUEST_UPLOAD_REFUSAL,
} from '@/lib/domain/auth/guest';

export type GuestPermissionKind = 'ai' | 'upload';

export interface GuestRefusal {
  readonly status: 403 | 429;
  readonly body: { readonly error: string; readonly code: string };
}

export type GuestMayResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly refusal: GuestRefusal };

/**
 * The caps, per guest per board. Uploads are capped tightly (a flood is what a
 * rate limit is for); AI is capped over a day, because twenty answers in ten
 * minutes is an ordinary workshop and twenty uploads is not.
 */
const CAPS: Record<GuestPermissionKind, { readonly limit: number; readonly windowMs: number }> = {
  ai: { limit: 20, windowMs: 24 * 60 * 60 * 1000 },
  upload: { limit: 20, windowMs: 10 * 60 * 1000 },
};

function flagOffRefusal(kind: GuestPermissionKind): GuestRefusal {
  return { status: 403, body: kind === 'ai' ? GUEST_AI_REFUSAL_BODY : GUEST_UPLOAD_REFUSAL };
}

export interface GuestMayInput {
  readonly admin: SupabaseClient;
  readonly boardId: string | null | undefined;
  readonly userId: string | null | undefined;
  readonly kind: GuestPermissionKind;
  readonly now: Date;
}

/**
 * May this guest do `kind` on this board right now?
 *
 * 1. A missing board or user is refused -- never "allowed".
 * 2. The caller must be an EDITOR (or admin) of THAT board. `getBoardPermission`
 *    takes the user explicitly, so the service role's null `auth.uid()` is
 *    irrelevant here, and it THROWS on a read error.
 * 3. The owner's switch for this kind must be on.
 * 4. The cap must not be reached.
 */
export async function guestMay(input: GuestMayInput): Promise<GuestMayResult> {
  const { admin, boardId, userId, kind, now } = input;

  if (!boardId || !userId) return { ok: false, refusal: flagOffRefusal(kind) };

  const permission = await getBoardPermission(admin, boardId, userId);
  if (!boardPermissionSatisfies(permission, 'editor')) {
    return { ok: false, refusal: flagOffRefusal(kind) };
  }

  const column = kind === 'ai' ? 'guest_ai_allowed' : 'guest_uploads_allowed';
  const { data, error } = await admin
    .from('boards')
    .select(column)
    .eq('id', boardId)
    .maybeSingle();
  if (error) throw error;
  if ((data as Record<string, unknown> | null)?.[column] !== true) {
    return { ok: false, refusal: flagOffRefusal(kind) };
  }

  const cap = CAPS[kind];
  const since = new Date(now.getTime() - cap.windowMs).toISOString();
  const { count, error: countError } = await admin
    .from('guest_activity')
    .select('id', { count: 'exact', head: true })
    .eq('board_id', boardId)
    .eq('user_id', userId)
    .eq('kind', kind)
    .gte('created_at', since);
  if (countError) throw countError;
  if ((count ?? 0) >= cap.limit) {
    return { ok: false, refusal: { status: 429, body: GUEST_LIMIT_REFUSAL } };
  }

  return { ok: true };
}

/**
 * One row per ALLOWED call or upload, so the next check can count it.
 *
 * BEST EFFORT, deliberately: this runs after the model answered or the file was
 * stored, and a ledger write that fails must not turn a completed action into an
 * error the caller retries. The cost is an under-counted cap, which is the safe
 * direction -- it can only let a guest do one more, never one fewer.
 */
export async function recordGuestActivity(
  admin: SupabaseClient,
  input: {
    readonly boardId: string;
    readonly userId: string;
    readonly kind: GuestPermissionKind;
    readonly now: Date;
  },
): Promise<void> {
  try {
    const { error } = await admin.from('guest_activity').insert({
      board_id: input.boardId,
      user_id: input.userId,
      kind: input.kind,
      created_at: input.now.toISOString(),
    });
    if (error) throw error;
  } catch (error) {
    console.error('Could not record guest activity:', error);
  }
}

/**
 * The ROUTE-FACING recorder. Builds the admin client here, exactly as
 * `recordBoardAiCreditUsage` does, so no AI route ever names one -- a standing
 * guard this repository tests for.
 */
export async function recordGuestActivityForRoute(input: {
  readonly boardId: string;
  readonly userId: string;
  readonly kind: GuestPermissionKind;
  readonly now: Date;
}): Promise<void> {
  await recordGuestActivity(getSupabaseAdmin(), input);
}
