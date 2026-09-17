import { NextResponse } from 'next/server';

/**
 * INVITE_CREDENTIALS_SERVER_SIDE_1 -- the anonymous invite preview.
 *
 * The invite page must be able to say "you have been invited as <role>" and
 * "this one needs a password" BEFORE the visitor signs in. That preview used to
 * come from an anonymous PostgREST read of workspace_invitations, which handed
 * the caller `link_code` and the plaintext `password` along with it. This route
 * replaces that read: the row is fetched with the service role on the server,
 * and only a fixed, credential-free key set ever leaves the process.
 *
 * IT DELIBERATELY DECIDES NOTHING. Every rule it applies -- expiry, max_uses --
 * is also enforced by app/api/invitations/accept, which is the only place that
 * grants membership and the only place the password is ever compared. This
 * route is a display aid; treating it as an authority would put a second,
 * drifting copy of the rules in front of the one that matters.
 *
 * WHY THIS LIVES IN lib/server: a Next route module may export only handlers,
 * so keeping the logic here is what makes it directly testable -- `app/**` is
 * not in the vitest include globs, and a guard that never runs passes CI for
 * the wrong reason.
 */

/** Exactly the columns the preview needs. No credential column is selected. */
export const INVITE_PREVIEW_COLUMNS = 'role, email_domain, password, expires_at, max_uses, uses';

/**
 * `password` IS read, and never returned. The page must know WHETHER a password
 * is required without being told what it is, so the column is collapsed to the
 * boolean `requiresPassword` here, inside the server, and the string is
 * discarded with the row.
 */
export interface InvitePreviewRow {
  readonly role: string | null;
  readonly email_domain: string | null;
  readonly password: string | null;
  readonly expires_at: string | null;
  readonly max_uses: number | null;
  readonly uses: number | null;
}

export interface InvitePreviewLookup {
  /** Resolves an ACTIVE link invitation by code, or null. */
  findActiveLinkInvitation(code: string): Promise<InvitePreviewRow | null>;
}

export interface InvitePreviewRouteDependencies {
  readonly lookup: InvitePreviewLookup;
  /** Injectable so expiry is testable without waiting for a clock. */
  now?(): Date;
}

export type InvitePreviewFailureReason = 'invalid' | 'expired' | 'exhausted';

/**
 * The success payload, in full. Nothing else may be added to it without a
 * deliberate decision: `id`, `workspace_id`, `created_by`, `canvas_ids`,
 * `link_code` and `password` are all absent on purpose, and the route test
 * asserts the EXACT key set rather than the absence of the obvious two.
 */
export interface InvitePreviewSuccess {
  readonly valid: true;
  readonly role: string | null;
  readonly requiresPassword: boolean;
  readonly emailDomain: string | null;
  readonly expiresAt: string | null;
  readonly maxUses: number | null;
  readonly uses: number;
}

export interface InvitePreviewFailure {
  readonly valid: false;
  readonly reason: InvitePreviewFailureReason;
}

/** Same status semantics as the accept route: 404 unknown, 410 spent. */
const FAILURE_STATUS: Record<InvitePreviewFailureReason, number> = {
  invalid: 404,
  expired: 410,
  exhausted: 410,
};

function failure(reason: InvitePreviewFailureReason) {
  const body: InvitePreviewFailure = { valid: false, reason };
  return NextResponse.json(body, { status: FAILURE_STATUS[reason] });
}

export function createInvitePreviewGetHandler(deps: InvitePreviewRouteDependencies) {
  const now = deps.now ?? (() => new Date());

  return async function GET(request: Request): Promise<Response> {
    let code = '';
    try {
      code = (new URL(request.url).searchParams.get('code') ?? '').trim();
    } catch {
      // An unparseable URL cannot name an invitation. Fall through to 'invalid'
      // rather than 400, so this endpoint has exactly two response shapes and
      // never distinguishes "malformed" from "no such code" to a caller.
      code = '';
    }

    if (!code) return failure('invalid');

    let invitation: InvitePreviewRow | null;
    try {
      invitation = await deps.lookup.findActiveLinkInvitation(code);
    } catch {
      // A lookup failure must not become a 500 that tells a prober the code was
      // interesting. It is indistinguishable from "no such invitation" here.
      return failure('invalid');
    }

    if (!invitation) return failure('invalid');

    if (invitation.expires_at && new Date(invitation.expires_at) < now()) {
      return failure('expired');
    }

    const uses = invitation.uses ?? 0;
    // `!== null`, not a truthy test: max_uses = 0 is an exhausted invitation,
    // and this matches the accept route rather than the page's old check.
    if (invitation.max_uses !== null && uses >= invitation.max_uses) {
      return failure('exhausted');
    }

    const body: InvitePreviewSuccess = {
      valid: true,
      role: invitation.role,
      requiresPassword: typeof invitation.password === 'string' && invitation.password.length > 0,
      emailDomain: invitation.email_domain,
      expiresAt: invitation.expires_at,
      maxUses: invitation.max_uses,
      uses,
    };
    return NextResponse.json(body);
  };
}
