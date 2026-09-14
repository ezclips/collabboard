// @vitest-environment jsdom
//
// CANVAS_IMAGE_AND_PDF_NOTE_REGRESSION_TRIAGE_1 -- a PDF-area region Note (no
// OCR text, so the region crop IS its content) was losing both its image
// preview and its stored background the moment the editor opened: the crop
// was never rendered in the editor at all, and `cardColor` had no hydration
// prop, so it always started at the hardcoded white default regardless of
// what the padlet actually had saved. Any ordinary save (even a text-only
// edit) then carried that default back into usePadletSave's metadata merge,
// silently discarding the real background. This suite exercises NoteEditor --
// the actual hydration/render/save boundary CanvasModals wires into
// usePadletSave.saveNote -- not a test-local replica of either.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SourceReference } from '@/lib/domain/knowledge/knowledgePersistence';

vi.mock('next/navigation', () => ({ useParams: vi.fn() }));
import { useParams } from 'next/navigation';
import NoteEditor from './NoteEditor';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const DOC_ID = 'cd308c08-39f9-46ca-a78a-bc8f91f791a3';
const REF_ID = '33333333-3333-4333-8333-333333333333';
const STORED_CARD_COLOR = '#dbeafe';
const EXPECTED_RGB = 'rgb(219, 234, 254)';

/** The exact shape a PDF rectangle-selection drop persists: no quote, a region. */
const regionReference: SourceReference = {
  id: REF_ID,
  targetPadletId: 'padlet-1',
  sourceDocumentId: DOC_ID,
  pageStart: 3,
  pageEnd: 3,
  quoteText: null,
  quoteHash: null,
  charStart: null,
  charEnd: null,
  region: { x: 0.1, y: 0.1, width: 0.3, height: 0.3 },
  locator: null,
  createdAt: '2026-01-01T00:00:00.000Z',
} as unknown as SourceReference;

vi.mocked(useParams).mockReturnValue({ id: BOARD_ID } as never);

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
function mount(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(ui); });
  mounted.push({ root, container });
  return container;
}
afterEach(() => {
  for (const m of mounted) {
    act(() => { m.root.unmount(); });
    m.container.remove();
  }
  mounted = [];
});

/**
 * useBackdropDismiss (PostEditorShell.tsx) only treats a click as a backdrop
 * dismissal when the SAME element also received the preceding pointerdown --
 * it exists so a text-selection drag that starts inside the card and is
 * released outside it does not close the editor. A bare 'click' dispatch
 * (dispatchEvent(new MouseEvent('click'))) never satisfies that and is
 * inert here, independent of anything this suite changes.
 */
function clickBackdrop(overlay: HTMLElement) {
  overlay.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

const crop = (container: HTMLElement) =>
  container.querySelector('[data-knowledge-source-region-crop="true"]');
// The exact two-class "Inner card" div -- the toolbar shell also matches
// `.rounded-lg.overflow-hidden` as a subset of its own longer class list.
const cardDiv = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('div'))
    .find((el) => el.className === 'rounded-lg overflow-hidden') ?? null;

describe('A: a PDF-derived Note opens with its image/source preview and background', () => {
  it('renders the region crop and the stored background on open, not the white default', () => {
    const container = mount(
      <NoteEditor
        isOpen
        initialContent=""
        initialCardColor={STORED_CARD_COLOR}
        sourceReferences={[regionReference]}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const cropEl = crop(container);
    expect(cropEl).not.toBeNull();
    const img = cropEl!.querySelector('img')!;
    expect(img.getAttribute('src')).toBe(
      `/api/boards/${BOARD_ID}/knowledge/references/${REF_ID}/crop`,
    );

    expect(cardDiv(container)!.style.backgroundColor).toBe(EXPECTED_RGB);
  });
});

describe('B: opening alone issues no content write', () => {
  it('never calls onSave merely from mounting the editor open', () => {
    const onSave = vi.fn();
    mount(
      <NoteEditor
        isOpen
        initialContent=""
        initialCardColor={STORED_CARD_COLOR}
        sourceReferences={[regionReference]}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('C: a text edit/save preserves image, background and provenance', () => {
  it('carries the hydrated background and provenance forward on save, even though only text changed', () => {
    const onSave = vi.fn();
    const container = mount(
      <NoteEditor
        isOpen
        initialContent=""
        initialCardColor={STORED_CARD_COLOR}
        sourceReferences={[regionReference]}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );

    // The only user action is a title edit -- the color picker is never touched.
    const titleInput = container.querySelector('input[placeholder="Post name"]') as HTMLInputElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(titleInput, 'My region note');
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const overlay = container.firstElementChild as HTMLElement;
    act(() => { clickBackdrop(overlay); });

    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0][0];
    expect(payload.title).toBe('My region note');
    // Pre-fix this was always undefined (state never left the hardcoded
    // white default), which usePadletSave.saveNote's metadata spread would
    // then write over the real stored color.
    expect(payload.cardColor).toBe(STORED_CARD_COLOR);

    // Provenance is presentational input to this editor, resolved by the
    // caller from the board index -- an unmodified save must not touch it,
    // and the crop must still be showing what it showed on open.
    expect(crop(container)).not.toBeNull();
  });
});

describe('D: reload/reopen retains the image, background and provenance', () => {
  it('a fresh mount with the same stored fields hydrates identically to the first', () => {
    const props = {
      isOpen: true as const,
      initialContent: '',
      initialCardColor: STORED_CARD_COLOR,
      sourceReferences: [regionReference],
      onSave: vi.fn(),
      onClose: vi.fn(),
    };
    const first = mount(<NoteEditor {...props} />);
    const firstCrop = crop(first)!.querySelector('img')!.getAttribute('src');
    const firstColor = cardDiv(first)!.style.backgroundColor;

    // A reload is a fresh mount against the same durable row -- not a state
    // carried in memory, so this must not depend on the first instance.
    const second = mount(<NoteEditor {...props} />);
    expect(crop(second)!.querySelector('img')!.getAttribute('src')).toBe(firstCrop);
    expect(cardDiv(second)!.style.backgroundColor).toBe(firstColor);
    expect(cardDiv(second)!.style.backgroundColor).toBe(EXPECTED_RGB);
  });
});

describe('E: a failed save retains the draft and existing durable content', () => {
  it('keeps the editor open, with the crop and background still showing, when onSave reports failed', async () => {
    const onSave = vi.fn(async () => ({ status: 'failed' as const }));
    const onClose = vi.fn();
    const container = mount(
      <NoteEditor
        isOpen
        initialContent=""
        initialCardColor={STORED_CARD_COLOR}
        sourceReferences={[regionReference]}
        onSave={onSave}
        onClose={onClose}
      />,
    );

    const overlay = container.firstElementChild as HTMLElement;
    await act(async () => {
      clickBackdrop(overlay);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    // The draft is still live in the (still-mounted) editor, and nothing
    // about the durable preview it opened with has been torn down.
    expect(crop(container)).not.toBeNull();
    expect(cardDiv(container)!.style.backgroundColor).toBe(EXPECTED_RGB);
  });
});

describe('F: ordinary Notes remain compatible', () => {
  it('a Note with no source reference and no stored color renders exactly as before -- no crop, white card', () => {
    const container = mount(
      <NoteEditor isOpen initialContent="<p>Just a note</p>" onSave={vi.fn()} onClose={vi.fn()} />,
    );
    expect(crop(container)).toBeNull();
    expect(cardDiv(container)!.style.backgroundColor).toBe('rgb(255, 255, 255)');
    expect(container.textContent).toContain('Just a note');
  });

  it('a Note with a real text citation (exact span) still shows no region crop', () => {
    const textReference: SourceReference = {
      ...regionReference,
      id: 'ref-text',
      quoteText: 'a verified slice',
      charStart: 0,
      charEnd: 16,
      region: null,
    } as unknown as SourceReference;
    const container = mount(
      <NoteEditor
        isOpen
        initialContent="<p>quoted text</p>"
        sourceReferences={[textReference]}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(crop(container)).toBeNull();
  });
});
