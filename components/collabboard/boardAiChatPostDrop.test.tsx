// @vitest-environment jsdom

import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/collabboard/BoardAiChatModelChooser', () => ({
  default: () => <div data-board-ai-chat-chooser="stub" />,
}));

import BoardAiChatDrawer from './BoardAiChatDrawer';
import {
  BOARD_AI_DRAFT_CONTEXT_MAX,
  boardAiDraftFromBoardItem,
  type BoardAiDraftContextItem,
} from '@/lib/domain/ai/boardAiChatDraftContext';
import {
  BOARD_AI_POST_CLIP_MIME,
  boardAiPostClipPayload,
} from '@/lib/domain/ai/boardAiPostClipPayload';

/**
 * DRAGGING A POST INTO BOARD AI.
 *
 * The capability was already there: `padlet` and `padlet-image` are context
 * types, and the menu's "Use selected item" already attaches one. This unit
 * adds the gesture and nothing else, so what these tests protect is that it
 * stayed nothing else -- one builder, one set of refusals, and an ATTACH THAT
 * APPENDS.
 *
 * WHY APPENDING IS LOAD-BEARING. A search block's sub-token (`S3.2`) has its
 * block number baked from the context length before bounding runs, which is
 * sound only because the bounder drops a suffix -- every attachment still sits
 * in front of the search block. An attach that inserted ahead of an existing
 * item would silently misattribute every passage citation in the turn: no
 * error, no symptom, wrong sources. Hence the ordering assertions below.
 */

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const NOTE_ID = '6d7044fe-a2b7-45b9-9a4d-16c729caa500';
const CROP_ID = 'bbbbbbbb-2222-4222-8222-222222222222';
const PLAIN_IMAGE_ID = 'dddddddd-4444-4444-8444-444444444444';
const UNKNOWN_ID = 'cccccccc-3333-4333-8333-333333333333';

const ROOT = path.resolve(__dirname, '../..');
const DRAWER = fs.readFileSync(path.join(ROOT, 'components/collabboard/BoardAiChatDrawer.tsx'), 'utf8');
const CANVAS = fs.readFileSync(path.join(ROOT, 'app/dashboard/canvas/[id]/CanvasClient.tsx'), 'utf8');
const CARDS = fs.readFileSync(
  path.join(ROOT, 'components/collabboard/canvas/ui/FreeformPadletCards.tsx'), 'utf8',
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/**
 * The board's own posts -- what a dropped id is resolved against.
 *
 * WHAT IS ATTACHABLE IS NOT THIS UNIT'S QUESTION, and the drop deliberately
 * does not widen it: `ATTACHABLE_POST_TYPES` is `text` and `note`, plus a
 * PDF-area crop, which attaches as `padlet-image` because its substance is
 * pixels rather than `content`. A PLAIN IMAGE POST IS NOT ATTACHABLE AT ALL --
 * dragging one is refused below, exactly as selecting one already is. Changing
 * that is a capability decision, not a gesture.
 */
const POSTS: Record<string, BoardAiDraftContextItem | null> = {
  [NOTE_ID]: boardAiDraftFromBoardItem({ id: NOTE_ID, type: 'text', title: 'Bumper removal' }),
  [CROP_ID]: boardAiDraftFromBoardItem({
    id: CROP_ID, type: 'image', title: 'Wiring diagram', isKnowledgePdfArea: true,
  }),
  [PLAIN_IMAGE_ID]: boardAiDraftFromBoardItem({
    id: PLAIN_IMAGE_ID, type: 'image', title: 'Photo',
  }),
};

const resolve = vi.fn((padletId: string) => POSTS[padletId] ?? null);

let root: Root | null = null;
let host: HTMLElement;
let draftContext: readonly BoardAiDraftContextItem[] = [];

function Harness({ initial }: { initial: readonly BoardAiDraftContextItem[] }) {
  const [items, setItems] = React.useState(initial);
  draftContext = items;
  return (
    <BoardAiChatDrawer
      boardId={BOARD_ID}
      isOpen
      onClose={vi.fn()}
      draftContext={items}
      onDraftContextChange={setItems}
      onResolveDroppedPost={resolve}
    />
  );
}

async function mount(initial: readonly BoardAiDraftContextItem[] = []) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  draftContext = initial;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(<Harness initial={initial} />); });
  await act(async () => { await Promise.resolve(); });
  return host;
}

const q = (selector: string) => host.querySelector(selector) as HTMLElement | null;
const zone = () => q('[data-board-ai-context-dropzone="true"]')!;
const notice = () => q('[data-board-ai-context-notice="true"]')?.textContent?.trim() ?? null;

/**
 * A DataTransfer stand-in. jsdom ships no constructible DataTransfer, and the
 * component only ever asks it three things.
 */
function transfer(entries: Record<string, string>) {
  return {
    types: Object.keys(entries),
    dropEffect: '',
    effectAllowed: '',
    getData: (type: string) => entries[type] ?? '',
    setData: (type: string, value: string) => { entries[type] = value; },
  };
}

async function fire(name: 'dragover' | 'drop' | 'dragleave', entries: Record<string, string>) {
  const event = new Event(name, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: transfer(entries), configurable: true });
  await act(async () => { zone().dispatchEvent(event); });
  return event;
}

const clip = (id: string) => ({ [BOARD_AI_POST_CLIP_MIME]: boardAiPostClipPayload(id) });

beforeEach(() => {
  document.body.innerHTML = '';
  resolve.mockClear();
  vi.stubGlobal('fetch', vi.fn(async () => json({ threads: [] })));
});
afterEach(async () => {
  if (root) { const r = root; await act(async () => r.unmount()); }
  root = null;
  vi.unstubAllGlobals();
});

describe('a post dropped on the context strip', () => {
  it('attaches a text post as a padlet item', async () => {
    await mount();
    await fire('drop', clip(NOTE_ID));

    expect(resolve).toHaveBeenCalledWith(NOTE_ID);
    expect(draftContext).toHaveLength(1);
    expect(draftContext[0].request.type).toBe('padlet');
  });

  it('attaches a PDF-area crop as a padlet-image item', async () => {
    await mount();
    await fire('drop', clip(CROP_ID));

    expect(draftContext).toHaveLength(1);
    expect(draftContext[0].request.type).toBe('padlet-image');
  });

  it('APPENDS -- a drop never moves an item already attached', async () => {
    // The citation carry. If a drop inserted ahead of an existing attachment,
    // every sub-token baked this turn would name the wrong block.
    const first = POSTS[NOTE_ID]!;
    await mount([first]);
    await fire('drop', clip(CROP_ID));

    expect(draftContext.map((item) => item.request.type)).toEqual(['padlet', 'padlet-image']);
    expect(draftContext[0]).toBe(first);
  });
});

describe('what a drop refuses, out loud', () => {
  it('a PLAIN image post is refused -- the gesture does not widen what is attachable', async () => {
    // An ordinary image is not attachable today, whether selected or dragged.
    // The drop inherits that rule rather than quietly making an exception to
    // it: attaching an image whose substance nothing can read would be a
    // confident-looking source with nothing behind it.
    await mount();
    await fire('drop', clip(PLAIN_IMAGE_ID));

    expect(draftContext).toHaveLength(0);
    expect(notice()).toMatch(/cannot be used as context/i);
  });

  it('a post the board does not hold attaches nothing and says so', async () => {
    await mount();
    await fire('drop', clip(UNKNOWN_ID));

    expect(resolve).toHaveBeenCalledWith(UNKNOWN_ID);
    expect(draftContext).toHaveLength(0);
    expect(notice()).toMatch(/cannot be used as context/i);
  });

  it('the same post twice is refused as a duplicate, not silently ignored', async () => {
    await mount([POSTS[NOTE_ID]!]);
    await fire('drop', clip(NOTE_ID));

    expect(draftContext).toHaveLength(1);
    expect(notice()).toMatch(/already attached/i);
  });

  it('a drop past the cap is refused and the cap is named', async () => {
    const full = Array.from({ length: BOARD_AI_DRAFT_CONTEXT_MAX }, (_unused, index) => (
      boardAiDraftFromBoardItem({
        id: `aaaaaaaa-0000-4000-8000-00000000000${index}`, type: 'text', title: `Note ${index}`,
      })!
    ));
    await mount(full);
    await fire('drop', clip(NOTE_ID));

    expect(draftContext).toHaveLength(BOARD_AI_DRAFT_CONTEXT_MAX);
    expect(notice()).toMatch(new RegExp(`Maximum ${BOARD_AI_DRAFT_CONTEXT_MAX} context items`, 'i'));
  });

  it('a transfer that is not a board post is not claimed at all', async () => {
    await mount();
    // text/plain is what EVERY drag from every application carries. Claiming it
    // would let arbitrary dropped text impersonate a post.
    const over = await fire('dragover', { 'text/plain': NOTE_ID });
    expect(over.defaultPrevented, 'the drag is left to the browser to refuse').toBe(false);

    await fire('drop', { 'text/plain': NOTE_ID });
    expect(resolve).not.toHaveBeenCalled();
    expect(draftContext).toHaveLength(0);
  });

  it('a forged payload on the right type still resolves nothing', async () => {
    await mount();
    await fire('drop', { [BOARD_AI_POST_CLIP_MIME]: '{"padletId":"../../etc/passwd"}' });

    expect(resolve, 'the parse fails closed before the resolver is reached').not.toHaveBeenCalled();
    expect(draftContext).toHaveLength(0);
  });
});

describe('one builder, and one drag source that cannot break the canvas', () => {
  it('the drop path calls attach -- it does not build its own context item', () => {
    // A second path here would be free to drift, and the first thing it would
    // drift on is the cap.
    const dropHandler = DRAWER.slice(DRAWER.indexOf('const handleContextDrop'));
    const body = dropHandler.slice(0, dropHandler.indexOf('}, ['));
    expect(body).toContain('attach(item)');
    expect(body, 'no second draft-item construction').not.toMatch(/boardAiDraftFrom\w+\(/);
    expect(body, 'and no second cap check').not.toContain('BOARD_AI_DRAFT_CONTEXT_MAX');
  });

  it('the dropped post is resolved by the SAME reduction the selection uses', () => {
    // One post, one meaning. `boardAiChatItemForPostId` is the only place a
    // post becomes a draft item, and both props are handed that one function.
    expect(CANVAS).toContain('onResolveDroppedPost={boardAiChatItemForPostId}');
    expect(CANVAS).toContain('return boardAiChatItemForPostId(String(id));');
    expect(
      CANVAS.match(/boardAiDraftFromBoardItem\(/g) ?? [],
      'exactly one call site builds a board item',
    ).toHaveLength(1);
  });

  it('the card is NOT the drag source -- the handle is', () => {
    // Cards move by POINTER events. `draggable` on the card itself would hand
    // the gesture to HTML5 drag and break dragging posts around the board.
    expect(CARDS).toContain('data-board-ai-drag-handle=');
    expect(CARDS).toContain("data-no-drag=\"true\"");
    const handle = CARDS.slice(CARDS.indexOf('data-board-ai-drag-handle='));
    const element = handle.slice(0, handle.indexOf('</div>'));
    expect(element, 'the grip stops the canvas drag system').toContain('onPointerDownCapture');
    expect(element).toContain('e.stopPropagation()');
    expect(element).toContain(BOARD_AI_POST_CLIP_MIME.length > 0 ? 'BOARD_AI_POST_CLIP_MIME' : '');
  });

  it('the handle appears only when there is somewhere to drop', () => {
    expect(CANVAS).toContain('boardAiDragEnabled={isBoardAiChatOpen && !isBlockingOverlayOpen}');
  });
});
