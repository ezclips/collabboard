import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * F1 source guard: a password-protected share link must not carry its target
 * identity in the page payload, and the grant must be bound from the LINK row
 * rather than from anything the caller sends.
 *
 * It lives here rather than beside the files it inspects because `app/**` is
 * not in vitest's include globs -- a guard placed there is never collected and
 * would pass CI for the wrong reason. Same reason `sharePasswordRoute.test.ts`
 * exercises the `app/api/**` routes from `lib/server/**`.
 *
 * These are text assertions over three production files. They pin the shape of
 * the fix so a later refactor cannot quietly reintroduce the disclosure. The
 * END-TO-END PROOF is the browser check in B5.4: fetching the protected page
 * with no session and confirming that neither the board uuid nor the padlet
 * uuid appears anywhere in the response body.
 */

/** Line comments only -- a block strip would swallow JSX and fake passes. */
function sourceOf(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8').replace(/^\s*\/\/.*$/gm, '');
}

const page = sourceOf('app/share/[token]/page.tsx');
const client = sourceOf('app/share/[token]/SharePageClient.tsx');
const verifyRoute = sourceOf('app/api/share-link/verify-password/route.ts');

describe('F1: share target ids are disclosed only after the password', () => {
  it('page.tsx withholds all three target props for a protected link', () => {
    expect(page).toContain('const withholdsTarget = isPasswordProtected;');
    expect(page).toContain('boardId={withholdsTarget ? null : boardId}');
    expect(page).toContain('padletId={withholdsTarget ? null : padletId}');
    expect(page).toContain("permission={withholdsTarget ? '' : permission}");
  });

  it('SharePageClient.tsx does not send padletId when verifying the password', () => {
    expect(client).not.toContain('password: passwordInput, padletId');
  });

  it('verify-password derives the grant from the link row, not the request body', () => {
    expect(verifyRoute).toContain('link.padlet_id');
    expect(verifyRoute).not.toContain('const { token, password, padletId }');
  });
});
