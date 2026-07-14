import { describe, expect, it } from 'vitest';

import { middlewareRunsOn } from './middlewareMatcher';

describe('middlewareRunsOn', () => {
  it('excludes /auth and its subpaths', () => {
    expect(middlewareRunsOn('/auth')).toBe(false);
    expect(middlewareRunsOn('/auth/callback')).toBe(false);
    expect(middlewareRunsOn('/auth/reset-password')).toBe(false);
  });

  it('excludes /api routes', () => {
    expect(middlewareRunsOn('/api/auth/login')).toBe(false);
    expect(middlewareRunsOn('/api/anything')).toBe(false);
  });

  it('excludes Next.js internals and favicon', () => {
    expect(middlewareRunsOn('/_next/static/chunk.js')).toBe(false);
    expect(middlewareRunsOn('/_next/image')).toBe(false);
    expect(middlewareRunsOn('/favicon.ico')).toBe(false);
  });

  it('does NOT treat "auth" as a prefix match for unrelated routes', () => {
    // Regression: the exclusion used to be a bare `auth` substring, which
    // also matched /authors, /authenticate, etc. (2026-07-14 CTO review).
    expect(middlewareRunsOn('/authors')).toBe(true);
    expect(middlewareRunsOn('/authenticate')).toBe(true);
    expect(middlewareRunsOn('/author-settings')).toBe(true);
  });

  it('runs on ordinary protected pages', () => {
    expect(middlewareRunsOn('/dashboard')).toBe(true);
    expect(middlewareRunsOn('/dashboard/settings/billing')).toBe(true);
    expect(middlewareRunsOn('/')).toBe(true);
  });
});
