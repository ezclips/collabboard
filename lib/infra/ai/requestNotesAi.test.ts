import { afterEach, describe, expect, it, vi } from 'vitest';

import { requestNotesAi } from './requestNotesAi';

const NOTES = [{ ref: 'N1', title: 'Venue', text: 'Book the venue' }];

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => { vi.unstubAllGlobals(); });

describe('PATCH-353 requestNotesAi', () => {
  it('returns the parsed summary', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      result: { title: 'T', summary: 'S', points: ['p'] },
    })));
    const response = await requestNotesAi({ boardId: 'b1', action: 'summary', notes: NOTES });
    expect(response).toEqual({ ok: true, result: { title: 'T', summary: 'S', points: ['p'] } });
  });

  it('returns a null result as-is', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ result: null })));
    expect(await requestNotesAi({ boardId: 'b1', action: 'summary', notes: NOTES }))
      .toEqual({ ok: true, result: null });
  });

  it('validates the plan shape for action_plan', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      result: { title: 'P', tasks: [{ text: 'A', sourceRefs: ['N1'] }] },
    })));
    expect(await requestNotesAi({ boardId: 'b1', action: 'action_plan', notes: NOTES }))
      .toEqual({ ok: true, result: { title: 'P', tasks: [{ text: 'A', sourceRefs: ['N1'] }] } });
  });

  it('maps 402 to the out-of-credits message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'nope' }, 402)));
    expect(await requestNotesAi({ boardId: 'b1', action: 'summary', notes: NOTES }))
      .toEqual({ ok: false, status: 402, message: "You're out of AI credits for this board." });
  });

  it('maps 429 to the rate-limit message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'nope' }, 429)));
    expect(await requestNotesAi({ boardId: 'b1', action: 'summary', notes: NOTES }))
      .toEqual({ ok: false, status: 429, message: 'Too many requests — try again in a minute.' });
  });

  it('uses the server message for any other failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'Server said no.' }, 500)));
    expect(await requestNotesAi({ boardId: 'b1', action: 'summary', notes: NOTES }))
      .toEqual({ ok: false, status: 500, message: 'Server said no.' });
  });

  it('falls back to a plain message for a bodyless failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 502 })));
    expect(await requestNotesAi({ boardId: 'b1', action: 'summary', notes: NOTES }))
      .toEqual({ ok: false, status: 502, message: 'The AI request failed.' });
  });

  it('a malformed 200 body is a plain failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ result: { title: 5 } })));
    expect(await requestNotesAi({ boardId: 'b1', action: 'summary', notes: NOTES }))
      .toEqual({ ok: false, status: 0, message: 'The AI request failed.' });
  });

  it('a thrown fetch is a plain failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await requestNotesAi({ boardId: 'b1', action: 'summary', notes: NOTES }))
      .toEqual({ ok: false, status: 0, message: 'The AI request failed.' });
  });
});
