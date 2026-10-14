import { describe, expect, it } from 'vitest';

import { guestRedirectPath } from './guestRouteGuard';

describe('PATCH-358 guestRedirectPath', () => {
  it('sends a guest from /dashboard to /guest', () => {
    expect(guestRedirectPath('/dashboard', true)).toBe('/guest');
    expect(guestRedirectPath('/dashboard/settings', true)).toBe('/guest');
    expect(guestRedirectPath('/dashboard/settings/billing', true)).toBe('/guest');
    expect(guestRedirectPath('/dashboard/anything', true)).toBe('/guest');
  });

  it('lets a guest stay on a board canvas and its sub-paths', () => {
    const id = '11111111-2222-3333-4444-555555555555';
    expect(guestRedirectPath(`/dashboard/canvas/${id}`, true)).toBeNull();
    expect(guestRedirectPath(`/dashboard/canvas/${id}/`, true)).toBeNull();
    expect(guestRedirectPath(`/dashboard/canvas/${id}/post/7`, true)).toBeNull();
  });

  it('sends a guest away from /dashboard/canvas with no id', () => {
    expect(guestRedirectPath('/dashboard/canvas', true)).toBe('/guest');
  });

  it('never redirects a normal user', () => {
    expect(guestRedirectPath('/dashboard', false)).toBeNull();
    expect(guestRedirectPath('/dashboard/settings', false)).toBeNull();
  });

  it('never redirects a guest off a non-dashboard path', () => {
    expect(guestRedirectPath('/', true)).toBeNull();
    expect(guestRedirectPath('/share/token', true)).toBeNull();
    expect(guestRedirectPath('/guest', true)).toBeNull();
    expect(guestRedirectPath('/dashboardish', true)).toBeNull();
  });
});
