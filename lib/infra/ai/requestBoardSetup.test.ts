import { afterEach, describe, expect, it, vi } from 'vitest';

import { requestBoardSetup } from './requestBoardSetup';

const RESULT = {
  title: 'Retro',
  intro: 'A short retro board.',
  columns: [{ title: 'Went well', items: [{ type: 'note', title: 'Wins', text: 'What worked?' }] }],
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => { vi.unstubAllGlobals(); });

describe('PATCH-356 requestBoardSetup', () => {
  it('sends the preset and description and returns the parsed result', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({ result: RESULT }));
    vi.stubGlobal('fetch', fetchMock);
    const response = await requestBoardSetup({ boardId: 'b1', preset: 'retrospective', description: 'A retro' });
    expect(response).toEqual({ ok: true, result: RESULT });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ preset: 'retrospective', description: 'A retro' });
  });

  it('omits an absent description', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({ result: RESULT }));
    vi.stubGlobal('fetch', fetchMock);
    await requestBoardSetup({ boardId: 'b1', preset: 'brainstorm' });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({ preset: 'brainstorm' });
  });

  it('returns a null result as-is', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ result: null })));
    expect(await requestBoardSetup({ boardId: 'b1', preset: 'brainstorm' }))
      .toEqual({ ok: true, result: null });
  });

  it('a malformed 200 body is a plain failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ result: { title: 5 } })));
    expect(await requestBoardSetup({ boardId: 'b1', preset: 'brainstorm' }))
      .toEqual({ ok: false, status: 0, message: 'The AI request failed.' });
  });

  it('maps 402 to the out-of-credits message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'nope' }, 402)));
    expect(await requestBoardSetup({ boardId: 'b1', preset: 'brainstorm' }))
      .toEqual({ ok: false, status: 402, message: "You're out of AI credits for this board." });
  });

  it('maps 429 to the rate-limit message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'nope' }, 429)));
    expect(await requestBoardSetup({ boardId: 'b1', preset: 'brainstorm' }))
      .toEqual({ ok: false, status: 429, message: 'Too many requests — try again in a minute.' });
  });

  it('uses the server message for any other failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'Server said no.' }, 500)));
    expect(await requestBoardSetup({ boardId: 'b1', preset: 'brainstorm' }))
      .toEqual({ ok: false, status: 500, message: 'Server said no.' });
  });

  it('a thrown fetch is a plain failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await requestBoardSetup({ boardId: 'b1', preset: 'brainstorm' }))
      .toEqual({ ok: false, status: 0, message: 'The AI request failed.' });
  });
});
