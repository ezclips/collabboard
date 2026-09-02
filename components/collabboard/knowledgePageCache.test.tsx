// @vitest-environment jsdom
//
// The shared Ready-page cache. The durable architecture was already right --
// `/pages` is a pure read of persisted text and nothing on a revisit
// reprocesses anything -- so every assertion here is about the client giving
// back data it already had instead of making the user watch it arrive again.
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const DOC_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const DOC_B = 'bbbbbbbb-2222-4222-8222-222222222222';

/** A controllable stand-in for the one auth authority the cache is scoped to. */
const auth = {
  userId: 'user-1' as string | null,
  listener: null as null | ((event: string, session: unknown) => void),
};

vi.mock('@/lib/supabase-provider', () => ({
  useSupabase: () => ({
    supabase: {
      auth: {
        getUser: async () => ({ data: { user: auth.userId ? { id: auth.userId } : null } }),
        onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
          auth.listener = cb;
          return { data: { subscription: { unsubscribe: () => { auth.listener = null; } } } };
        },
      },
    },
  }),
}));

vi.mock('next/navigation', () => ({ useParams: () => ({ id: BOARD_ID }) }));

import {
  KnowledgePageCacheProvider,
  useKnowledgePageCache,
  type KnowledgePageCache,
} from './KnowledgePageCache';

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
/** Comments stripped: prose promising "no localStorage" is not a usage. */
const executable = (source: string) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

let fetchMock: ReturnType<typeof vi.fn>;
let originalFetch: typeof globalThis.fetch;
let root: Root | null = null;
let cache: KnowledgePageCache | null = null;

const pagesBody = (documentId: string, filename: string, pageCount = 3) => ({
  document: { id: documentId, originalFilename: filename, pageCount },
  pages: Array.from({ length: pageCount }, (_, i) => ({
    pageNumber: i + 1,
    text: `${filename} page ${i + 1}`,
  })),
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Publishes the cache handle so a test can drive it like a real consumer. */
function Probe() {
  cache = useKnowledgePageCache();
  return null;
}

async function mountProvider() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <KnowledgePageCacheProvider>
        <Probe />
      </KnowledgePageCacheProvider>,
    );
  });
  // Let the initial getUser() resolution settle so the store has adopted a scope.
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return host;
}

const pagesCalls = () =>
  fetchMock.mock.calls.map(([input]) => String(input)).filter((u) => /\/pages$/.test(u));

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  document.body.innerHTML = '';
  auth.userId = 'user-1';
  auth.listener = null;
  cache = null;
  originalFetch = globalThis.fetch;
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const match = String(input).match(/knowledge\/([^/]+)\/pages$/);
    return match ? jsonResponse(pagesBody(match[1], `${match[1]}.pdf`)) : jsonResponse({}, 404);
  });
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
});

afterEach(async () => {
  if (root) { const r = root; await act(async () => r.unmount()); }
  root = null;
  globalThis.fetch = originalFetch;
});

describe('1-3. one request per document, shared by every consumer', () => {
  it('1. the first consumer of a Ready document causes exactly one /pages read', async () => {
    await mountProvider();
    await act(async () => { await cache!.load(BOARD_ID, DOC_A); });
    expect(pagesCalls()).toHaveLength(1);
    expect(pagesCalls()[0]).toContain(DOC_A);
  });

  it('2-3. simultaneous consumers share the in-flight request instead of duplicating it', async () => {
    await mountProvider();
    // The board-load shape the diagnosis measured: a card and the reader asking
    // for the same document in the same tick used to issue two GETs.
    const [first, second, third] = await act(async () => Promise.all([
      cache!.load(BOARD_ID, DOC_A),
      cache!.load(BOARD_ID, DOC_A),
      cache!.load(BOARD_ID, DOC_A),
    ]));
    expect(pagesCalls(), 'one request for three consumers').toHaveLength(1);
    // And all three got the same Ready answer, not a partial one.
    for (const result of [first, second, third]) {
      expect(result.status).toBe('ready');
      if (result.status === 'ready') expect(result.entry.pages).toHaveLength(3);
    }
  });

  it('different documents are still fetched independently', async () => {
    await mountProvider();
    await act(async () => { await Promise.all([cache!.load(BOARD_ID, DOC_A), cache!.load(BOARD_ID, DOC_B)]); });
    expect(pagesCalls()).toHaveLength(2);
  });
});

describe('4-8. a later consumer reuses what the session already knows', () => {
  it('4-5. a cached document is readable synchronously, so a remount never shows a cold state', async () => {
    await mountProvider();
    await act(async () => { await cache!.load(BOARD_ID, DOC_A); });

    // This is what a card's useState initialiser and the reader's open path do:
    // a synchronous read that already has content on the very first render.
    const entry = cache!.read(DOC_A);
    expect(entry, 'known before any effect runs').not.toBeNull();
    expect(entry!.pages).toHaveLength(3);
    expect(entry!.originalFilename).toBe(`${DOC_A}.pdf`);
    expect(pagesCalls(), 'reading costs no request').toHaveLength(1);
  });

  it('6-7. close/reopen and workspace/side-panel reuse issue no further request', async () => {
    await mountProvider();
    await act(async () => { await cache!.load(BOARD_ID, DOC_A); });
    const first = cache!.read(DOC_A);

    // Side panel closed and reopened, then the focused workspace, then back --
    // every one of those is just another synchronous read.
    for (let reopen = 0; reopen < 4; reopen += 1) {
      const again = cache!.read(DOC_A);
      expect(again).toBe(first);
      expect(again!.pages).toBe(first!.pages);
    }
    expect(pagesCalls(), 'still the single original read').toHaveLength(1);
  });

  it('8. the entry is addressed by knowledgeDocumentId, never by filename', async () => {
    await mountProvider();
    await act(async () => { await Promise.all([cache!.load(BOARD_ID, DOC_A), cache!.load(BOARD_ID, DOC_B)]); });
    expect(cache!.read(DOC_A)!.documentId).toBe(DOC_A);
    expect(cache!.read(DOC_B)!.documentId).toBe(DOC_B);
    // Two documents can share a filename; keying by it would open the wrong one.
    const source = read('components/collabboard/KnowledgePageCache.tsx');
    expect(source).not.toMatch(/entries\.(get|set)\([^)]*originalFilename/);
  });

  it('a fresh entry is not revalidated; only a stale one would be', async () => {
    await mountProvider();
    await act(async () => { await cache!.load(BOARD_ID, DOC_A); });
    const entry = cache!.read(DOC_A)!;
    expect(cache!.isStale(entry), 'just loaded').toBe(false);
    // The freshness rule is time-based and real, not a permanent pin.
    expect(cache!.isStale({ ...entry, loadedAt: Date.now() - 60 * 60 * 1000 })).toBe(true);
  });
});

describe('9-10. the processing state machine and last-known-good content', () => {
  it('9. a 409 is reported to the caller and never cached as content', async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ error: 'not ready' }, 409));
    await mountProvider();

    const result = await act(async () => cache!.load(BOARD_ID, DOC_A));
    expect(result.status, 'still extracting is a state, not an answer').toBe('preparing');
    expect(cache!.read(DOC_A), 'nothing cached').toBeNull();

    // The consumer's own retry then succeeds, exactly as before this cache.
    fetchMock.mockImplementation(async () => jsonResponse(pagesBody(DOC_A, 'late.pdf')));
    const retried = await act(async () => cache!.load(BOARD_ID, DOC_A));
    expect(retried.status).toBe('ready');
    expect(cache!.read(DOC_A)!.originalFilename).toBe('late.pdf');
  });

  it('10. a later transient failure does not poison already-cached pages', async () => {
    await mountProvider();
    await act(async () => { await cache!.load(BOARD_ID, DOC_A); });
    const good = cache!.read(DOC_A);

    fetchMock.mockImplementation(async () => { throw new Error('network down'); });
    const failed = await act(async () => cache!.load(BOARD_ID, DOC_A));
    expect(failed.status).toBe('failed');
    // The known-good answer is untouched: a revalidation that fails must never
    // make content the user is looking at disappear.
    expect(cache!.read(DOC_A)).toBe(good);
    expect(cache!.read(DOC_A)!.pages).toHaveLength(3);

    // A 503 is the same story.
    fetchMock.mockImplementation(async () => jsonResponse({ error: 'Unavailable' }, 503));
    const unavailable = await act(async () => cache!.load(BOARD_ID, DOC_A));
    expect(unavailable.status).toBe('failed');
    expect(cache!.read(DOC_A)).toBe(good);
  });
});

describe('11-12. missing page images are remembered for the session', () => {
  it('11. a confirmed 404 is remembered per document and page', async () => {
    await mountProvider();
    expect(cache!.isPageImageless(DOC_A, 1)).toBe(false);
    cache!.markPageImageless(DOC_A, 1);
    expect(cache!.isPageImageless(DOC_A, 1)).toBe(true);
    // Scoped precisely: another page, and another document, are still unknown.
    expect(cache!.isPageImageless(DOC_A, 2)).toBe(false);
    expect(cache!.isPageImageless(DOC_B, 1)).toBe(false);
  });

  it('12. the image component skips the request for a page already known missing', () => {
    const image = read('components/collabboard/KnowledgeDocumentPageImage.tsx');
    // The <img> is what issues the GET, so not mounting it IS not re-probing.
    expect(image).toContain('const knownMissing = pageCache?.isPageImageless(documentId, pageNumber)');
    expect(image).toMatch(/if \(knownMissing\) return null;/);
    expect(image).toContain('pageCache?.markPageImageless(documentId, pageNumber);');
    // Telling the host runs as an effect: its handler sets state, and doing
    // that during render would update a parent mid-render.
    expect(image).toMatch(/useEffect\(\(\) => \{\s*if \(knownMissing\) onUnavailable\?\.\(\);/);
  });

  it('the memory is session-only, never written anywhere durable', () => {
    // A derivative missing today may exist once the worker produces it, so
    // this knowledge must never outlive the app session.
    const source = executable(read('components/collabboard/KnowledgePageCache.tsx'));
    expect(source).not.toMatch(/localStorage|indexedDB|sessionStorage/i);
  });
});

describe('13-15. scope, isolation and storage', () => {
  it('13-14. a different user cannot read the previous user\'s entries', async () => {
    await mountProvider();
    await act(async () => { await cache!.load(BOARD_ID, DOC_A); });
    expect(cache!.read(DOC_A)).not.toBeNull();

    // The same browser, a different authenticated user.
    await act(async () => { auth.listener?.('SIGNED_IN', { user: { id: 'user-2' } }); });
    expect(cache!.read(DOC_A), 'private board text must not cross users').toBeNull();

    // And the new user's own read is theirs alone.
    await act(async () => { await cache!.load(BOARD_ID, DOC_A); });
    expect(cache!.read(DOC_A)).not.toBeNull();
    await act(async () => { auth.listener?.('SIGNED_OUT', null); });
    expect(cache!.read(DOC_A), 'signing out discards everything').toBeNull();
  });

  it('the same user re-emitting a session keeps the cache', async () => {
    await mountProvider();
    await act(async () => { await cache!.load(BOARD_ID, DOC_A); });
    const entry = cache!.read(DOC_A);
    // A token refresh is not a user change and must not throw the cache away.
    await act(async () => { auth.listener?.('TOKEN_REFRESHED', { user: { id: 'user-1' } }); });
    expect(cache!.read(DOC_A)).toBe(entry);
  });

  it('15. no durable browser storage is introduced anywhere in this feature', () => {
    for (const file of [
      'components/collabboard/KnowledgePageCache.tsx',
      'components/collabboard/KnowledgePdfCanvasSurface.tsx',
      'components/collabboard/KnowledgeSourceReaderDrawer.tsx',
      'components/collabboard/KnowledgeDocumentPageImage.tsx',
    ]) {
      expect(executable(read(file)), file).not.toMatch(/localStorage|indexedDB|sessionStorage/i);
    }
  });

  it('the cache is hosted where it survives leaving a canvas', () => {
    // A cache inside CanvasClient would die on exactly the navigation the user
    // reported. The root layout is the one client host that does not unmount.
    const layout = read('app/layout.tsx');
    expect(layout).toContain('KnowledgePageCacheProvider');
    // Inside the auth provider, because the cache is scoped to the user.
    expect(layout.indexOf('<SupabaseProvider>')).toBeLessThan(layout.indexOf('<KnowledgePageCacheProvider>'));
    expect(read('app/dashboard/canvas/[id]/CanvasClient.tsx'))
      .not.toContain('KnowledgePageCacheProvider');
  });
});
