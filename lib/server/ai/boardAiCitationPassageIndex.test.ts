import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE INDEX INVARIANT, PINNED RATHER THAN ASSUMED.
 *
 * A search passage is cited as `S{n}.{i}`, where `n` is the search block's
 * position in the array the model was given. That number is baked into the
 * block's origin lines at build time, by the route, from `currentContext.length`
 * -- before bounding has run.
 *
 * That is only correct because of a property of `boundResolvedContext`: it drops
 * a SUFFIX. Once the character budget is spent every later text block is
 * skipped, so a search block that survives still has all of the attachments in
 * front of it and its final index is exactly the number baked in.
 *
 * THAT IS AN INVARIANT OF THE BOUNDER, NOT OF THE BLOCK. A future reordering --
 * putting history first, say, or dropping from the middle -- would corrupt every
 * baked token silently: the answer would still cite, and it would cite the wrong
 * source. Nothing else in the system would notice. Hence this file.
 */

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  createRouteHandlerClient: vi.fn(),
  canReadBoardKnowledge: vi.fn(),
  createBoardAiThreadRepository: vi.fn(),
  executeBoardAiChat: vi.fn(),
  createAIRolePreferenceRepository: vi.fn(() => ({})),
  createAIProviderCredentialRepository: vi.fn(() => ({})),
  resolveBoardAiChatContext: vi.fn(),
  resolveHistoricalBoardAiChatContext: vi.fn(),
  searchPosts: vi.fn(),
  searchChunks: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('@supabase/auth-helpers-nextjs', () => ({ createRouteHandlerClient: mocks.createRouteHandlerClient }));
vi.mock('@/lib/server/knowledge/knowledgeBoardReadAuthorization', () => ({
  canReadBoardKnowledge: mocks.canReadBoardKnowledge,
}));
vi.mock('@/lib/infra/ai/boardAiThreadRepository', () => ({
  createBoardAiThreadRepository: mocks.createBoardAiThreadRepository,
}));
vi.mock('@/lib/server/ai/boardAiChatExecution', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./boardAiChatExecution')>()),
  executeBoardAiChat: mocks.executeBoardAiChat,
}));
vi.mock('@/lib/infra/settings/aiRolePreferenceRepository', () => ({
  createAIRolePreferenceRepository: mocks.createAIRolePreferenceRepository,
}));
vi.mock('@/lib/infra/settings/aiProviderCredentialRepository', () => ({
  createAIProviderCredentialRepository: mocks.createAIProviderCredentialRepository,
}));
// The RESOLVER is stubbed; the search itself is NOT -- the real
// searchBoardAiContext and the real boardAiSearchContextBlock run, so the
// tokens asserted below are the ones the product actually bakes.
vi.mock('@/lib/server/ai/boardAiChatContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./boardAiChatContext')>()),
  resolveBoardAiChatContext: mocks.resolveBoardAiChatContext,
  resolveHistoricalBoardAiChatContext: mocks.resolveHistoricalBoardAiChatContext,
}));
vi.mock('@/lib/infra/ai/boardAiSearchReader', () => ({
  createBoardAiSearchReader: () => ({
    searchPosts: mocks.searchPosts,
    searchChunks: mocks.searchChunks,
  }),
}));

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const THREAD_ID = '33333333-3333-4333-8333-333333333333';
const DOC = 'cd308c08-39f9-46ca-a78a-bc8f91f791a3';
const PADLET = 'pppppppp-1111-4111-8111-111111111111';

let route: typeof import('../../../app/api/boards/[id]/ai/chat/route');
const ok = <T>(value: T) => ({ ok: true as const, value });

const assistantRow = {
  id: 'a1', threadId: THREAD_ID, role: 'assistant' as const, content: 'answer',
  provider: 'deepseek', model: 'deepseek-flash', context: null, citations: null, createdAt: 'now',
};

/** An attachment block, as the resolver would have returned it. */
const attachment = (n: number) => ({
  type: 'knowledge-page' as const,
  label: `Doc${n}.pdf — page 1`,
  knowledgeDocumentId: DOC,
  pageNumber: n,
  text: `attachment ${n} body`,
});

const post = (body: unknown) => route.POST(
  new Request(`http://localhost/api/boards/${BOARD_ID}/ai/chat`, {
    method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' },
  }),
  { params: Promise.resolve({ id: BOARD_ID }) },
);

/** The bounded array the route actually handed the model: the 4th argument. */
const sentContext = () => mocks.executeBoardAiChat.mock.calls[0][3] as readonly {
  type: string; text: string; passages?: readonly unknown[];
}[];

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  mocks.cookies.mockResolvedValue({});
  mocks.createRouteHandlerClient.mockReturnValue({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER_ID } }, error: null })) },
  });
  mocks.canReadBoardKnowledge.mockResolvedValue(true);
  mocks.executeBoardAiChat.mockResolvedValue({ text: 'answer', provider: 'deepseek', model: 'deepseek-flash' });
  mocks.createBoardAiThreadRepository.mockReturnValue({
    createThread: vi.fn(async () => ok({ id: THREAD_ID, boardId: BOARD_ID, userId: USER_ID, title: null, createdAt: 'c', updatedAt: 'u' })),
    getThread: vi.fn(async () => ok({ id: THREAD_ID, boardId: BOARD_ID, userId: USER_ID, title: null, createdAt: 'c', updatedAt: 'u' })),
    listMessages: vi.fn(async () => ok([])),
    appendMessage: vi.fn(async (_u, _b, _t, input: { role: string; content: string }) => ok({ ...assistantRow, ...input })),
    deleteThread: vi.fn(async () => ok(undefined)),
  });
  mocks.resolveBoardAiChatContext.mockResolvedValue(ok([]));
  mocks.resolveHistoricalBoardAiChatContext.mockResolvedValue([]);
  // One post and one chunk, in the RAW RPC ROW SHAPE the real reader returns,
  // so the passage mapping under test is the real one.
  mocks.searchPosts.mockResolvedValue(ok([
    { padlet_id: PADLET, title: 'Weekly plan', text: 'the weekly plan body', rank: 0.9 },
  ]));
  mocks.searchChunks.mockResolvedValue(ok([
    {
      chunk_id: 'c1', document_id: DOC, original_filename: 'slides.pdf',
      page_start: 3, page_end: 3, chunk_index: 0, text: 'the slide text', rank: 0.8,
    },
  ]));
  route = await import('../../../app/api/boards/[id]/ai/chat/route');
});

describe('the baked sub-token matches the block position the model was given', () => {
  it('with no attachments, the search block is S1 and its passages are S1.1 / S1.2', async () => {
    await post({ message: 'weekly plan', searchBoard: true });
    const context = sentContext();
    const index = context.findIndex((block) => block.type === 'board-search');
    expect(index).toBe(0);
    expect(context[index].text).toContain('[S1.1 |');
    expect(context[index].text).toContain('[S1.2 |');
  });

  it('with attachments in front, the baked token equals the block\'s REAL index', async () => {
    mocks.resolveBoardAiChatContext.mockResolvedValue(ok([attachment(1), attachment(2)]));
    await post({
      message: 'weekly plan',
      searchBoard: true,
      context: { items: [
        { type: 'knowledge-page', knowledgeDocumentId: DOC, pageNumber: 1 },
        { type: 'knowledge-page', knowledgeDocumentId: DOC, pageNumber: 2 },
      ] },
    });

    const context = sentContext();
    const index = context.findIndex((block) => block.type === 'board-search');
    // Two attachments lead, so the search is the third block -- S3 -- and its
    // passages are S3.1 and S3.2. This is the assertion that a reordering of
    // the assembly, or a bounder that dropped from the middle, would break.
    expect(index).toBe(2);
    expect(context[index].text).toContain('[S3.1 |');
    expect(context[index].text).toContain('[S3.2 |');
    expect(context[index].text).not.toContain('[S1.1 |');
  });

  it('when bounding drops the search entirely, it is never sent and no token can reach it', async () => {
    // Attachments large enough to spend the whole character budget. The search
    // still runs on whatever room the route calculated, but the bounder drops
    // the block -- and a block that was never sent cannot be cited, because
    // buildBoardAiCitationEnvelope resolves tokens against this same array.
    const huge = { ...attachment(1), text: 'x'.repeat(13_900) };
    mocks.resolveBoardAiChatContext.mockResolvedValue(ok([huge, attachment(2)]));
    await post({
      message: 'weekly plan',
      searchBoard: true,
      context: { items: [
        { type: 'knowledge-page', knowledgeDocumentId: DOC, pageNumber: 1 },
        { type: 'knowledge-page', knowledgeDocumentId: DOC, pageNumber: 2 },
      ] },
    });

    const context = sentContext();
    expect(context.some((block) => block.type === 'board-search')).toBe(false);
  });
});

describe('the passages never leave the server', () => {
  it('the block sent to the model carries identity, and the payload carries only text', async () => {
    await post({ message: 'weekly plan', searchBoard: true });
    const block = sentContext().find((b) => b.type === 'board-search')!;
    // Identity is present for the citation layer...
    expect(block.passages).toHaveLength(2);
    // ...and the serialized payload the model actually reads is built from
    // `text` alone, so no identity travels to it. serializeBoardAiChatPayload
    // copies fields one at a time; this is the assertion that keeps a later
    // refactor to a spread from changing that quietly.
    const { serializeBoardAiChatPayload } = await import('./boardAiChatExecution');
    const payload = serializeBoardAiChatPayload([], [block as never]);
    // The KEY, not the word: the chip label legitimately reads "2 text
    // passages used", and matching that would pass for the wrong reason.
    expect(payload).not.toContain('"passages"');
    expect(payload).not.toContain('"padletId"');
    // The sub-token DOES travel -- inside `text`, which is how the model can
    // name a passage at all.
    expect(payload).toContain('S1.1');
  });
});
