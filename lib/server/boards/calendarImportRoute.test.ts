import { beforeEach, describe, expect, it, vi } from 'vitest';

// app/api/** is outside vitest.config.ts's include globs, so the route module is
// imported and exercised from here.
const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  createRouteHandlerClient: vi.fn(),
  canReadBoardKnowledge: vi.fn(),
  fetchIcsText: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createRouteHandlerClient: mocks.createRouteHandlerClient,
}));
vi.mock('@/lib/server/knowledge/knowledgeBoardReadAuthorization', () => ({
  canReadBoardKnowledge: mocks.canReadBoardKnowledge,
}));
// Keep the real PublicUrlError / MAX_ICS_BYTES; only the network fetch is stubbed.
vi.mock('@/lib/server/net/publicUrlGuard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/net/publicUrlGuard')>()),
  fetchIcsText: mocks.fetchIcsText,
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const BOARD_ID = '84da6ea7-865d-4c8d-a229-0fd0124d8c10';
const SECRET_URL = 'https://calendar.google.com/secret/address/abc123/private.ics';

let route: typeof import('../../../app/api/boards/[id]/calendar-import/route');

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** The same ICS body the route's own icsText path takes, with a live date. */
function calendarWithOneEvent(): string {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const stamp = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`;
  return `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nUID:1\nSUMMARY:Meeting\nDTSTART:${stamp}T090000Z\nDTEND:${stamp}T100000Z\nEND:VEVENT\nEND:VCALENDAR`;
}

const post = (body: unknown) => route.POST(
  new Request(`http://localhost/api/boards/${BOARD_ID}/calendar-import`, {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }),
  { params: Promise.resolve({ id: BOARD_ID }) },
);

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  mocks.cookies.mockResolvedValue({});
  mocks.createRouteHandlerClient.mockReturnValue({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER_ID } }, error: null })) },
  });
  mocks.canReadBoardKnowledge.mockResolvedValue(true);
  route = await import('../../../app/api/boards/[id]/calendar-import/route');
});

describe('PATCH-326 calendar-import authorization', () => {
  it('401 for an unauthenticated caller', async () => {
    mocks.createRouteHandlerClient.mockReturnValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: { message: 'no' } })) },
    });
    expect((await post({ icsText: calendarWithOneEvent() })).status).toBe(401);
  });

  it('403 when the board is not readable by the caller', async () => {
    mocks.canReadBoardKnowledge.mockResolvedValue(false);
    expect((await post({ icsText: calendarWithOneEvent() })).status).toBe(403);
  });

  it('400 when both url and icsText are sent, or neither', async () => {
    expect((await post({ url: SECRET_URL, icsText: calendarWithOneEvent() })).status).toBe(400);
    expect((await post({})).status).toBe(400);
    expect((await post('not json')).status).toBe(400);
  });
});

describe('PATCH-326 calendar-import icsText path', () => {
  it('returns the parsed events', async () => {
    const response = await post({ icsText: calendarWithOneEvent() });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.truncated).toBe(false);
    expect(body.events).toHaveLength(1);
    expect(body.events[0].title).toBe('Meeting');
  });

  it('413 for text over 2 MB', async () => {
    const huge = `${calendarWithOneEvent()}${'x'.repeat(2 * 1024 * 1024)}`;
    expect((await post({ icsText: huge })).status).toBe(413);
  });

  it('422 for text that is not a calendar', async () => {
    expect((await post({ icsText: 'hello, not a calendar' })).status).toBe(422);
  });
});

describe('PATCH-326 calendar-import url path', () => {
  it('fetches and parses a linked calendar', async () => {
    mocks.fetchIcsText.mockResolvedValue(calendarWithOneEvent());
    const response = await post({ url: SECRET_URL });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.events).toHaveLength(1);
    expect(mocks.fetchIcsText).toHaveBeenCalledWith(SECRET_URL);
  });

  it('422 when the link does not return a calendar', async () => {
    mocks.fetchIcsText.mockResolvedValue('<html>not a calendar</html>');
    expect((await post({ url: SECRET_URL })).status).toBe(422);
  });

  it('502 for an upstream failure, with a message that omits the URL', async () => {
    const { PublicUrlError } = await import('@/lib/server/net/publicUrlGuard');
    mocks.fetchIcsText.mockRejectedValue(
      new PublicUrlError('upstream_error', 'The calendar link could not be read (HTTP 500).', 500),
    );
    const response = await post({ url: SECRET_URL });
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain(SECRET_URL);
  });

  it('400 for a refused host', async () => {
    const { PublicUrlError } = await import('@/lib/server/net/publicUrlGuard');
    mocks.fetchIcsText.mockRejectedValue(new PublicUrlError('blocked_host', 'nope'));
    expect((await post({ url: SECRET_URL })).status).toBe(400);
  });
});

describe('PATCH-326 the calendar URL never appears in a response or a log', () => {
  it('is absent from every response body and every console call', async () => {
    const spies = [
      vi.spyOn(console, 'log').mockImplementation(() => {}),
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
      vi.spyOn(console, 'error').mockImplementation(() => {}),
      vi.spyOn(console, 'info').mockImplementation(() => {}),
    ];
    try {
      mocks.fetchIcsText.mockResolvedValue('not a calendar');
      const refused = await post({ url: SECRET_URL });
      expect(await refused.text()).not.toContain(SECRET_URL);

      mocks.fetchIcsText.mockResolvedValue(calendarWithOneEvent());
      const ok = await post({ url: SECRET_URL });
      expect(await ok.text()).not.toContain(SECRET_URL);

      const logged = spies.flatMap((spy) => spy.mock.calls.map((call) => call.join(' '))).join('\n');
      expect(logged).not.toContain(SECRET_URL);
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }
  });
});
