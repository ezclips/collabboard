// @vitest-environment jsdom
//
// IMAGE_LIBRARY_NONFREEFORM_LINK_1_C1 -- the two Drawing reuse routes the first
// slice missed, proved against the code that actually runs.
//
// The earlier layout suite mirrored each writer by hand, which is precisely why
// it could not see either defect: a mirror proves only what the mirror encodes.
// So nothing here re-types a row builder. The container drop is exercised by
// MOUNTING RowColumnContainerCard and dispatching a real drop event at the zone
// that wins the event, and the click path calls the same exported builder the
// Drawing panel calls.
import React, { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import type { Padlet } from '@/types/collabboard';
import {
  buildLibraryClickPlacementDraft,
  resolveReusedLibraryItemId,
} from '@/lib/infra/collabboard/libraryReuseLink';

// Presentational children only -- none of them touch the drop path.
vi.mock('@/components/collabboard/PostCardContent', () => ({
  default: () => <div data-test-post-content />,
  KnowledgeSourceMarker: () => null,
}));
vi.mock('@/components/collabboard/CardPreview', () => ({ default: () => <div data-test-card-preview /> }));
vi.mock('@/components/collabboard/EmbeddedCommentList', () => ({ default: () => <div data-test-comments /> }));

import RowColumnContainerCard from '@/components/collabboard/RowColumnContainerCard';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LIBRARY_L = 'aaaaaaaa-1111-2222-3333-444444444444';
const IMAGE_L = 'https://example.test/image-L.png';
const CONTAINER_ID = 'container-1';

/** The durable Library item L, exactly as LibraryPanel holds it. */
const itemL = {
  id: LIBRARY_L,
  user_id: 'user-1',
  title: 'Saved image',
  type: 'image',
  is_public: false,
  created_at: '',
  updated_at: '',
  content: {
    title: 'Saved image',
    content: '',
    type: 'image',
    width: 300,
    height: 200,
    file_url: IMAGE_L,
    metadata: { imageUrl: IMAGE_L, parentId: 'stale-parent', childPadletIds: ['stale-child'] },
  },
};

/** What LibraryPanel's dragstart writes -- the transport shape. */
const dragTransportPayload = {
  ...itemL.content,
  libraryItemId: itemL.id,
};

function containerPadlet(): Padlet {
  return {
    id: CONTAINER_ID,
    board_id: 'board-1',
    title: 'Container',
    content: '',
    type: 'container',
    position_x: 0,
    position_y: 0,
    width: 350,
    height: 300,
    created_at: '',
    updated_at: '',
    metadata: { childPadletIds: [] },
  };
}

const roots: Root[] = [];
afterEach(() => {
  act(() => { roots.splice(0).forEach((root) => root.unmount()); });
  document.body.innerHTML = '';
});

/**
 * Mounts the container card exactly as Drawing mounts it (AutoHeightContainer
 * passes canvasContext="drawing" and showHeader={false}) and drops `payload` on
 * the body zone -- the zone whose preventDefault + stopPropagation claims the
 * event before Drawing's outer handler can see it.
 *
 * Returns the draft the real handler hands to onDropDraftIntoContainer.
 */
function dropOnContainerBody(payload: unknown): { containerId: string; draft: any } | null {
  const received: Array<{ containerId: string; draft: any }> = [];
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);

  act(() => root.render(
    <RowColumnContainerCard
      padlet={containerPadlet()}
      allPadlets={[containerPadlet()]}
      canvasContext="drawing"
      showHeader={false}
      onDropDraftIntoContainer={(containerId, draft) => { received.push({ containerId, draft }); }}
    />,
  ));

  const zone = host.querySelector('.space-y-2.text-left');
  if (!zone) throw new Error('container body drop zone not found');

  const serialized = payload === null ? '' : JSON.stringify(payload);
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: {
      getData: (type: string) =>
        (type === 'application/collabboard-library' ? serialized : ''),
    },
  });

  act(() => { zone.dispatchEvent(event); });
  return received[0] ?? null;
}

describe('C1-B: Drawing "Add to Existing" through the container body drop', () => {
  it('MANDATORY 3 -- a staged Library-backed ghost keeps L through the real handler', () => {
    // The staged draft was spread into the ghost, so it arrives carrying the
    // persisted column name rather than the drag transport name.
    const ghostFromLibraryDraft = {
      type: 'image',
      title: 'Saved image',
      content: '',
      width: 300,
      height: 200,
      file_url: IMAGE_L,
      metadata: { imageUrl: IMAGE_L },
      library_item_id: LIBRARY_L,
    };

    const result = dropOnContainerBody(ghostFromLibraryDraft);
    expect(result).not.toBeNull();
    expect(result!.containerId).toBe(CONTAINER_ID);
    expect(result!.draft.library_item_id).toBe(LIBRARY_L);
    // Same durable asset and snapshot -- reuse never copies or re-uploads.
    expect(result!.draft.file_url).toBe(IMAGE_L);
    expect(result!.draft.title).toBe('Saved image');
    expect(result!.draft.type).toBe('image');
  });

  it('MANDATORY 4 -- a normal camelCase Library drag still links', () => {
    const result = dropOnContainerBody(dragTransportPayload);
    expect(result!.draft.library_item_id).toBe(LIBRARY_L);
    expect(result!.draft.file_url).toBe(IMAGE_L);
  });

  it('MANDATORY 5 -- a ghost that was never Library-backed stays NULL', () => {
    const plainGhost = {
      type: 'image',
      title: 'Drawn image',
      content: '',
      width: 300,
      height: 200,
      file_url: 'https://example.test/drawn.png',
      metadata: {},
    };

    const result = dropOnContainerBody(plainGhost);
    expect(result!.draft.library_item_id).toBeNull();
    // ...and the placement is otherwise unaffected.
    expect(result!.draft.title).toBe('Drawn image');
    expect(result!.draft.file_url).toBe('https://example.test/drawn.png');
  });

  it('MANDATORY 6 -- when both keys are present the transport name wins', () => {
    const result = dropOnContainerBody({
      ...dragTransportPayload,
      library_item_id: 'bbbbbbbb-9999-9999-9999-999999999999',
    });
    expect(result!.draft.library_item_id).toBe(LIBRARY_L);
    // One resolver serves both handlers that can receive this drop.
    expect(resolveReusedLibraryItemId({
      libraryItemId: LIBRARY_L,
      library_item_id: 'bbbbbbbb-9999-9999-9999-999999999999',
    })).toBe(LIBRARY_L);
    expect(resolveReusedLibraryItemId({ library_item_id: LIBRARY_L })).toBe(LIBRARY_L);
    expect(resolveReusedLibraryItemId({})).toBeNull();
    expect(resolveReusedLibraryItemId(null)).toBeNull();
  });

  it('MANDATORY 7 -- the linked draft is what reaches the creation boundary', () => {
    const result = dropOnContainerBody(dragTransportPayload);
    // Nothing between the handler and the insert re-keys or drops the field:
    // this IS the object handed on, and the field is already the column name.
    expect(Object.keys(result!.draft)).toContain('library_item_id');
    expect(result!.draft).not.toHaveProperty('libraryItemId');
    // Reuse only: the draft carries a reference, never a Library object.
    expect(JSON.stringify(result!.draft)).not.toContain('create_image_post_with_library_item');
  });

  it('ignores a drop carrying no library payload at all', () => {
    expect(dropOnContainerBody(null)).toBeNull();
  });
});

describe('C1-A: Drawing click-to-place', () => {
  const placement = { boardId: 'board-1', positionX: 120, positionY: 240 };

  it('MANDATORY 1 -- clicking L produces a placement linked to L', () => {
    const draft = buildLibraryClickPlacementDraft(itemL, placement);
    expect(draft.library_item_id).toBe(LIBRARY_L);
    // Snapshot and asset ride along untouched.
    expect(draft.file_url).toBe(IMAGE_L);
    expect(draft.title).toBe('Saved image');
    expect(draft.type).toBe('image');
    expect(draft.width).toBe(300);
    expect(draft.board_id).toBe('board-1');
    expect(draft.position_x).toBe(120);
    expect(draft.position_y).toBe(240);
    // Reuse only -- no Library object is minted here.
    expect(draft).not.toHaveProperty('libraryItemId');
    expect(JSON.stringify(draft)).not.toContain('create_image_post_with_library_item');
  });

  it('MANDATORY 2 -- the click path is only ever fed a real LibraryItem', () => {
    // Stale placement keys from the snapshot are stripped so the container
    // prompt still runs, exactly as the drag path does.
    const draft = buildLibraryClickPlacementDraft(itemL, placement) as any;
    expect(draft.metadata.parentId).toBeUndefined();
    expect(draft.metadata.childPadletIds).toBeUndefined();
    expect(draft.metadata.forceContainerPrompt).toBe(true);
    // A Library item always carries its id, so this path cannot invent one:
    // there is no `?? null` fallback that a ghost could slip through, because
    // ghosts never reach onSelect -- they travel by DataTransfer.
    expect(draft.library_item_id).toBe(itemL.id);
  });

  it('click and drag place the SAME durable object', () => {
    const clicked = buildLibraryClickPlacementDraft(itemL, placement);
    const dragged = dropOnContainerBody(dragTransportPayload)!.draft;
    expect(clicked.library_item_id).toBe(dragged.library_item_id);
    expect(clicked.library_item_id).toBe(LIBRARY_L);
    // Independent placements of one Library object, same asset.
    expect(clicked.file_url).toBe(dragged.file_url);
  });
});

describe('the production writers are the ones exercised above', () => {
  const read = async (p: string) => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    return fs.readFileSync(path.join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');
  };

  it('both Drawing drop handlers resolve the link through the one shared rule', async () => {
    const rcc = await read('components/collabboard/RowColumnContainerCard.tsx');
    const drawing = await read('components/collabboard/canvas/layouts/DrawingLayout.tsx');
    expect(rcc).toContain('library_item_id: resolveReusedLibraryItemId(libData)');
    expect(drawing).toContain('library_item_id: resolveReusedLibraryItemId(libData)');
    // No second, divergent precedence anywhere.
    expect(rcc).not.toContain('libData.libraryItemId ??');
    expect(drawing).not.toContain('libData.libraryItemId ??');
  });

  it('the Drawing click handler calls the builder proved above', async () => {
    const drawing = await read('components/collabboard/canvas/layouts/DrawingLayout.tsx');
    expect(drawing).toContain('await onAddPadlet(buildLibraryClickPlacementDraft(item, {');
    // The click builder is production code, not a test fixture.
    expect(drawing).toContain("from '@/lib/infra/collabboard/libraryReuseLink'");
  });

  it('the Drawing container consumer forwards the whole draft to the insert boundary', async () => {
    const drawing = await read('components/collabboard/canvas/layouts/DrawingLayout.tsx');
    // onDropDraftIntoContainer -> createAndLinkChildToContainer -> onAddPadlet:
    // a spread, so no field is dropped between the handler proved above and
    // the generic post-creation authority.
    expect(drawing).toContain('await createAndLinkChildToContainer(containerId, {\n                ...draftPayload,');
    expect(drawing).toContain('const created = await onAddPadlet(postData);');
  });

  it('no Drawing reuse path mints a Library object or copies the asset', async () => {
    for (const file of [
      'components/collabboard/canvas/layouts/DrawingLayout.tsx',
      'components/collabboard/RowColumnContainerCard.tsx',
      'lib/infra/collabboard/libraryReuseLink.ts',
    ]) {
      const source = await read(file);
      expect(source).not.toContain('create_image_post_with_library_item');
      expect(source).not.toMatch(/from\s*\(\s*['"]library_items['"]\s*\)\s*\n?\s*\.insert/);
    }
  });
});
