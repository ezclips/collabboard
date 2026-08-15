// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import SectionHeadingPost from '@/components/collabboard/canvas/ui/SectionHeadingPost';
import {
  SECTION_HEADING_ACCENT_WIDTH_PX,
  SECTION_HEADING_DEFAULT_HEIGHT,
  SECTION_HEADING_DEFAULT_LEVEL,
  SECTION_HEADING_DEFAULT_TEXT,
  SECTION_HEADING_DEFAULT_WIDTH,
  SECTION_HEADING_TYPE,
  canBeContainerChild,
  canBeGraphEndpoint,
  getSectionHeadingLevel,
  isSectionHeading,
  sanitizeSectionHeadingText,
} from '@/components/collabboard/canvas/engine/sectionHeading';
import { findContainerOverlappingRect, getEligibleContainerDestinations } from '@/components/collabboard/canvas/engine/utils';
import { FREEFORM_WORLD_MAX_X, FREEFORM_WORLD_MIN_X } from '@/components/collabboard/canvas/engine/freeformStageGeometry';
import { buildCanvasToolbarGroups } from '@/components/collabboard/canvas/ui/canvasToolbarRegistry';
import { getMinimapItemKind, getFallbackMinimapItem } from '@/components/collabboard/canvas/minimap/useFreeformMinimapGeometry';
import type { Padlet } from '@/types/collabboard';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8').replace(/\r\n/g, '\n');
}

/**
 * Source with comments stripped. Every `not.toMatch` below MUST run against
 * this rather than the raw file: a doc comment that merely mentions a banned
 * token ("imports nothing from Excalidraw", "no resize handles") would
 * otherwise satisfy the assertion and hide a real regression.
 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const canvasClient = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
const registrySrc = read('components/collabboard/canvas/ui/canvasToolbarRegistry.tsx');
const cardsSrc = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
const headingSrc = read('components/collabboard/canvas/ui/SectionHeadingPost.tsx');
const typesSrc = read('types/collabboard.ts');
const cameraSrc = read('components/collabboard/canvas/hooks/useCanvasCamera.ts');
const stageSrc = read('components/collabboard/canvas/engine/freeformStageGeometry.ts');
const navSrc = read('components/collabboard/canvas/minimap/FreeformNavigationControl.tsx');
const minimapSrc = read('components/collabboard/canvas/minimap/FreeformMinimap.tsx');
const librarySrc = read('components/collabboard/LibraryPanel.tsx');
const graphSrc = read('components/graph/FreeformGraphLayer.tsx');
const lineSrc = read('components/collabboard/SimpleLineRenderer.tsx');
const globalsCss = read('app/globals.css');

function makeHeading(overrides: Partial<Padlet> = {}): Padlet {
  return {
    id: 'sh-1',
    board_id: 'board-1',
    title: SECTION_HEADING_DEFAULT_TEXT,
    content: '',
    type: SECTION_HEADING_TYPE,
    position_x: 100,
    position_y: 200,
    width: SECTION_HEADING_DEFAULT_WIDTH,
    height: SECTION_HEADING_DEFAULT_HEIGHT,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    metadata: { headingLevel: SECTION_HEADING_DEFAULT_LEVEL },
    ...overrides,
  } as Padlet;
}

let roots: Root[] = [];
let hosts: HTMLElement[] = [];
afterEach(() => {
  for (const r of roots) act(() => r.unmount());
  for (const h of hosts) h.remove();
  roots = [];
  hosts = [];
});

function mount(padlet: Padlet, overrides: Partial<React.ComponentProps<typeof SectionHeadingPost>> = {}) {
  const onCommitText = vi.fn();
  const onMouseDownCapture = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  hosts.push(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(
    <SectionHeadingPost
      padlet={padlet}
      isSelected={overrides.isSelected ?? false}
      canEdit={overrides.canEdit ?? true}
      isDraggingThis={overrides.isDraggingThis ?? false}
      onMouseDownCapture={onMouseDownCapture}
      onCommitText={onCommitText}
      // PATCH SECTION-H3B: the heading now takes its coordinate truth from the
      // host. An identity converter keeps every SECTION-H1 assertion below
      // measuring exactly what it measured before.
      clientToWorld={(clientX, clientY) => ({ x: clientX, y: clientY })}
      worldBounds={{ minX: FREEFORM_WORLD_MIN_X, maxX: FREEFORM_WORLD_MAX_X }}
    />,
  ));
  return { host, onCommitText, onMouseDownCapture };
}

const FLAGS = {
  isMapLayout: false,
  isFreeformLayout: false,
  isFreeformGraphMode: false,
  isTimelineLayout: false,
  chronoMode: null,
  canManageCanvasShare: false,
  canUseFreeformEditButton: true,
};
function toolTypes(flags: Partial<typeof FLAGS>): string[] {
  return buildCanvasToolbarGroups({ ...FLAGS, ...flags } as never)
    .flatMap((g) => g.tools.map((t) => t.type));
}

// ============================================================ TYPE / ROUTING [1-9]
describe('SECTION-H1 type and routing [1-9]', () => {
  it('1. section_heading is a canonical post type in the Padlet union', () => {
    expect(typesSrc).toContain("| 'section_heading'");
    expect(SECTION_HEADING_TYPE).toBe('section_heading');
    expect(isSectionHeading({ type: 'section_heading' } as Padlet)).toBe(true);
    expect(isSectionHeading({ type: 'text' } as Padlet)).toBe(false);
  });

  it('2. a dedicated renderer route exists and is used instead of the generic card', () => {
    expect(cardsSrc).toContain("import SectionHeadingPost from '@/components/collabboard/canvas/ui/SectionHeadingPost'");
    expect(cardsSrc).toContain('rootPadlets.filter(padlet => isSectionHeading(padlet)).map');
    expect(cardsSrc).toContain('rootPadlets.filter(padlet => !isSectionHeading(padlet)).map');
  });

  it('3. Freeform supports it', () => {
    expect(toolTypes({ isFreeformLayout: true })).toContain('section-heading');
  });

  it('4. Drawing does NOT expose it yet (SECTION-H3)', () => {
    // Drawing is not a Freeform layout, so the registry never emits the tool.
    expect(toolTypes({ isFreeformLayout: false })).not.toContain('section-heading');
    expect(code(headingSrc)).not.toMatch(/excalidraw|Excalidraw|DrawingLayout/);
  });

  it.each([
    ['Wall', { isFreeformLayout: false }],
    ['Columns', { isFreeformLayout: false }],
    ['Grid', { isFreeformLayout: false }],
    ['Timeline', { isFreeformLayout: false, isTimelineLayout: true }],
    ['Map', { isFreeformLayout: false, isMapLayout: true }],
  ])('5-9. %s does not expose the Section heading tool', (_name, flags) => {
    expect(toolTypes(flags)).not.toContain('section-heading');
  });
});

// ============================================================ CREATION [10-20]
describe('SECTION-H1 creation [10-20]', () => {
  it('10/11. H toolbar item is present on Freeform and absent otherwise', () => {
    expect(toolTypes({ isFreeformLayout: true })).toContain('section-heading');
    expect(toolTypes({ isFreeformLayout: false })).not.toContain('section-heading');
  });

  it('accessible label is "Section heading"', () => {
    const tool = buildCanvasToolbarGroups({ ...FLAGS, isFreeformLayout: true } as never)
      .flatMap((g) => g.tools)
      .find((t) => t.type === 'section-heading');
    expect(tool?.label).toBe('Section heading');
  });

  it('12. the H action creates a section_heading post', () => {
    expect(canvasClient).toContain("case 'section-heading':");
    expect(canvasClient).toContain('void handleCreateSectionHeading();');
    expect(canvasClient).toContain("type: 'section_heading',");
  });

  it('13. default text', () => {
    expect(SECTION_HEADING_DEFAULT_TEXT).toBe('Section heading');
    expect(canvasClient).toContain('title: SECTION_HEADING_DEFAULT_TEXT,');
  });

  it('14. default heading level = 2', () => {
    expect(SECTION_HEADING_DEFAULT_LEVEL).toBe(2);
    expect(canvasClient).toContain('headingLevel: SECTION_HEADING_DEFAULT_LEVEL,');
  });

  it('15/16. default width 500 and compact height 64', () => {
    expect(SECTION_HEADING_DEFAULT_WIDTH).toBe(500);
    expect(SECTION_HEADING_DEFAULT_HEIGHT).toBe(64);
    expect(SECTION_HEADING_DEFAULT_HEIGHT).toBeLessThan(SECTION_HEADING_DEFAULT_WIDTH / 4);
    expect(canvasClient).toContain('const width = SECTION_HEADING_DEFAULT_WIDTH;');
    expect(canvasClient).toContain('const height = SECTION_HEADING_DEFAULT_HEIGHT;');
  });

  it('17/18. signed placement respected via the canonical helper, no zero clamp', () => {
    const start = canvasClient.indexOf('const handleCreateSectionHeading');
    const end = canvasClient.indexOf('// Handle "Add to Existing"', start);
    const body = canvasClient.slice(start, end);
    expect(body).toContain('getNewPostPosition(width, height)');
    expect(body).not.toMatch(/Math\.max\(0/);
  });

  it('19/20. creation uses the canonical repository insert, no separate persistence system', () => {
    const start = canvasClient.indexOf('const handleCreateSectionHeading');
    const end = canvasClient.indexOf('// Handle "Add to Existing"', start);
    const body = canvasClient.slice(start, end);
    expect(body).toContain('insertPostPreservingFailureChannels(headingPayload as any)');
    expect(body).not.toMatch(/supabase\.|from\('padlets'\)/);
  });

  it('selects the new heading after creation, and rolls back on insert failure', () => {
    const start = canvasClient.indexOf('const handleCreateSectionHeading');
    const end = canvasClient.indexOf('// Handle "Add to Existing"', start);
    const body = canvasClient.slice(start, end);
    expect(body).toContain('setSelectedPadletId(headingId);');
    expect(body).toContain('setPadlets((prev) => prev.filter((p) => p.id !== headingId));');
  });
});

// ============================================================ RENDER [21-27]
describe('SECTION-H1 render [21-27]', () => {
  it('21. renders via the dedicated component with a canonical root wrapper', () => {
    const { host } = mount(makeHeading());
    const root = host.querySelector('[data-section-heading="true"]');
    expect(root).not.toBeNull();
    expect(root?.getAttribute('data-padlet-id')).toBe('sh-1');
  });

  it('22. has a LEFT accent stripe (not a top stripe)', () => {
    const { host } = mount(makeHeading());
    const accent = host.querySelector<HTMLElement>('[data-section-heading-accent="true"]');
    expect(accent).not.toBeNull();
    expect(accent!.style.width).toBe(`${SECTION_HEADING_ACCENT_WIDTH_PX}px`);
    expect(accent!.className).toContain('h-full');
    // A left stripe is full-height and fixed-width; a top stripe would be the inverse.
    expect(accent!.style.height).not.toBe(`${SECTION_HEADING_ACCENT_WIDTH_PX}px`);
  });

  it('23. compact horizontal presentation at the declared geometry', () => {
    const { host } = mount(makeHeading());
    const surface = host.querySelector<HTMLElement>('[data-section-heading-surface="true"]')!;
    expect(surface.style.width).toBe(`${SECTION_HEADING_DEFAULT_WIDTH}px`);
    expect(surface.style.height).toBe(`${SECTION_HEADING_DEFAULT_HEIGHT}px`);
  });

  it('24/25. no Note chrome, body, footer or comment badge', () => {
    const { host } = mount(makeHeading());
    expect(host.querySelector('[data-comment-panel="true"]')).toBeNull();
    expect(host.textContent).not.toContain('comment');
    // The renderer owns its markup and pulls in none of the card chrome.
    expect(code(headingSrc)).not.toMatch(/PostCardContent|CommentPopup|NoteEditor|DocumentEditor|ReactionDisplay/);
  });

  it('26. renders the plain heading text', () => {
    const { host } = mount(makeHeading({ title: 'RESEARCH & SOURCES' }));
    expect(host.querySelector('[data-section-heading-text="true"]')!.textContent).toBe('RESEARCH & SOURCES');
  });

  it('27. single-line overflow policy (truncate, never grow)', () => {
    const { host } = mount(makeHeading({ title: 'x'.repeat(180) }));
    const label = host.querySelector<HTMLElement>('[data-section-heading-text="true"]')!;
    expect(label.className).toContain('truncate');
    const surface = host.querySelector<HTMLElement>('[data-section-heading-surface="true"]')!;
    expect(surface.style.height).toBe(`${SECTION_HEADING_DEFAULT_HEIGHT}px`);
  });

  it('renders level-aware typography so SECTION-H2 only adds the control', () => {
    const h1 = mount(makeHeading({ metadata: { headingLevel: 1 } as never }));
    const h4 = mount(makeHeading({ metadata: { headingLevel: 4 } as never }));
    const cls = (h: HTMLElement) => h.querySelector('[data-section-heading-text="true"]')!.className;
    expect(cls(h1.host)).not.toBe(cls(h4.host));
  });

  it('uses only safe theme tokens (no undefined primary/secondary/destructive)', () => {
    expect(code(headingSrc)).not.toMatch(/bg-primary|bg-secondary|bg-destructive|text-primary\b|text-secondary\b/);
  });
});

// ============================================================ EDIT [28-36]
describe('SECTION-H1 editing [28-36]', () => {
  function enterEdit(host: HTMLElement) {
    const label = host.querySelector<HTMLElement>('[data-section-heading-text="true"]')!;
    act(() => label.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    return host.querySelector<HTMLInputElement>('[data-section-heading-input="true"]');
  }

  it('28. double-click enters inline edit', () => {
    const { host } = mount(makeHeading());
    expect(enterEdit(host)).not.toBeNull();
  });

  it('29/30. typing then Enter commits through the canonical callback', () => {
    const { host, onCommitText } = mount(makeHeading());
    const input = enterEdit(host)!;
    act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(input, 'Design notes');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(onCommitText).toHaveBeenCalledWith('sh-1', 'Design notes');
    expect(host.querySelector('[data-section-heading-input="true"]')).toBeNull();
  });

  it('31. Escape cancels without committing and restores the original text', () => {
    const { host, onCommitText } = mount(makeHeading({ title: 'Original' }));
    const input = enterEdit(host)!;
    act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(input, 'Discarded');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(onCommitText).not.toHaveBeenCalled();
    expect(host.querySelector('[data-section-heading-text="true"]')!.textContent).toBe('Original');
  });

  it('32. sanitizes to plain single-line text (no HTML, no newlines)', () => {
    expect(sanitizeSectionHeadingText('<b>Bold</b> heading')).toBe('Bold heading');
    expect(sanitizeSectionHeadingText('line one\nline two')).toBe('line one line two');
    expect(sanitizeSectionHeadingText('<img src=x onerror=alert(1)>hi')).toBe('hi');
    expect(sanitizeSectionHeadingText('  padded  ')).toBe('padded');
  });

  it('33. empty heading is safe', () => {
    expect(sanitizeSectionHeadingText('')).toBe('');
    expect(sanitizeSectionHeadingText('   ')).toBe('');
    const { host } = mount(makeHeading({ title: '' }));
    expect(host.querySelector('[data-section-heading-text="true"]')!.textContent).toBe('');
  });

  it('34. long heading is capped, never unbounded', () => {
    expect(sanitizeSectionHeadingText('y'.repeat(5000))).toHaveLength(200);
  });

  it('35. Unicode and emoji survive intact', () => {
    expect(sanitizeSectionHeadingText('Recherche 🔬 — Ünïcode ✓')).toBe('Recherche 🔬 — Ünïcode ✓');
    const { host } = mount(makeHeading({ title: '研究 🔬' }));
    expect(host.querySelector('[data-section-heading-text="true"]')!.textContent).toBe('研究 🔬');
  });

  it('36. commit routes through the canonical stamped title write', () => {
    expect(cardsSrc).toContain('onCommitText={(padletId, nextText) => { void updatePadletTitle(padletId, nextText); }}');
    // updatePadletTitle is the honest stamped command, not the best-effort one.
    const dataHook = read('components/collabboard/canvas/hooks/useCanvasData.ts');
    expect(dataHook).toContain('const updatePostTitle = createUpdatePostTitleCommand(createPostsRepository());');
  });

  it('read-only users cannot enter edit mode', () => {
    const { host } = mount(makeHeading(), { canEdit: false });
    const label = host.querySelector<HTMLElement>('[data-section-heading-text="true"]')!;
    act(() => label.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    expect(host.querySelector('[data-section-heading-input="true"]')).toBeNull();
  });
});

// ============================================================ CANVAS [37-45]
describe('SECTION-H1 canvas behaviour [37-45]', () => {
  it('37/38. click routes to the canonical root drag/selection handler', () => {
    const { host, onMouseDownCapture } = mount(makeHeading());
    const root = host.querySelector('[data-section-heading="true"]')!;
    act(() => root.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
    expect(onMouseDownCapture).toHaveBeenCalled();
    expect(onMouseDownCapture.mock.calls[0][1]).toBe('sh-1');
    expect(cardsSrc).toContain('onMouseDownCapture={handlePadletMouseDown}');
  });

  it('selection ring reflects the canonical selection predicate', () => {
    const { host } = mount(makeHeading(), { isSelected: true });
    expect(host.querySelector('[data-section-heading-surface="true"]')!.className).toContain('ring-2');
    expect(cardsSrc).toContain('isSelected={isPadletSelected(padlet.id)}');
  });

  it('39/40/41/42. renders at signed negative coordinates with no zero clamp', () => {
    const { host } = mount(makeHeading({ position_x: -1200, position_y: -800 }));
    const root = host.querySelector<HTMLElement>('[data-section-heading="true"]')!;
    expect(root.style.left).toBe('-1200px');
    expect(root.style.top).toBe('-800px');
    expect(code(headingSrc)).not.toMatch(/Math\.max\(0/);
    // Signed clamping stays owned by the frozen 9V.2B contract, not re-implemented here.
    expect(code(headingSrc)).not.toMatch(/clampRectPositionToFreeformBounds|FREEFORM_WORLD_MIN/);
  });

  it('43/44/45. duplicate/delete/z-order use generic infrastructure, not a bespoke path', () => {
    // z-order: same stored metadata.zIndex convention as every other root.
    const { host } = mount(makeHeading({ metadata: { headingLevel: 2, zIndex: 77 } as never }));
    expect(host.querySelector<HTMLElement>('[data-section-heading="true"]')!.style.zIndex).toBe('77');
    // No Section-Heading-specific delete/duplicate/persistence path exists.
    expect(code(headingSrc)).not.toMatch(/deletePadlet|duplicate|supabase|Repository/i);
  });

  // SECTION-H1 Phase 16 deferred resizing entirely and this test asserted the
  // renderer contained no resize code at all. PATCH SECTION-H2 Phase 9 is the
  // patch that was explicitly scheduled to add it, so the assertion is
  // narrowed to what H1 was really protecting -- that a Section Heading never
  // acquires the generic free-resize model -- and the full horizontal-only
  // contract is proved in sectionHeadingFormatting.test.tsx.
  it('35(scope). a Section Heading never gets the generic free-resize model', () => {
    const { host } = mount(makeHeading(), { isSelected: true });
    expect(host.querySelector('[data-resize-handle]')).toBeNull();
    // No corner/rotation affordance, and no vertical sizing of any kind.
    expect(host.querySelector('[data-section-heading-handle="top"]')).toBeNull();
    expect(host.querySelector('[data-section-heading-handle="bottom"]')).toBeNull();
    expect(code(headingSrc)).not.toMatch(/nwse-resize|ns-resize|rotat/i);
  });
});

// ============================================================ EXCLUSIONS [46-52]
describe('SECTION-H1 exclusions [46-52]', () => {
  const container: Padlet = {
    id: 'c-1', board_id: 'b', title: 'Col', content: '', type: 'container',
    position_x: 0, position_y: 0, width: 400, height: 300,
    created_at: '', updated_at: '', metadata: {},
  } as Padlet;

  it('46. a Section Heading cannot attach as a Container child on drag-over/drop', () => {
    const heading = makeHeading({ id: 'sh-1', position_x: 10, position_y: 10 });
    const note = { ...heading, id: 'n-1', type: 'text' } as Padlet;
    const overlappingRect = { x: 10, y: 10, width: 100, height: 50 };
    // A normal post over the same container still attaches...
    expect(findContainerOverlappingRect([container, note], overlappingRect, 'n-1')?.id).toBe('c-1');
    // ...the Section Heading never does.
    expect(findContainerOverlappingRect([container, heading], overlappingRect, 'sh-1')).toBeNull();
    expect(canBeContainerChild(heading)).toBe(false);
    expect(canBeContainerChild(note)).toBe(true);
  });

  it('47. Group into Column is never offered for a Section Heading', () => {
    // The dedicated renderer supplies no groupIntoColumnTargets at all.
    expect(code(headingSrc)).not.toContain('groupIntoColumnTargets');
    // And the shared destination rule is unchanged for real posts.
    expect(getEligibleContainerDestinations([container], 'n-1').map((c) => c.id)).toEqual(['c-1']);
  });

  it('48/49. not a Graph endpoint and exposes no connection handles', () => {
    expect(canBeGraphEndpoint(makeHeading())).toBe(false);
    expect(canBeGraphEndpoint({ type: 'text' } as Padlet)).toBe(true);
    // The graph-connect mousedown branch lives only on the generic wrapper.
    expect(code(headingSrc)).not.toMatch(/setGraphConnectSelection|getClickedSide|isGraphConnectMode/);
  });

  it('50/51/52. no Document Read, Image or Comment-specific actions leak in', () => {
    expect(code(headingSrc)).not.toMatch(/onReadDocument|requestOpenDocument|selectDocumentModalDestination/);
    expect(code(headingSrc)).not.toMatch(/cropToGrid|imageUrl|ImageEditor/);
    expect(code(headingSrc)).not.toMatch(/detachedComments|CommentPopup|commentAccessMode/);
  });

  it('20(product). dragging a heading moves no other post -- it owns no children', () => {
    expect(code(headingSrc)).not.toMatch(/childPadletIds|parentId/);
  });
});

// ============================================================ MINIMAP [53-57]
describe('SECTION-H1 minimap [53-57]', () => {
  it('53/54. measured as a plain root post, giving a horizontal silhouette', () => {
    const heading = makeHeading();
    expect(getMinimapItemKind(heading)).toBe('post');
    const item = getFallbackMinimapItem(heading)!;
    expect(item.width).toBe(SECTION_HEADING_DEFAULT_WIDTH);
    expect(item.height).toBe(SECTION_HEADING_DEFAULT_HEIGHT);
    expect(item.width).toBeGreaterThan(item.height);
  });

  it('55. a negative-coordinate heading enters the minimap bounds unclamped', () => {
    const item = getFallbackMinimapItem(makeHeading({ position_x: -900, position_y: -450 }))!;
    expect(item.x).toBe(-900);
    expect(item.y).toBe(-450);
  });

  it('56/57. minimap projection and navigation are untouched by this patch', () => {
    const geometry = read('components/collabboard/canvas/minimap/freeformMinimapGeometry.ts');
    expect(geometry).toContain('x: projection.offsetX + (point.x - projection.displayBounds.x) * projection.scale,');
    expect(geometry).not.toMatch(/section_heading/);
    expect(minimapSrc).not.toMatch(/section_heading/);
  });

  it('the heading is measured through the generic [data-padlet-id] path', () => {
    const geometryHook = read('components/collabboard/canvas/minimap/useFreeformMinimapGeometry.ts');
    expect(geometryHook).toContain("querySelectorAll<HTMLElement>('[data-padlet-id]')");
    expect(geometryHook).not.toMatch(/section_heading/);
    const { host } = mount(makeHeading());
    expect(host.querySelector('[data-padlet-id="sh-1"]')).not.toBeNull();
  });
});

// ============================================================ DATA [58-66]
describe('SECTION-H1 data model [58-66]', () => {
  it('58/59. the repository/serializer are type-agnostic and need no section_heading branch', () => {
    const repo = read('lib/infra/canvas/postsRepository.ts');
    expect(repo).not.toMatch(/section_heading/);
    expect(repo).toContain("from('padlets')");
  });

  it('60/61/62/63/64. type, text, level and geometry all round-trip through existing columns', () => {
    const heading = makeHeading({ title: 'Persisted', width: 640, height: 64, position_x: -12, position_y: 34 });
    const serialized = JSON.parse(JSON.stringify(heading)) as Padlet;
    expect(serialized.type).toBe('section_heading');
    expect(serialized.title).toBe('Persisted');
    expect(getSectionHeadingLevel(serialized)).toBe(2);
    expect(serialized.width).toBe(640);
    expect(serialized.height).toBe(64);
    expect(serialized.position_x).toBe(-12);
    expect(serialized.position_y).toBe(34);
  });

  it('level defaults safely when metadata is absent or malformed', () => {
    expect(getSectionHeadingLevel({ metadata: undefined } as Padlet)).toBe(2);
    expect(getSectionHeadingLevel({ metadata: { headingLevel: 9 } } as never)).toBe(2);
    expect(getSectionHeadingLevel({ metadata: { headingLevel: 3 } } as never)).toBe(3);
  });

  it('65. NO schema migration is required (padlets.type is varchar(50) with no CHECK)', () => {
    const snapshot = read('supabase/baseline/schema_snapshot_2026-07-05.sql');
    const table = snapshot.slice(
      snapshot.indexOf('CREATE TABLE IF NOT EXISTS "public"."padlets"'),
      snapshot.indexOf('ALTER TABLE "public"."padlets" OWNER TO'),
    );
    expect(table).toContain('"type" character varying(50)');
    expect(table).not.toMatch(/padlets_type_check/);
    expect('section_heading'.length).toBeLessThanOrEqual(50);
  });

  it('66. this patch adds no migration file and performs no live-data action', () => {
    const migrations = fs.readdirSync(path.join(process.cwd(), 'supabase/migrations'));
    expect(migrations.filter((f) => /section.?heading/i.test(f))).toEqual([]);
  });

  it('reuses existing generic metadata for future styling instead of new columns', () => {
    // Only headingLevel was added; colours reuse the pre-existing fields.
    expect(typesSrc).toContain('headingLevel?: 1 | 2 | 3 | 4;');
    expect(typesSrc).not.toMatch(/sectionHeadingBackground|sectionHeadingAccent|headingTextColor/);
  });
});

// ============================================================ FROZEN [67-75]
describe('SECTION-H1 frozen regressions [67-75]', () => {
  it('67/68. signed world 9V.2A / signed placement 9V.2B frozen', () => {
    expect(stageSrc).not.toMatch(/section_heading|SectionHeading/);
    expect(read('components/collabboard/canvas/hooks/useCanvasInteractions.ts')).not.toMatch(/section_heading|SectionHeading/);
  });

  it('69. responsive toolbar 9V.2C frozen', () => {
    const sidebar = read('components/collabboard/canvas/ui/CanvasSidebar.tsx');
    expect(sidebar).toContain('z-[3001]');
    expect(sidebar).not.toMatch(/section_heading/);
  });

  it('70. theme tokens 9V.2E frozen', () => {
    expect(globalsCss).toContain('--color-popover: var(--popover);');
    expect(globalsCss).not.toMatch(/--primary\s*:|--secondary\s*:|--destructive\s*:/);
  });

  it('71. unified navigation 9W frozen', () => {
    expect(navSrc).toContain('pointer-events-auto absolute bottom-4 left-[72px] z-40 w-[168px]');
    expect(navSrc).not.toMatch(/section_heading/);
  });

  it('72. Library stacking 9W.1 frozen', () => {
    expect(librarySrc).toContain('z-[800]');
    const viewportEnd = canvasClient.indexOf('</CanvasViewport>');
    expect(canvasClient.indexOf('<LibraryPanel')).toBeGreaterThan(viewportEnd);
  });

  it('73. Graph frozen', () => {
    expect(graphSrc).not.toMatch(/section_heading|SectionHeading/);
  });

  it('74. Manual Line frozen', () => {
    expect(lineSrc).not.toMatch(/section_heading|SectionHeading/);
  });

  it('75. camera 9S frozen', () => {
    expect(cameraSrc).not.toMatch(/section_heading|SectionHeading/);
    expect(cameraSrc).toContain('const ZOOM_STEP = 0.1;');
  });
});
