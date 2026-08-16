// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import SectionHeadingPost from '@/components/collabboard/canvas/ui/SectionHeadingPost';
import SectionHeadingToolbar from '@/components/collabboard/canvas/ui/SectionHeadingToolbar';
import SectionHeadingAppearancePanel from '@/components/collabboard/canvas/ui/SectionHeadingAppearancePanel';
import {
  SECTION_HEADING_DEFAULT_HEIGHT,
  SECTION_HEADING_DEFAULT_LEVEL,
  SECTION_HEADING_DEFAULT_TEXT,
  SECTION_HEADING_DEFAULT_WIDTH,
  SECTION_HEADING_LEVEL_HEIGHT,
  SECTION_HEADING_LEVEL_TEXT_CLASS,
  SECTION_HEADING_TEXT_OPTICAL_OFFSET_PX,
  SECTION_HEADING_TYPE,
  SECTION_HEADING_UNBOUNDED_WORLD,
  getSectionHeadingHeight,
  resizeSectionHeadingRightEdge,
  type SectionHeadingLevel,
} from '@/components/collabboard/canvas/engine/sectionHeading';
import { FREEFORM_WORLD_MAX_X, FREEFORM_WORLD_MIN_X } from '@/components/collabboard/canvas/engine/freeformStageGeometry';
import { buildCanvasToolbarGroups } from '@/components/collabboard/canvas/ui/canvasToolbarRegistry';
import type { Padlet } from '@/types/collabboard';

/**
 * PATCH SECTION-H3B.3 -- visual polish: Appearance panel close X, square
 * Section Heading surface, and a single shared -2px optical text offset.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const headingSrc = read('components/collabboard/canvas/ui/SectionHeadingPost.tsx');
const toolbarSrc = read('components/collabboard/canvas/ui/SectionHeadingToolbar.tsx');
const appearanceSrc = read('components/collabboard/canvas/ui/SectionHeadingAppearancePanel.tsx');
const engineSrc = read('components/collabboard/canvas/engine/sectionHeading.ts');
const cardsSrc = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
const canvasClient = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
const cameraSrc = read('components/collabboard/canvas/hooks/useCanvasCamera.ts');
const stageSrc = read('components/collabboard/canvas/engine/freeformStageGeometry.ts');

/** The EXACT close-button convention already used 3x elsewhere (FreeformPadletCards.tsx:1645/4781/4970). */
const ESTABLISHED_CLOSE_BUTTON_CLASSNAME =
  'absolute -right-3 -top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-md transition-all hover:text-gray-600';

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

function render(element: React.ReactElement) {
  const host = document.createElement('div');
  document.body.append(host);
  hosts.push(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(element));
  return host;
}

function mount(padlet: Padlet, overrides: Partial<React.ComponentProps<typeof SectionHeadingPost>> = {}) {
  const onCommitText = vi.fn();
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
      onMouseDownCapture={vi.fn()}
      onCommitText={onCommitText}
      clientToWorld={(x, y) => ({ x, y })}
      worldBounds={{ minX: FREEFORM_WORLD_MIN_X, maxX: FREEFORM_WORLD_MAX_X }}
      {...overrides}
    />,
  ));
  return { host, onCommitText };
}

/**
 * A harness reproducing the REAL end-to-end wiring: canonical single-selection
 * state (mousedown selects, unstopped click on the viewport deselects), the
 * heading, and its toolbar -- so the Appearance X's effect on SELECTION (not
 * just the panel) is proven behaviorally, exactly like SECTION-H3B.1/H3B.2.
 */
function mountFullHarness(initial: Padlet) {
  const host = document.createElement('div');
  document.body.append(host);
  hosts.push(host);
  const root = createRoot(host);
  roots.push(root);
  const onCommitText = vi.fn();

  function Harness() {
    const [padlet, setPadlet] = React.useState<Padlet>(initial);
    const [selectedId, setSelectedId] = React.useState<string | null>(null);
    const [headingEl, setHeadingEl] = React.useState<HTMLElement | null>(null);
    const isSelected = selectedId === padlet.id;
    return (
      <div data-probe-viewport onClick={() => setSelectedId(null)}>
        <div ref={setHeadingEl} data-padlet-id={padlet.id}>
          <SectionHeadingPost
            padlet={padlet}
            isSelected={isSelected}
            canEdit={true}
            isDraggingThis={false}
            onMouseDownCapture={(_e, id) => setSelectedId(id)}
            onCommitText={(id, text) => { onCommitText(id, text); setPadlet((p) => ({ ...p, title: text } as Padlet)); }}
            clientToWorld={(x, y) => ({ x, y })}
            worldBounds={SECTION_HEADING_UNBOUNDED_WORLD}
          />
        </div>
        {isSelected && (
          <SectionHeadingToolbar
            padlet={padlet}
            headingElement={headingEl}
            viewportRevision={1}
            onChangeLevel={(id, level: SectionHeadingLevel) => setPadlet((p) => ({
              ...p,
              height: getSectionHeadingHeight(level),
              metadata: { ...(p.metadata || {}), headingLevel: level },
            } as Padlet))}
            onChangeTextStyle={() => {}}
            onChangeColor={() => {}}
          />
        )}
      </div>
    );
  }

  act(() => root.render(<Harness />));
  const selectHeading = () => {
    const root2 = host.querySelector('[data-section-heading="true"]')!;
    act(() => root2.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
    act(() => root2.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })));
    act(() => root2.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  };
  const isSelected = () => host.querySelector('[data-section-heading-surface="true"]')!.className.includes('ring-2');
  return { host, selectHeading, isSelected, onCommitText };
}

// ============================================================ APPEARANCE CLOSE BUTTON [1-7]
describe('SECTION-H3B.3 Appearance panel close button [1-7]', () => {
  it('1. Appearance X exists in source, with the established Close affordance', () => {
    expect(appearanceSrc).toContain('title="Close"');
    expect(appearanceSrc).toContain('<X className="h-3.5 w-3.5" />');
  });

  it('2. the X uses the EXACT existing close-control convention, not a new visual language', () => {
    // Byte-identical to the 3x-repeated convention in FreeformPadletCards.tsx
    // (TextStylePopup / image color picker close buttons).
    expect(cardsSrc).toContain(ESTABLISHED_CLOSE_BUTTON_CLASSNAME);
    expect(appearanceSrc).toContain(ESTABLISHED_CLOSE_BUTTON_CLASSNAME);
  });

  it('3. clicking X closes the Appearance panel only', () => {
    const onClose = vi.fn();
    const host = render(
      <SectionHeadingAppearancePanel textColor="#111111" backgroundColor="transparent" accentColor="#0f766e" onChange={vi.fn()} onClose={onClose} />,
    );
    const closeBtn = host.querySelector<HTMLButtonElement>('button[title="Close"]')!;
    act(() => closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('4. X does not deselect the heading (real end-to-end selection harness)', () => {
    const { host, selectHeading, isSelected } = mountFullHarness(makeHeading());
    selectHeading();
    expect(isSelected()).toBe(true);
    act(() => host.querySelector<HTMLElement>('[data-section-heading-appearance-trigger="true"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const closeBtn = host.querySelector<HTMLButtonElement>('[data-section-heading-panel="appearance"] button[title="Close"]')!;
    act(() => closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(isSelected()).toBe(true);
    expect(host.querySelector('[data-section-heading-panel="appearance"]')).toBeNull();
  });

  it('5/6/7. while editing: X closes Appearance, does not commit or cancel, draft text survives', () => {
    const { host, selectHeading, onCommitText } = mountFullHarness(makeHeading({ title: 'Original' }));
    selectHeading();
    const label = host.querySelector<HTMLElement>('[data-section-heading-text="true"]')!;
    act(() => label.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    const input = host.querySelector<HTMLInputElement>('[data-section-heading-input="true"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(input, 'Draft in progress');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });

    act(() => host.querySelector<HTMLElement>('[data-section-heading-appearance-trigger="true"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const closeBtn = host.querySelector<HTMLButtonElement>('[data-section-heading-panel="appearance"] button[title="Close"]')!;
    act(() => closeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    expect(host.querySelector('[data-section-heading-panel="appearance"]')).toBeNull();
    expect(onCommitText).not.toHaveBeenCalled();
    const stillInput = host.querySelector<HTMLInputElement>('[data-section-heading-input="true"]');
    expect(stillInput).not.toBeNull();
    expect(stillInput!.value).toBe('Draft in progress');
  });
});

// ============================================================ SQUARE SURFACE [8-15]
describe('SECTION-H3B.3 square Section Heading surface [8-15]', () => {
  const ROUNDED_PATTERN = /\brounded(-(none|sm|md|lg|xl|2xl|3xl|full|t|b|l|r|tl|tr|bl|br))?\b/;

  it('8-12. surface has no rounded* class on any corner, resting or selected', () => {
    const { host: resting } = mount(makeHeading());
    const { host: selected } = mount(makeHeading(), { isSelected: true });
    const restingSurface = resting.querySelector<HTMLElement>('[data-section-heading-surface="true"]')!;
    const selectedSurface = selected.querySelector<HTMLElement>('[data-section-heading-surface="true"]')!;
    expect(restingSurface.className).not.toMatch(ROUNDED_PATTERN);
    expect(selectedSurface.className).not.toMatch(ROUNDED_PATTERN);
    // Source-level: the exact JSX line that sets the surface className.
    const surfaceClassLine = /data-section-heading-surface="true"[\s\S]{0,220}className=\{`([^`]*)`\}/.exec(code(headingSrc))![1];
    expect(surfaceClassLine).not.toMatch(ROUNDED_PATTERN);
  });

  it('13. accent stripe has no rounded cap', () => {
    const { host } = mount(makeHeading());
    const accent = host.querySelector<HTMLElement>('[data-section-heading-accent="true"]')!;
    expect(accent.className).not.toMatch(ROUNDED_PATTERN);
  });

  it('14. the selection ring lives on the SAME (now radius-free) element -- no separate outline wrapper with stale radius', () => {
    const { host } = mount(makeHeading(), { isSelected: true });
    const surface = host.querySelector<HTMLElement>('[data-section-heading-surface="true"]')!;
    expect(surface.className).toContain('ring-2');
    expect(surface.className).not.toMatch(ROUNDED_PATTERN);
  });

  it('15. other post types keep their OWN radius styles -- this is scoped to Section Heading only', () => {
    // Positive control: a generic post card's rounded convention is untouched.
    expect(cardsSrc).toContain("rounded-lg shadow-xl border border-gray-200");
  });

  it('Phase 8: resize handles keep their existing pill/hit-target treatment -- not squared merely because the surface is', () => {
    expect(headingSrc).toContain('className="rounded-full border border-white bg-blue-500 shadow-sm"');
  });
});

// ============================================================ OPTICAL TEXT OFFSET [16-23]
describe('SECTION-H3B.3 optical text offset [16-23]', () => {
  it('16. exactly one optical-offset application exists', () => {
    const matches = code(headingSrc).match(/transform:\s*`translateY\(-\$\{SECTION_HEADING_TEXT_OPTICAL_OFFSET_PX\}px\)`/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('17. the offset is 2px (upward)', () => {
    expect(SECTION_HEADING_TEXT_OPTICAL_OFFSET_PX).toBe(2);
    expect(SECTION_HEADING_TEXT_OPTICAL_OFFSET_PX).toBeLessThanOrEqual(3);
  });

  it('18. no per-level offset map exists -- one shared constant only', () => {
    expect(engineSrc).toContain('export const SECTION_HEADING_TEXT_OPTICAL_OFFSET_PX = 2;');
    // Nothing keys the offset by level.
    expect(code(engineSrc)).not.toMatch(/OPTICAL_OFFSET[\s\S]{0,40}Record<SectionHeadingLevel/);
    expect(code(headingSrc)).not.toMatch(/OPTICAL_OFFSET[\s\S]{0,10}\[level\]/);
  });

  const TAILWIND_LINE_HEIGHT_PX: Record<string, number> = {
    'text-2xl': 32, 'text-xl': 28, 'text-lg': 28, 'text-base': 24,
  };

  it.each(Object.entries(SECTION_HEADING_LEVEL_HEIGHT).map(([l]) => Number(l)) as SectionHeadingLevel[])(
    '19-22. H%i text (with the -2px offset applied) is not clipped', (level) => {
      const textClass = SECTION_HEADING_LEVEL_TEXT_CLASS[level].split(' ')[0];
      const lineHeight = TAILWIND_LINE_HEIGHT_PX[textClass];
      const height = SECTION_HEADING_LEVEL_HEIGHT[level];
      const topMargin = (height - lineHeight) / 2;
      // The offset must not consume more than the available top margin --
      // i.e. it must not push the line box above the surface's top edge.
      expect(SECTION_HEADING_TEXT_OPTICAL_OFFSET_PX).toBeLessThan(topMargin);
    },
  );

  it('23. resting text and the editing input are BOTH children of the SAME offset wrapper (no alignment jump)', () => {
    const src = code(headingSrc);
    const wrapperStart = src.indexOf('style={{ transform: `translateY(-${SECTION_HEADING_TEXT_OPTICAL_OFFSET_PX}px)` }}');
    // Both the editing branch (input) and resting branch (button) must appear
    // AFTER the offset wrapper opens and BEFORE the next sibling section (the
    // resize handles, real code -- not a comment marker, so it survives code()).
    const handlesIdx = src.indexOf("{showHandles && renderHandle('left')}", wrapperStart);
    const inputIdx = src.indexOf('data-section-heading-input="true"', wrapperStart);
    const textIdx = src.indexOf('data-section-heading-text="true"', wrapperStart);
    expect(wrapperStart).toBeGreaterThan(-1);
    expect(handlesIdx).toBeGreaterThan(-1);
    expect(inputIdx).toBeGreaterThan(wrapperStart);
    expect(inputIdx).toBeLessThan(handlesIdx);
    expect(textIdx).toBeGreaterThan(wrapperStart);
    expect(textIdx).toBeLessThan(handlesIdx);

    // Behavioral: mounting in each state, the rendered node's parentElement
    // carries the offset transform style.
    const { host: restingHost } = mount(makeHeading());
    const restingParent = restingHost.querySelector('[data-section-heading-text="true"]')!.parentElement as HTMLElement;
    expect(restingParent.style.transform).toBe('translateY(-2px)');

    const { host: editHost } = mount(makeHeading());
    const label = editHost.querySelector<HTMLElement>('[data-section-heading-text="true"]')!;
    act(() => label.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    const editParent = editHost.querySelector('[data-section-heading-input="true"]')!.parentElement as HTMLElement;
    expect(editParent.style.transform).toBe('translateY(-2px)');
  });

  it('Phase 13: horizontal text inset (px-3) is unchanged -- only vertical alignment was adjusted', () => {
    const { host } = mount(makeHeading());
    const wrapper = host.querySelector('[data-section-heading-text="true"]')!.parentElement as HTMLElement;
    expect(wrapper.className).toContain('px-3');
  });

  it('typography classes are unchanged by this patch (no font size was altered)', () => {
    expect(engineSrc).toContain("1: 'text-2xl font-bold',");
    expect(engineSrc).toContain("2: 'text-xl font-semibold',");
    expect(engineSrc).toContain("3: 'text-lg font-semibold',");
    expect(engineSrc).toContain("4: 'text-base font-medium',");
  });
});

// ============================================================ FROZEN [24-37]
describe('SECTION-H3B.3 frozen invariants [24-37]', () => {
  it('24. H1 remains 64', () => expect(SECTION_HEADING_LEVEL_HEIGHT[1]).toBe(64));
  it('25. H2 remains 56', () => expect(SECTION_HEADING_LEVEL_HEIGHT[2]).toBe(56));
  it('26. H3 remains 48', () => expect(SECTION_HEADING_LEVEL_HEIGHT[3]).toBe(48));
  it('27. H4 remains 40', () => expect(SECTION_HEADING_LEVEL_HEIGHT[4]).toBe(40));

  it('28. width is untouched by this patch (no new width-writing code)', () => {
    expect(code(headingSrc)).not.toMatch(/width:\s*width\s*[-+]/);
    expect(canvasClient).toContain('const width = SECTION_HEADING_DEFAULT_WIDTH;');
  });

  it('29. horizontal resize math is byte-unchanged (golden value)', () => {
    const rect = resizeSectionHeadingRightEdge({ rect: { x: 100, width: 500 }, pointerWorldX: 0 }, 300, { minX: FREEFORM_WORLD_MIN_X, maxX: FREEFORM_WORLD_MAX_X });
    expect(rect).toEqual({ x: 100, width: 800 });
  });

  it('30. selection persistence (SECTION-H3B.1) is unchanged: exactly one click-stopPropagation', () => {
    const matches = code(headingSrc).match(/onClick=\{\(event\) => \{[\s\S]{0,120}?event\.stopPropagation\(\);/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('31. inline edit entry points are unchanged', () => {
    expect(headingSrc).toContain("onDoubleClick={() => { if (canEdit) setIsEditing(true); }}");
    expect(headingSrc).toContain("event.key === 'F2'");
    expect(headingSrc).toContain("if (event.key === 'Enter') { event.preventDefault(); commit(); }");
    expect(headingSrc).toContain("else if (event.key === 'Escape') { event.preventDefault(); cancel(); }");
  });

  it('32. Text/style panel remains LEFT', () => {
    expect(toolbarSrc).toContain('<div data-section-heading-panel="text" className="absolute right-full top-0 mr-3">');
  });

  it('33. Appearance remains RIGHT', () => {
    expect(toolbarSrc).toContain('<div data-section-heading-panel="appearance" className="absolute left-full top-0 ml-3">');
  });

  it('34. palette is unchanged (still the shared SIMPLE_PALETTE + transparent, no redesign)', () => {
    const simple = read('components/collabboard/ColorPicker.tsx');
    const shared = /const SIMPLE_PALETTE = \[([\s\S]*?)\];/.exec(simple)![1].replace(/\s|'/g, '');
    const mine = /const BACKGROUND_PRESETS = \[([\s\S]*?)\];/.exec(appearanceSrc)![1].replace(/\s|'/g, '').replace(/,$/, '');
    expect(mine).toBe(`transparent,${shared.replace(/,$/, '')}`);
  });

  it('35. Drawing still does not expose the H tool', () => {
    const FLAGS = {
      isMapLayout: false, isFreeformLayout: false, isFreeformGraphMode: false,
      isTimelineLayout: false, chronoMode: null, canManageCanvasShare: false,
      canUseFreeformEditButton: true,
    };
    const types = buildCanvasToolbarGroups(FLAGS as never).flatMap((g) => g.tools.map((t) => t.type));
    expect(types).not.toContain('section-heading');
  });

  it('36. no Drawing/Excalidraw file is touched by this patch', () => {
    expect(code(headingSrc)).not.toMatch(/excalidraw|Excalidraw|DrawingLayout/);
    expect(code(toolbarSrc)).not.toMatch(/excalidraw|Excalidraw|DrawingLayout/);
    expect(code(appearanceSrc)).not.toMatch(/excalidraw|Excalidraw|DrawingLayout/);
  });

  it('37. camera is untouched', () => {
    expect(cameraSrc).not.toMatch(/section_heading|SectionHeading/);
    expect(cameraSrc).toContain('const ZOOM_STEP = 0.1;');
    expect(stageSrc).not.toMatch(/section_heading|SectionHeading/);
  });
});
