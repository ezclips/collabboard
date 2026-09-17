import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  resolveBoardAiChatContext,
  resolveHistoricalBoardAiChatContext,
  BOARD_AI_CONTEXT_MAX_IMAGE_BYTES,
  type BoardAiContextByteReader,
  type BoardAiContextSupabaseClient,
} from './boardAiChatContext';
import {
  BOARD_AI_CONTEXT_IMAGE_MARKER,
  boardAiContextIdentityKey,
  boardAiContextItemsFromStored,
  boardAiContextViewFromStored,
  boundResolvedContext,
  buildBoardAiContextEnvelope,
  BOARD_AI_CONTEXT_VERSION,
  type ResolvedBoardAiContextBlock,
} from '../../domain/ai/boardAiChatContext';
import { boardAiDraftFromBoardItem, boardAiDraftContextPayload }
  from '../../domain/ai/boardAiChatDraftContext';
import {
  adapterCarriesImages,
  defaultVisionModelFor,
  modelDeclaredForImages,
} from './providers/visionCapability';
import { DEEPSEEK_DEFAULT_MODEL, DEEPSEEK_VISION_MODEL } from './providers/deepSeek';
import { anthropicAdapter } from './providers/anthropic';
import { geminiAdapter } from './providers/gemini';
import { openAIAdapter } from './providers/openAI';
import { AI_EXECUTION_PROVIDERS, type AIExecutionProvider } from './providers/types';
import { err, ok } from '../../domain/core/result';
import { domainError } from '../../domain/core/errors';

/**
 * BOARD AI IMAGE CONTEXT -- the feature, and the four rules that make it safe.
 *
 *   1. a padlet-image resolves ONLY a genuine PDF-area crop (T2);
 *   2. the storage path is DERIVED, never taken from card metadata (T3);
 *   3. bytes never reach `text`, the envelope or the browser view (T4);
 *   4. history never re-reads bytes (T5).
 *
 * Rules 2 and 3 are the ones worth the most attention. A card's metadata is
 * user-writable, so "derive the path" is what stops this type from becoming a
 * reader of the private bucket; and `image` living outside `text` is what makes
 * "no base64 in the transcript" a property of the shape rather than a habit.
 */

const BOARD = '11111111-1111-4111-8111-111111111111';
const PAD = '33333333-3333-4333-8333-333333333333';
const DOC = '22222222-2222-4222-8222-222222222222';
const DERIVED_PATH = `board-derived/${BOARD}/pdf-areas/${PAD}.webp`;

const provenance = (overrides: Record<string, unknown> = {}) => ({
  kind: 'knowledge-pdf-area',
  knowledgeDocumentId: DOC,
  pageNumber: 4,
  region: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
  ...overrides,
});

/** A padlets-only client. Records the filters, so board scope is observable. */
function client(padlet: Record<string, unknown> | null, error: unknown = null) {
  const filters: Record<string, unknown> = {};
  const query: Record<string, unknown> = {
    eq(column: string, value: unknown) { filters[column] = value; return query; },
    in() { return query; },
    order() { return query; },
    limit() { return query; },
    maybeSingle: async () => ({ data: padlet, error }),
    then: (r: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(r),
  };
  const api = { from: () => ({ select: () => query }) };
  return { client: api as unknown as BoardAiContextSupabaseClient, filters };
}

function reader(bytes: Uint8Array | null = new Uint8Array([1, 2, 3, 4])) {
  const paths: string[] = [];
  const byteReader: BoardAiContextByteReader = {
    download: vi.fn(async (path: string) => {
      paths.push(path);
      return bytes === null
        ? err(domainError('unavailable', 'gone'))
        : ok({ bytes });
    }),
  };
  return { byteReader, paths };
}

const IMAGE_ITEM = [{ type: 'padlet-image' as const, padletId: PAD }];

describe('T1. identity and the stored round trip', () => {
  it('1. the identity key is distinct from the same card attached as text', () => {
    expect(boardAiContextIdentityKey({ type: 'padlet-image', padletId: PAD }))
      .toBe(`padlet-image:${PAD}`);
    // Two genuinely different sources. Collapsing them would silently drop one.
    expect(boardAiContextIdentityKey({ type: 'padlet-image', padletId: PAD }))
      .not.toBe(boardAiContextIdentityKey({ type: 'padlet', padletId: PAD }));
  });

  it('2. a stored padlet-image parses back to identity only', () => {
    const parsed = boardAiContextItemsFromStored({
      version: BOARD_AI_CONTEXT_VERSION,
      items: [{ type: 'padlet-image', padletId: PAD, label: 'Figure 2', excerpt: BOARD_AI_CONTEXT_IMAGE_MARKER }],
    });
    expect(parsed).toHaveLength(1);
    expect(parsed[0].request).toEqual({ type: 'padlet-image', padletId: PAD });
    expect(parsed[0].label).toBe('Figure 2');
  });

  it('3. a stored padlet-image without a padlet id is dropped, not repaired', () => {
    expect(boardAiContextItemsFromStored({
      version: BOARD_AI_CONTEXT_VERSION,
      items: [{ type: 'padlet-image', label: 'no id' }],
    })).toHaveLength(0);
  });

  it('4. the browser view carries the identity and the label, never an image field', () => {
    const view = boardAiContextViewFromStored({
      version: BOARD_AI_CONTEXT_VERSION,
      items: [{ type: 'padlet-image', padletId: PAD, label: 'Figure 2' }],
    });
    // The exact key set, not "no field called image" -- the TYPE NAME contains
    // that word, so the absence that matters is the payload's.
    expect(view?.items[0]).toEqual({ type: 'padlet-image', padletId: PAD, label: 'Figure 2' });
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain('base64');
    expect(serialized).not.toContain('mediaType');
  });
});

describe('T2. only a real crop resolves', () => {
  it('5. a crop resolves to a marker plus the image payload', async () => {
    const { client: c } = client({ id: PAD, type: 'image', title: 'Figure 2', metadata: { source: provenance() } });
    const { byteReader } = reader();
    const result = await resolveBoardAiChatContext(c, BOARD, IMAGE_ITEM, byteReader);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const block = result.value[0];
    expect(block.type).toBe('padlet-image');
    expect(block.text).toBe(BOARD_AI_CONTEXT_IMAGE_MARKER);
    expect(block.label).toBe('Figure 2');
    expect(block.image).toEqual({ mediaType: 'image/webp', base64: Buffer.from([1, 2, 3, 4]).toString('base64') });
    // Provenance travels, so a citation can name the page it was cut from.
    expect(block.knowledgeDocumentId).toBe(DOC);
    expect(block.pageNumber).toBe(4);
  });

  it('6. an ordinary image post CANNOT be attached by naming it padlet-image', async () => {
    // The whole refusal. Without it, this type is a request to fetch whatever
    // object the path formula can address for any card id on the board.
    const { client: c } = client({ id: PAD, type: 'image', title: 'holiday snap', metadata: { imageUrl: '/x.png' } });
    const { byteReader } = reader();
    const result = await resolveBoardAiChatContext(c, BOARD, IMAGE_ITEM, byteReader);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('validation');
    // And no byte was read on the way to refusing.
    expect(byteReader.download).not.toHaveBeenCalled();
  });

  it('7. malformed provenance is refused the same way', async () => {
    for (const source of [
      provenance({ kind: 'something-else' }),
      provenance({ knowledgeDocumentId: 'not-a-uuid' }),
      provenance({ pageNumber: 0 }),
      provenance({ region: null }),
      null,
    ]) {
      const { client: c } = client({ id: PAD, type: 'image', title: 't', metadata: { source } });
      const { byteReader } = reader();
      const result = await resolveBoardAiChatContext(c, BOARD, IMAGE_ITEM, byteReader);
      expect(result.ok, JSON.stringify(source)).toBe(false);
      expect(byteReader.download).not.toHaveBeenCalled();
    }
  });

  it('8. a card on another board is not found, and reads no bytes', async () => {
    const { client: c, filters } = client(null);
    const { byteReader } = reader();
    const result = await resolveBoardAiChatContext(c, BOARD, IMAGE_ITEM, byteReader);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('not_found');
    // Board scope was part of the lookup, exactly as for every other type.
    expect(filters).toEqual({ id: PAD, board_id: BOARD });
    expect(byteReader.download).not.toHaveBeenCalled();
  });
});

describe('T3. the path is derived, never taken from the card', () => {
  it('9. a hostile storagePath or imageUrl on the card is never consulted', async () => {
    const { client: c } = client({
      id: PAD,
      type: 'image',
      title: 'Figure 2',
      metadata: {
        // Everything an attacker would try. All of it is ignored: the resolver
        // never reads a location from metadata, it computes one from two ids.
        storagePath: 'board-derived/other-board/pdf-areas/secret.webp',
        imageUrl: 'https://evil.test/leak.webp',
        path: '../../../knowledge/originals/private.pdf',
        source: provenance(),
      },
    });
    const { byteReader, paths } = reader();
    const result = await resolveBoardAiChatContext(c, BOARD, IMAGE_ITEM, byteReader);
    expect(result.ok).toBe(true);
    expect(paths).toEqual([DERIVED_PATH]);
  });

  it('10. a non-UUID board id yields no path and no read', async () => {
    const { client: c } = client({ id: PAD, type: 'image', title: 't', metadata: { source: provenance() } });
    const { byteReader } = reader();
    const result = await resolveBoardAiChatContext(c, '../etc', IMAGE_ITEM, byteReader);
    expect(result.ok).toBe(false);
    expect(byteReader.download).not.toHaveBeenCalled();
  });

  it('11. a failed byte read is unavailable, and an oversized object is refused not truncated', async () => {
    const { client: c } = client({ id: PAD, type: 'image', title: 't', metadata: { source: provenance() } });

    const gone = await resolveBoardAiChatContext(c, BOARD, IMAGE_ITEM, reader(null).byteReader);
    expect(gone.ok).toBe(false);
    if (!gone.ok) expect(gone.error.code).toBe('unavailable');

    const huge = new Uint8Array(BOARD_AI_CONTEXT_MAX_IMAGE_BYTES + 1);
    const tooBig = await resolveBoardAiChatContext(c, BOARD, IMAGE_ITEM, reader(huge).byteReader);
    expect(tooBig.ok).toBe(false);
    if (!tooBig.ok) expect(tooBig.error.code).toBe('validation');
  });
});

describe('T4. bytes never reach text', () => {
  const block: ResolvedBoardAiContextBlock = {
    type: 'padlet-image',
    padletId: PAD,
    knowledgeDocumentId: DOC,
    pageNumber: 4,
    label: 'Figure 2',
    text: BOARD_AI_CONTEXT_IMAGE_MARKER,
    image: { mediaType: 'image/webp', base64: 'QUJDREVGRw==SECRETBYTES' },
  };

  it('12. the stored envelope is a marker and an excerpt, with no base64 anywhere', () => {
    const envelope = buildBoardAiContextEnvelope([block]);
    const serialized = JSON.stringify(envelope);
    expect(serialized).not.toContain('SECRETBYTES');
    expect(serialized).not.toContain('base64');
    expect(serialized).not.toContain('image/webp');
    expect(envelope?.items[0]).toEqual({
      type: 'padlet-image',
      knowledgeDocumentId: DOC,
      pageNumber: 4,
      padletId: PAD,
      label: 'Figure 2',
      excerpt: BOARD_AI_CONTEXT_IMAGE_MARKER,
    });
  });

  it('13. an image costs one slot and sixteen characters, and history cannot squeeze it out', () => {
    const filler = (n: number): ResolvedBoardAiContextBlock =>
      ({ type: 'padlet', padletId: `p${n}`, label: `L${n}`, text: 'x'.repeat(5_900) });
    // Three fillers near the single-block cap, image LAST. The budget is spent
    // by the third filler, which is correctly dropped -- and the image behind
    // it still arrives. Before the fix this test caught, the loop ENDED at that
    // filler and the image the user attached this turn went with it.
    const kept = boundResolvedContext([filler(1), filler(2), filler(3), block]);
    expect(kept.map((b) => b.type)).toEqual(['padlet', 'padlet', 'padlet-image']);
    const image = kept[kept.length - 1];
    expect(image.image?.base64).toBe(block.image?.base64);
    expect(image.text).toBe(BOARD_AI_CONTEXT_IMAGE_MARKER);
  });

  it('13b. a request with no image behaves exactly as it did before', () => {
    // The flag replaced a `break`. For text-only input the two must be
    // indistinguishable, or this change altered every existing conversation.
    const filler = (n: number): ResolvedBoardAiContextBlock =>
      ({ type: 'padlet', padletId: `p${n}`, label: `L${n}`, text: 'x'.repeat(5_900) });
    expect(boundResolvedContext([filler(1), filler(2), filler(3), filler(4)]).map((b) => b.padletId))
      .toEqual(['p1', 'p2']);
  });
});

describe('T5. history never re-reads an image', () => {
  it('14. a stored padlet-image is dropped before any byte reader is touched', async () => {
    const { client: c } = client({ id: PAD, type: 'image', title: 't', metadata: { source: provenance() } });
    const { byteReader } = reader();
    const blocks = await resolveHistoricalBoardAiChatContext(c, BOARD, [
      ...IMAGE_ITEM,
      { type: 'padlet', padletId: PAD },
    ]);
    expect(byteReader.download).not.toHaveBeenCalled();
    // The padlet-image contributed nothing at all -- not a marker, not a block.
    expect(blocks.every((b) => b.type !== 'padlet-image')).toBe(true);
  });
});

describe('T6. capability is declared, never inferred', () => {
  // UPDATED for USER-DECLARED CAPABILITY. This used to assert a whitelist of
  // provider:model pairs kept in this repository, which meant the answer for
  // every model a user actually owns was "no", permanently. The whitelist is
  // gone; what replaces it is still a DECLARATION, just the connection owner's
  // rather than ours. The property being defended is unchanged and is the only
  // one that ever mattered: NOTHING IS INFERRED FROM A MODEL ID.
  it('15. the declaration decides, and a model id never does', () => {
    // A vision-sounding name buys nothing without a declaration...
    for (const model of ['gpt-4o', 'claude-3-5-sonnet', 'gemini-1.5-pro-vision',
      'some-vision-model', DEEPSEEK_VISION_MODEL, DEEPSEEK_DEFAULT_MODEL]) {
      expect(modelDeclaredForImages({ source: 'byok', model, supportsImages: false }), model)
        .toBe(false);
    }
    // ...and a plain-sounding one is honoured WITH one. The id is never read.
    for (const model of ['some-internal-name', 'text-only-sounding', 'x']) {
      expect(modelDeclaredForImages({ source: 'byok', model, supportsImages: true }), model)
        .toBe(true);
    }
    // The managed default is CollabBoard's own declaration about its own model,
    // and is the ONLY thing that grants images without an owner's flag.
    expect(modelDeclaredForImages({
      source: 'collabboard-default', model: DEEPSEEK_VISION_MODEL, supportsImages: false,
    })).toBe(true);
    expect(modelDeclaredForImages({
      source: 'collabboard-default', model: DEEPSEEK_DEFAULT_MODEL, supportsImages: false,
    })).toBe(false);
    // And that declaration does NOT transfer to a BYOK connection that happens
    // to name the same model: the managed key and the user's key are not the
    // same grant.
    expect(modelDeclaredForImages({
      source: 'byok', model: DEEPSEEK_VISION_MODEL, supportsImages: false,
    })).toBe(false);
  });

  it('15b. every adapter declares whether it can carry an image at all', () => {
    // Condition one, independent of any model. All five carry images today;
    // what is pinned is that each one STATES it, so a provider added without
    // an image path cannot inherit a yes by silence.
    for (const provider of AI_EXECUTION_PROVIDERS) {
      expect(typeof adapterCarriesImages(provider as AIExecutionProvider), provider)
        .toBe('boolean');
    }
  });

  it('16. only the managed provider offers a substitute model', () => {
    expect(defaultVisionModelFor('deepseek')).toBe(DEEPSEEK_VISION_MODEL);
    for (const provider of ['openai', 'anthropic', 'gemini', 'openrouter'] as const) {
      expect(defaultVisionModelFor(provider), provider).toBeNull();
    }
  });
});

describe('T8/T9. adapters carry rather than drop', () => {
  const image = { mediaType: 'image/webp', base64: 'AAAA' };
  const input = {
    model: 'm', apiKey: 'k', system: 's', user: 'u', maxTokens: 10, images: [image],
  };

  // UPDATED. These three used to THROW on a non-empty images array, because
  // they had no way to put one on the wire and dropping it would have answered
  // from text while the user believed the model looked at their picture. They
  // now genuinely carry the image, so the guard is gone -- which is the only
  // condition under which it was ever allowed to go.
  //
  // The refusal did not disappear; it MOVED to the one place that knows both
  // the adapter's capability and the model's declaration. See test 7 of
  // boardAiChatImageExecution, where an undeclared BYOK model still throws.
  it.each([
    ['anthropic', anthropicAdapter],
    ['gemini', geminiAdapter],
    ['openai', openAIAdapter],
  ])('17. the %s adapter carries the image onto the wire', async (name, adapter) => {
    expect(adapter.carriesImages, `${name} declares it`).toBe(true);
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 500 }));
    await expect(adapter.generateText(input)).rejects.toThrow();
    // The request was actually made, and the image bytes are IN it -- not
    // silently omitted on the way past.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = String((fetchSpy.mock.calls[0][1] as { body: string }).body);
    expect(body, `${name} sends the bytes`).toContain('AAAA');
    // Never a link: the source is a private crop with no public address.
    expect(body).not.toContain('http');
    fetchSpy.mockRestore();
  });

  it('18. those adapters are untouched when there is no image', async () => {
    // The guard must be about images, not a new unconditional failure.
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 500 }));
    for (const adapter of [anthropicAdapter, geminiAdapter, openAIAdapter]) {
      // A 500 proves the call was attempted; the guard did not short-circuit.
      await expect(adapter.generateText({ ...input, images: [] })).rejects.toThrow();
    }
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    fetchSpy.mockRestore();
  });
});

describe('the one wire change', () => {
  it('26. an image becomes an inline data: part in the USER message only', async () => {
    const { deepSeekAdapter } = await import('./providers/deepSeek');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 }),
    );
    await deepSeekAdapter.generateText({
      model: DEEPSEEK_VISION_MODEL, apiKey: 'k', system: 'SYS', user: 'USER', maxTokens: 10,
      images: [{ mediaType: 'image/webp', base64: 'QUJD' }],
    });
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as { body: string }).body);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'SYS' });
    expect(body.messages[1].content).toEqual([
      { type: 'text', text: 'USER' },
      { type: 'image_url', image_url: { url: 'data:image/webp;base64,QUJD', detail: 'original' } },
    ]);
    // Never a link: the source is private and has no public address.
    expect(JSON.stringify(body)).not.toContain('http');
    fetchSpy.mockRestore();
  });

  it('27. with no image the body is a plain string, exactly as before', async () => {
    const { deepSeekAdapter } = await import('./providers/deepSeek');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 }),
    );
    await deepSeekAdapter.generateText({
      model: DEEPSEEK_DEFAULT_MODEL, apiKey: 'k', system: 'SYS', user: 'USER', maxTokens: 10,
    });
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as { body: string }).body);
    expect(body.messages[1]).toEqual({ role: 'user', content: 'USER' });
    fetchSpy.mockRestore();
  });
});

describe('T10. the two blockers, and the contract the client sends', () => {
  const sourceOf = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

  it('19. a crop is offered as an Image, ahead of the text-type gate', () => {
    const draft = boardAiDraftFromBoardItem({
      id: PAD, type: 'image', title: 'Figure 2', isKnowledgePdfArea: true,
    });
    expect(draft).toEqual({
      request: { type: 'padlet-image', padletId: PAD }, label: 'Figure 2', detail: 'Image',
    });
    // Without the flag it is still an unusable image post, so the gate is
    // intact and the crop is an addition rather than a widening.
    expect(boardAiDraftFromBoardItem({ id: PAD, type: 'image', title: 'Figure 2' })).toBeNull();
  });

  it('20. ATTACHABLE_POST_TYPES is unchanged, and the crop branch precedes it', () => {
    const draftSource = sourceOf('lib/domain/ai/boardAiChatDraftContext.ts');
    expect(draftSource).toContain("const ATTACHABLE_POST_TYPES = new Set(['text', 'note'])");
    expect(draftSource.indexOf('if (item.isKnowledgePdfArea)'))
      .toBeLessThan(draftSource.indexOf('if (!ATTACHABLE_POST_TYPES.has(item.type)) return null;'));
  });

  it('21. SUPPORTED_PADLET_TYPES is unchanged: the image branch is a separate type', () => {
    // The crop did not widen what `padlet` means. It is a different source.
    expect(sourceOf('lib/server/ai/boardAiChatContext.ts'))
      .toContain("const SUPPORTED_PADLET_TYPES = new Set(['text', 'note'])");
  });

  it('22. the payload carries identity only, rebuilt field by field', () => {
    const payload = boardAiDraftContextPayload([
      { request: { type: 'padlet-image', padletId: PAD }, label: 'Figure 2', detail: 'Image' },
    ]);
    expect(payload).toEqual({ items: [{ type: 'padlet-image', padletId: PAD }] });
  });

  it('23. the route variant is strict, so no byte or path can be smuggled in', () => {
    const route = sourceOf('app/api/boards/[id]/ai/chat/route.ts');
    const variant = route.slice(route.indexOf("z.literal('padlet-image')"));
    expect(variant.slice(0, variant.indexOf(']'))).toContain('.strict()');
    expect(route).toContain('padletId: z.string().uuid()');
  });

  it('24. the canvas reads the crop through the provenance parser, not the PDF-card reader', () => {
    // The flat-metadata bug: readKnowledgePdfPlacement looks at top-level
    // metadata, which a crop does not have -- its provenance is metadata.source.
    const canvas = sourceOf('app/dashboard/canvas/[id]/CanvasClient.tsx');
    expect(canvas).toContain('isKnowledgePdfArea: isKnowledgePdfAreaCropPost(post)');
    expect(canvas, 'and the PDF-card reader is left alone').toContain('readKnowledgePdfPlacement(post)');
    // The rule is IMPORTED, not restated: an existing source guard forbids this
    // file from calling the provenance parser itself, so that one notion of
    // "is a crop" cannot become two that disagree.
    expect(canvas).not.toContain('parseKnowledgePdfAreaProvenance(');
    expect(sourceOf('lib/infra/knowledge/knowledgePdfAreaLibraryReuseClient.ts'))
      .toContain('export function isKnowledgePdfAreaCropPost');
  });

  it('25. the chat route still holds no admin client of its own', () => {
    // The existing guard asserts this too. Repeated here because THIS unit is
    // what introduced a privileged read on the path: the admin client lives in
    // one named adapter that takes a path and returns bytes, and answers no
    // question about access.
    const route = sourceOf('app/api/boards/[id]/ai/chat/route.ts');
    expect(route).not.toContain('getSupabaseAdmin');
    expect(route).not.toContain('service_role');
    const adapter = sourceOf('lib/infra/ai/boardAiContextImageReader.ts');
    expect(adapter).toContain('getSupabaseAdmin');
    // It has no board, no user and no table: it cannot authorise anything.
    expect(adapter).not.toContain('board_id');
    expect(adapter).not.toContain('.from(\'padlets\')');
    expect(adapter).not.toContain('auth.');
  });
});
