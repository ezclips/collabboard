// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import SectionHeadingPost from '@/components/collabboard/canvas/ui/SectionHeadingPost';
import SectionHeadingToolbar from '@/components/collabboard/canvas/ui/SectionHeadingToolbar';
import {
  SECTION_HEADING_DEFAULT_HEIGHT,
  SECTION_HEADING_DEFAULT_LEVEL,
  SECTION_HEADING_DEFAULT_TEXT,
  SECTION_HEADING_DEFAULT_WIDTH,
  SECTION_HEADING_TYPE,
  SECTION_HEADING_UNBOUNDED_WORLD,
} from '@/components/collabboard/canvas/engine/sectionHeading';
import { FREEFORM_WORLD_MAX_X, FREEFORM_WORLD_MIN_X } from '@/components/collabboard/canvas/engine/freeformStageGeometry';
import { buildCanvasToolbarGroups } from '@/components/collabboard/canvas/ui/canvasToolbarRegistry';
import type { Padlet } from '@/types/collabboard';

/**
 * PATCH SECTION-H3B.1 -- selection persistence + inline edit entry.
 *
 * Root cause (confirmed by a real-browser reproduction fixture, see the
 * RETURN report): SectionHeadingPost was the only root post type that never
 * stopped a `click` from bubbling to the canvas viewport's blank-space
 * deselect handler (CanvasClient.tsx). A single click selected the heading on
 * MOUSEDOWN, then its own CLICK -- unstopped -- reached the viewport and was
 * read as "clicked empty canvas", deselecting it a moment later. Every other
 * post type (Note/Image/Comment/...) already stops this at its own card
 * boundary; the fix gives Section Heading the same boundary.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8').replace(/\r\n/g, '\n');
}

/** Comments stripped -- see sectionHeading.test.tsx for why this matters. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const headingSrc = read('components/collabboard/canvas/ui/SectionHeadingPost.tsx');
const toolbarSrc = read('components/collabboard/canvas/ui/SectionHeadingToolbar.tsx');
const appearanceSrc = read('components/collabboard/canvas/ui/SectionHeadingAppearancePanel.tsx');
const textStyleSrc = read('components/collabboard/canvas/ui/SectionHeadingTextStylePanel.tsx');
const engineSrc = read('components/collabboard/canvas/engine/sectionHeading.ts');
const cardsSrc = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
const canvasClient = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
const stageSrc = read('components/collabboard/canvas/engine/freeformStageGeometry.ts');
const typesSrc = read('types/collabboard.ts');

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
      clientToWorld={(clientX, clientY) => ({ x: clientX, y: clientY })}
      worldBounds={{ minX: FREEFORM_WORLD_MIN_X, maxX: FREEFORM_WORLD_MAX_X }}
      {...overrides}
    />,
  ));
  return { host, onCommitText, onMouseDownCapture };
}

/**
 * A minimal harness reproducing the REAL selection wiring end-to-end in
 * jsdom: an outer "viewport" whose onClick deselects everything unless a
 * descendant already stopped propagation (CanvasClient.tsx:6576's actual
 * logic), and a mousedown-establishes-canonical-selection handler
 * (useCanvasInteractions.ts:198-239's essential behavior). This is what lets
 * these tests prove the CLICK BUBBLE bug and its fix behaviorally, not just
 * assert the presence of a stopPropagation call in source.
 */
function mountWithCanonicalSelection(padlet: Padlet, other: Padlet | null = null) {
  const onCommitText = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  hosts.push(host);
  const root = createRoot(host);
  roots.push(root);

  function Harness() {
    const [selectedId, setSelectedId] = React.useState<string | null>(null);
    const [headingEl, setHeadingEl] = React.useState<HTMLElement | null>(null);
    return (
      <div
        data-probe-viewport="true"
        onClick={() => setSelectedId(null)}
      >
        <div ref={setHeadingEl} data-padlet-id={padlet.id}>
          <SectionHeadingPost
            padlet={padlet}
            isSelected={selectedId === padlet.id}
            canEdit={true}
            isDraggingThis={false}
            onMouseDownCapture={(_event, padletId) => setSelectedId(padletId)}
            onCommitText={onCommitText}
            clientToWorld={(x, y) => ({ x, y })}
            worldBounds={SECTION_HEADING_UNBOUNDED_WORLD}
          />
        </div>
        {selectedId === padlet.id && (
          <SectionHeadingToolbar
            padlet={padlet}
            headingElement={headingEl}
            viewportRevision={1}
            onChangeLevel={() => {}}
            onChangeTextStyle={() => {}}
            onChangeColor={() => {}}
          />
        )}
        {other && (
          <div
            data-padlet-id={other.id}
            data-other-post="true"
            onMouseDown={() => setSelectedId(other.id)}
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </div>
    );
  }

  act(() => root.render(<Harness />));
  return { host, onCommitText };
}

/** A real down->up->click sequence, exactly like a browser's zero-drag click. */
function click(target: Element) {
  act(() => target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })));
  act(() => target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 })));
  act(() => target.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 })));
}

function isSelected(host: HTMLElement): boolean {
  return host.querySelector('[data-section-heading-surface="true"]')!.className.includes('ring-2');
}

// ============================================================ SELECTION PERSISTENCE [1-10]
describe('SECTION-H3B.1 selection persistence [1-10]', () => {
  it('1. single click selects the heading', () => {
    const { host } = mountWithCanonicalSelection(makeHeading());
    const surface = host.querySelector('[data-section-heading-surface="true"]')!;
    click(surface);
    expect(isSelected(host)).toBe(true);
  });

  it('2. selection is canonical (isSelected prop-driven), not a local surrogate', () => {
    expect(code(headingSrc)).not.toMatch(/useState<boolean>\(false\).*isSelected|const \[isSelected|const \[isHovered|const \[keepSelected/);
    expect(headingSrc).toContain('isSelected,');
    expect(cardsSrc).toContain('isSelected={isPadletSelected(padlet.id)}');
  });

  it('3. pointerleave does not deselect', () => {
    const { host } = mountWithCanonicalSelection(makeHeading());
    click(host.querySelector('[data-section-heading-surface="true"]')!);
    const root = host.querySelector('[data-section-heading="true"]')!;
    act(() => root.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true })));
    expect(isSelected(host)).toBe(true);
  });

  it('4. mouseleave does not deselect', () => {
    const { host } = mountWithCanonicalSelection(makeHeading());
    click(host.querySelector('[data-section-heading-surface="true"]')!);
    const root = host.querySelector('[data-section-heading="true"]')!;
    act(() => root.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true })));
    expect(isSelected(host)).toBe(true);
  });

  it('5. pointerup alone does not deselect', () => {
    const { host } = mountWithCanonicalSelection(makeHeading());
    const surface = host.querySelector('[data-section-heading-surface="true"]')!;
    act(() => surface.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })));
    act(() => surface.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })));
    expect(isSelected(host)).toBe(true);
  });

  it('6/7. no handler exists that could clear selection or hide the toolbar on hover leaving', () => {
    // SectionHeadingPost renders no mouseleave/pointerleave/mouseenter listener
    // at all -- selection persistence follows from having NOTHING to trigger
    // on, not from a leave-handler that happens to no-op.
    expect(code(headingSrc)).not.toMatch(/onMouseLeave|onPointerLeave|onMouseEnter|onPointerEnter/);
    expect(code(toolbarSrc)).not.toMatch(/onMouseLeave|onPointerLeave/);
  });

  it('8. selected resize handles remain mounted after pointerleave/mouseleave', () => {
    const { host } = mount(makeHeading(), { isSelected: true });
    expect(host.querySelectorAll('[data-section-heading-handle]')).toHaveLength(2);
    const root = host.querySelector('[data-section-heading="true"]')!;
    act(() => root.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true })));
    act(() => root.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true })));
    expect(host.querySelectorAll('[data-section-heading-handle]')).toHaveLength(2);
  });

  it('9. a genuinely blank canvas click still deselects', () => {
    const { host } = mountWithCanonicalSelection(makeHeading());
    click(host.querySelector('[data-section-heading-surface="true"]')!);
    expect(isSelected(host)).toBe(true);
    const viewport = host.querySelector('[data-probe-viewport="true"]')!;
    click(viewport); // click lands directly on the viewport, not on the heading
    expect(isSelected(host)).toBe(false);
  });

  it('10. selecting another post deselects the heading (no special heading ownership)', () => {
    const heading = makeHeading();
    const other = { ...heading, id: 'other-1' } as Padlet;
    const { host } = mountWithCanonicalSelection(heading, other);
    click(host.querySelector('[data-section-heading-surface="true"]')!);
    expect(isSelected(host)).toBe(true);
    const otherEl = host.querySelector('[data-other-post="true"]')!;
    act(() => otherEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
    expect(isSelected(host)).toBe(false);
  });
});

// ============================================================ CLICK VS DRAG [11-16]
describe('SECTION-H3B.1 click/drag/edit-entry [11-16]', () => {
  function enterEditByDoubleClick(host: HTMLElement) {
    const label = host.querySelector<HTMLElement>('[data-section-heading-text="true"]')!;
    act(() => label.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    return host.querySelector<HTMLInputElement>('[data-section-heading-input="true"]');
  }

  it('11. double-click enters inline edit', () => {
    const { host } = mount(makeHeading());
    expect(enterEditByDoubleClick(host)).not.toBeNull();
  });

  it('12. dblclick is not swallowed by the drag/mousedown path', () => {
    // The wrapper's mousedownCapture only ever calls preventDefault/stops
    // nothing that would cancel a subsequent native dblclick, and it is not
    // gated behind any drag-distance threshold of its own.
    expect(code(headingSrc)).not.toMatch(/PADLET_DRAG_START_DISTANCE|dragThreshold/);
    const { host, onMouseDownCapture } = mount(makeHeading());
    const root = host.querySelector('[data-section-heading="true"]')!;
    act(() => root.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
    expect(onMouseDownCapture).toHaveBeenCalledTimes(1);
    expect(enterEditByDoubleClick(host)).not.toBeNull();
  });

  it('13. F2 enters edit when the heading text is focused', () => {
    const { host } = mount(makeHeading());
    const label = host.querySelector<HTMLElement>('[data-section-heading-text="true"]')!;
    act(() => label.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true })));
    expect(host.querySelector('[data-section-heading-input="true"]')).not.toBeNull();
  });

  it('14. Enter also enters edit (pre-existing SECTION-H1 convention, retained)', () => {
    const { host } = mount(makeHeading());
    const label = host.querySelector<HTMLElement>('[data-section-heading-text="true"]')!;
    act(() => label.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(host.querySelector('[data-section-heading-input="true"]')).not.toBeNull();
  });

  it('15. the input receives focus on entering edit', () => {
    const { host } = mount(makeHeading());
    const input = enterEditByDoubleClick(host)!;
    expect(document.activeElement).toBe(input);
  });

  it('16. clicking/mousedown inside the input does not start a canvas drag', () => {
    const { host, onMouseDownCapture } = mount(makeHeading());
    const input = enterEditByDoubleClick(host)!;
    onMouseDownCapture.mockClear();
    act(() => input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
    // The wrapper bails out entirely while isEditing -- the host callback
    // (which is what would start a drag) is never invoked.
    expect(onMouseDownCapture).not.toHaveBeenCalled();
  });

  it('D-guard. the real handlePadletMouseDown selects AT MOUSEDOWN, not only after a drag threshold is crossed', () => {
    const interactionsSrc = read('components/collabboard/canvas/hooks/useCanvasInteractions.ts');
    const start = interactionsSrc.indexOf('const handlePadletMouseDown = ');
    const end = interactionsSrc.indexOf('const handleImagePadletDrag');
    const body = interactionsSrc.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    // The unconditional-at-mousedown call, NOT the one gated behind
    // PADLET_DRAG_START_DISTANCE inside handleCanvasMouseMove -- a click with
    // ZERO drag must still leave the object selected.
    expect(body).toContain('if (!isTemporaryGroupDrag) {\n      setSelectedPadletId(padletId);\n    }');
  });
});

// ============================================================ INLINE EDIT COMMIT/CANCEL [17-21]
describe('SECTION-H3B.1 inline edit commit/cancel [17-21]', () => {
  function enterEdit(host: HTMLElement) {
    const label = host.querySelector<HTMLElement>('[data-section-heading-text="true"]')!;
    act(() => label.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    return host.querySelector<HTMLInputElement>('[data-section-heading-input="true"]')!;
  }
  function typeInto(input: HTMLInputElement, value: string) {
    act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  it('17. typing updates the draft shown in the input', () => {
    const { host } = mount(makeHeading());
    const input = enterEdit(host);
    typeInto(input, 'Research & Sources');
    expect(input.value).toBe('Research & Sources');
  });

  it('18. Enter commits through the canonical callback exactly once', () => {
    const { host, onCommitText } = mount(makeHeading());
    const input = enterEdit(host);
    typeInto(input, 'Research & Sources');
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(onCommitText).toHaveBeenCalledTimes(1);
    expect(onCommitText).toHaveBeenCalledWith('sh-1', 'Research & Sources');
  });

  it('19. Escape cancels and restores the original text', () => {
    const { host, onCommitText } = mount(makeHeading({ title: 'Original' }));
    const input = enterEdit(host);
    typeInto(input, 'Discarded');
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(onCommitText).not.toHaveBeenCalled();
    expect(host.querySelector('[data-section-heading-text="true"]')!.textContent).toBe('Original');
  });

  it('20. commit persists exactly once, not once per keystroke', () => {
    const { host, onCommitText } = mount(makeHeading());
    const input = enterEdit(host);
    typeInto(input, 'R');
    typeInto(input, 'Re');
    typeInto(input, 'Research');
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(onCommitText).toHaveBeenCalledTimes(1);
  });

  it('21. cancel persists zero times', () => {
    const { host, onCommitText } = mount(makeHeading());
    const input = enterEdit(host);
    typeInto(input, 'Discarded entirely');
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(onCommitText).toHaveBeenCalledTimes(0);
  });
});

// ============================================================ TOOLBAR/PANEL RETENTION [22-27]
describe('SECTION-H3B.1 toolbar/panel interaction retention [22-27]', () => {
  it('22/23. toolbar root and H-level buttons isolate their own click/mousedown/pointerdown', () => {
    const body = code(toolbarSrc);
    expect(body).toMatch(/const isolate = \(event: React\.SyntheticEvent\) => event\.stopPropagation\(\);/);
    expect(body).toMatch(/onMouseDown=\{isolate\}[\s\S]{0,80}onClick=\{isolate\}[\s\S]{0,80}onDoubleClick=\{isolate\}[\s\S]{0,80}onPointerDown=\{isolate\}/);
  });

  it('24. the Text style panel is rendered INSIDE the isolated toolbar root', () => {
    const start = toolbarSrc.indexOf("data-section-heading-panel=\"text\"");
    const rootStart = toolbarSrc.indexOf('return (');
    expect(start).toBeGreaterThan(rootStart);
    // and nothing closes the isolated root div before the panel is rendered
    const isolatedRootOpen = toolbarSrc.indexOf('onContextMenu={isolate}');
    expect(start).toBeGreaterThan(isolatedRootOpen);
  });

  it('25. the Appearance panel is rendered INSIDE the isolated toolbar root', () => {
    const start = toolbarSrc.indexOf("data-section-heading-panel=\"appearance\"");
    const isolatedRootOpen = toolbarSrc.indexOf('onContextMenu={isolate}');
    expect(start).toBeGreaterThan(isolatedRootOpen);
  });

  it('26. color swatch buttons carry no click handler that reaches outside the panel', () => {
    // Appearance panel relies on the ancestor toolbar's isolate -- it must not
    // itself call anything selection-related.
    expect(code(appearanceSrc)).not.toMatch(/setSelectedPadletId|stopPropagation\(\)\s*;\s*setSelected/);
  });

  it('27. resize handles stop propagation on every pointer phase (and are covered by the same click fix)', () => {
    const body = code(headingSrc);
    expect(body).toMatch(/onPointerDown=\{handleSizingStart\(edge\)\}/);
    expect(body).toMatch(/handleSizingStart[\s\S]{0,200}event\.stopPropagation\(\)/);
    expect(body).toMatch(/handleSizingEnd[\s\S]{0,300}event\.stopPropagation\(\)/);
    // The outer wrapper's onClick fix covers ANY descendant, handles included.
    expect(body).toMatch(/onClick=\{\(event\) => \{[\s\S]{0,120}event\.stopPropagation\(\);/);
  });
});

// ============================================================ FROZEN [28-35]
describe('SECTION-H3B.1 frozen invariants [28-35]', () => {
  it('28. resize math/geometry helper is untouched by this patch', () => {
    expect(engineSrc).toContain('export function resizeSectionHeadingRightEdge(');
    expect(engineSrc).toContain('export function resizeSectionHeadingLeftEdge(');
    expect(engineSrc).not.toMatch(/isSelected|onClick|stopPropagation/);
  });

  it('29. signed-world bounds contract (SectionHeadingWorldBounds) is untouched', () => {
    expect(engineSrc).toContain('export interface SectionHeadingWorldBounds {');
    expect(engineSrc).toContain('export const SECTION_HEADING_UNBOUNDED_WORLD: SectionHeadingWorldBounds');
    expect(stageSrc).not.toMatch(/section_heading|SectionHeading/);
  });

  it('30. H1-H4 typography map is untouched', () => {
    expect(engineSrc).toContain("1: 'text-2xl font-bold'");
    expect(engineSrc).toContain("4: 'text-base font-medium'");
  });

  it('31. style/colour metadata contract is untouched', () => {
    expect(typesSrc).toContain('headingLevel?: 1 | 2 | 3 | 4;');
    expect(typesSrc).toContain('accentColor?: string;');
  });

  it('32. minimap geometry is untouched', () => {
    const geometry = read('components/collabboard/canvas/minimap/freeformMinimapGeometry.ts');
    expect(geometry).not.toMatch(/section_heading/);
  });

  it('33. navigator is untouched', () => {
    const navSrc = read('components/collabboard/canvas/minimap/FreeformNavigationControl.tsx');
    expect(navSrc).not.toMatch(/section_heading/);
  });

  it('34. non-Freeform, non-Drawing layouts still do not expose the H tool (superseded by SECTION-H3C: Drawing itself now does)', () => {
    const FLAGS = {
      isMapLayout: false, isFreeformLayout: false, isFreeformGraphMode: false,
      isTimelineLayout: false, chronoMode: null, canManageCanvasShare: false,
      canUseFreeformEditButton: true, isDrawingLayout: false,
    };
    const types = buildCanvasToolbarGroups(FLAGS as never).flatMap((g) => g.tools.map((t) => t.type));
    expect(types).not.toContain('section-heading');
  });

  it('35. no Drawing/Excalidraw file is touched by this patch', () => {
    expect(code(headingSrc)).not.toMatch(/excalidraw|Excalidraw|DrawingLayout/);
    expect(code(toolbarSrc)).not.toMatch(/excalidraw|Excalidraw|DrawingLayout/);
    expect(code(textStyleSrc)).not.toMatch(/excalidraw|Excalidraw|DrawingLayout/);
  });
});

// ============================================================ ROOT-CAUSE REGRESSION GUARD
describe('SECTION-H3B.1 root-cause regression guard', () => {
  it('the wrapper stops click propagation exactly once, unconditionally', () => {
    const matches = code(headingSrc).match(/onClick=\{\(event\) => \{[\s\S]{0,120}?event\.stopPropagation\(\);/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('canvas viewport blank-click deselect handler still exists and is unmodified in intent', () => {
    expect(canvasClient).toContain('setSelectedPadletId(null);');
    expect(canvasClient).toContain('setSelectedPadletIds([]);');
  });
});
