import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { resolveClientAccessToken } from '../../imports/clientAuth';

vi.mock('@/lib/supabase/browser', () => ({
  supabaseBrowser: vi.fn(),
}));

const mockedSupabaseBrowser = vi.mocked(supabaseBrowser);

beforeEach(() => {
  mockedSupabaseBrowser.mockReset();
});

describe('resolveClientAccessToken', () => {
  it('returns the current session token from the authoritative browser client', async () => {
    const getSession = vi.fn(async () => ({
      data: { session: { access_token: 'session-token' } },
      error: null,
    }));
    mockedSupabaseBrowser.mockReturnValue({
      auth: { getSession },
    } as unknown as ReturnType<typeof supabaseBrowser>);

    await expect(resolveClientAccessToken()).resolves.toBe('session-token');
    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it('does not retry with refreshSession or localStorage fallback when the session is missing', async () => {
    const getSession = vi.fn(async () => ({
      data: { session: null },
      error: null,
    }));
    const refreshSession = vi.fn();
    mockedSupabaseBrowser.mockReturnValue({
      auth: {
        getSession,
        refreshSession,
      },
    } as unknown as ReturnType<typeof supabaseBrowser>);

    await expect(resolveClientAccessToken()).resolves.toBeNull();
    expect(refreshSession).not.toHaveBeenCalled();
  });
});
