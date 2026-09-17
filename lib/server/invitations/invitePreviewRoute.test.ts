import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  INVITE_PREVIEW_COLUMNS,
  createInvitePreviewGetHandler,
} from './invitePreviewRoute';
import type { InvitePreviewRow } from './invitePreviewRoute';

/**
 * INVITE_CREDENTIALS_SERVER_SIDE_1 -- the preview route and its two callers.
 *
 * The behaviour half of this file exercises the handler directly. The source
 * guards at the end read app/invite/[code]/page.tsx and
 * app/api/invitations/create-link/route.ts, which is where the rest of the fix
 * lives -- `app/**` is NOT in the vitest include globs, so a test placed beside
 * those files would never run, and a guard that never runs passes CI for the
 * wrong reason.
 *
 * The assertion that matters most is the EXACT key set on success. Asserting
 * that `password` and `link_code` are absent would pass while `workspace_id` or
 * `canvas_ids` leaked in from a future edit; pinning the whole set means any
 * addition is a deliberate decision someone has to make here first.
 */

const ROOT = process.cwd();
const sourceOf = (p: string) =>
  readFileSync(resolve(ROOT, p), 'utf8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*')
      && !line.trim().startsWith('/*'))
    .join('\n');

const INVITE_PAGE = 'app/invite/[code]/page.tsx';
const CREATE_LINK = 'app/api/invitations/create-link/route.ts';
const invitePage = sourceOf(INVITE_PAGE);
const createLink = sourceOf(CREATE_LINK);

const NOW = new Date('2026-09-17T12:00:00.000Z');

const row = (overrides: Partial<InvitePreviewRow> = {}): InvitePreviewRow => ({
  role: 'member',
  email_domain: null,
  password: null,
  expires_at: null,
  max_uses: null,
  uses: 0,
  ...overrides,
});

function handlerFor(result: InvitePreviewRow | null | Error, seen: string[] = []) {
  return createInvitePreviewGetHandler({
    now: () => NOW,
    lookup: {
      async findActiveLinkInvitation(code: string) {
        seen.push(code);
        if (result instanceof Error) throw result;
        return result;
      },
    },
  });
}

const call = (handler: (req: Request) => Promise<Response>, code: string | null) =>
  handler(new Request(code === null
    ? 'https://app.test/api/invitations/preview'
    : `https://app.test/api/invitations/preview?code=${encodeURIComponent(code)}`));

describe('the preview succeeds without ever returning a credential', () => {
  it('1. a valid invitation returns EXACTLY the seven permitted keys', async () => {
    const response = await call(handlerFor(row({ role: 'admin', password: 'hunter2' })), 'abc');
    expect(response.status).toBe(200);
    const body = await response.json();
    // The whole set, sorted. Not "password is absent" -- the whole set.
    expect(Object.keys(body).sort()).toEqual([
      'emailDomain', 'expiresAt', 'maxUses', 'requiresPassword', 'role', 'uses', 'valid',
    ]);
  });

  it('2. a password becomes a boolean and the string never leaves the server', async () => {
    const response = await call(handlerFor(row({ password: 'hunter2' })), 'abc');
    const body = await response.json();
    expect(body.requiresPassword).toBe(true);
    expect(JSON.stringify(body)).not.toContain('hunter2');
  });

  it('3. no password, and an empty-string password, both mean not required', async () => {
    for (const password of [null, '']) {
      const response = await call(handlerFor(row({ password })), 'abc');
      const body = await response.json();
      expect(body.requiresPassword, `password=${JSON.stringify(password)}`).toBe(false);
    }
  });

  it('4. the display fields the page needs are carried through', async () => {
    const response = await call(handlerFor(row({
      role: 'readonly', email_domain: 'example.com',
      expires_at: '2026-12-01T00:00:00.000Z', max_uses: 5, uses: 2,
    })), 'abc');
    expect(await response.json()).toEqual({
      valid: true, role: 'readonly', requiresPassword: false, emailDomain: 'example.com',
      expiresAt: '2026-12-01T00:00:00.000Z', maxUses: 5, uses: 2,
    });
  });

  it('5. a null uses counter reads as zero rather than null', async () => {
    const response = await call(handlerFor(row({ uses: null })), 'abc');
    expect((await response.json()).uses).toBe(0);
  });
});

describe('the preview refuses in exactly three ways', () => {
  it('6. an unknown code is 404 invalid', async () => {
    const response = await call(handlerFor(null), 'nope');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ valid: false, reason: 'invalid' });
  });

  it('7. an expired invitation is 410 expired', async () => {
    const response = await call(handlerFor(row({ expires_at: '2026-09-17T11:59:59.000Z' })), 'abc');
    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({ valid: false, reason: 'expired' });
  });

  it('8. an invitation at its use limit is 410 exhausted', async () => {
    const response = await call(handlerFor(row({ max_uses: 3, uses: 3 })), 'abc');
    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({ valid: false, reason: 'exhausted' });
  });

  it('9. max_uses = 0 is exhausted, not unlimited', async () => {
    // The page's old check was `inv.max_uses && inv.uses >= inv.max_uses`, so a
    // zero limit read as falsy and the invitation looked usable. The accept
    // route always used `!== null`; this matches it.
    const response = await call(handlerFor(row({ max_uses: 0, uses: 0 })), 'abc');
    expect(response.status).toBe(410);
    expect((await response.json()).reason).toBe('exhausted');
  });

  it('10. an invitation below its use limit still previews', async () => {
    const response = await call(handlerFor(row({ max_uses: 3, uses: 2 })), 'abc');
    expect(response.status).toBe(200);
  });

  it('11. a missing or blank code is invalid, not an error', async () => {
    for (const code of [null, '', '   ']) {
      const response = await call(handlerFor(row()), code);
      expect(response.status, `code=${JSON.stringify(code)}`).toBe(404);
      expect(await response.json()).toEqual({ valid: false, reason: 'invalid' });
    }
  });

  it('12. a lookup failure is invalid, never a 500 that confirms interest', async () => {
    // A prober must not be able to tell a code that broke the query from a code
    // that does not exist.
    const response = await call(handlerFor(new Error('connection reset')), 'abc');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ valid: false, reason: 'invalid' });
  });

  it('13. every failure body carries exactly two keys', async () => {
    for (const result of [null, row({ expires_at: '2020-01-01T00:00:00.000Z' }), row({ max_uses: 1, uses: 1 })]) {
      const body = await (await call(handlerFor(result), 'abc')).json();
      expect(Object.keys(body).sort()).toEqual(['reason', 'valid']);
    }
  });

  it('14. the code is passed to the lookup trimmed and otherwise verbatim', async () => {
    const seen: string[] = [];
    await call(handlerFor(row(), seen), '  ab/c+d  ');
    expect(seen).toEqual(['ab/c+d']);
  });
});

describe('the invite page no longer holds a credential', () => {
  it('15. it does not query workspace_invitations directly', async () => {
    expect(invitePage).not.toContain('workspace_invitations');
    expect(invitePage).toContain('/api/invitations/preview?code=');
  });

  it('16. the word password survives only as the input and the required flag', () => {
    // The specific defect: reading `invitation.password` and comparing it in the
    // browser. Neither the read nor the comparison may come back.
    expect(invitePage).not.toContain('invitation.password');
    expect(invitePage).not.toContain('inv.password');
    expect(invitePage).not.toMatch(/passwordInput\s*!==\s*invitation/);
    expect(invitePage).not.toMatch(/invitation\.password\s*!==/);
    expect(invitePage).toContain('invitation.requiresPassword');
  });

  it('17. the invitation type declares no password field at all', () => {
    const iface = invitePage.slice(
      invitePage.indexOf('interface WorkspaceInvitation'),
      invitePage.indexOf('export default function InvitePage'),
    );
    expect(iface).not.toMatch(/\bpassword\b/);
    expect(iface).toContain('requiresPassword: boolean');
  });

  it('18. the sign-in redirect and the accept call are untouched', () => {
    // This unit changes where the PREVIEW comes from. The accept route is
    // already correct and the page must keep calling it the same way.
    expect(invitePage).toContain('router.push(`/auth?redirect=/invite/${inviteCode}`)');
    expect(invitePage).toContain("fetch('/api/invitations/accept'");
    expect(invitePage).toContain('password: passwordInput');
  });
});

describe('the invite code is a cryptographic secret', () => {
  it('19. create-link uses crypto.randomBytes and no PRNG', () => {
    expect(createLink).not.toContain('Math.random');
    expect(createLink).toContain("crypto.randomBytes(16).toString('base64url')");
    expect(createLink).toMatch(/^import crypto from 'crypto';$/m);
  });

  it('20. the handler selects the password column but the route never returns it', () => {
    // Reading it is required -- requiresPassword cannot be derived otherwise --
    // so the guarantee is that it is collapsed to a boolean, not that it is
    // never fetched. Test 1 is what proves it does not escape.
    expect(INVITE_PREVIEW_COLUMNS).toContain('password');
    expect(INVITE_PREVIEW_COLUMNS).not.toContain('link_code');
    expect(INVITE_PREVIEW_COLUMNS).not.toContain('workspace_id');
    expect(INVITE_PREVIEW_COLUMNS).not.toContain('canvas_ids');
  });
});
