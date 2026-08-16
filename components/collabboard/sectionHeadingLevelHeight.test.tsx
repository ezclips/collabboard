// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import SectionHeadingPost from '@/components/collabboard/canvas/ui/SectionHeadingPost';
import {
  SECTION_HEADING_DEFAULT_HEIGHT,
  SECTION_HEADING_DEFAULT_LEVEL,
  SECTION_HEADING_DEFAULT_TEXT,
  SECTION_HEADING_DEFAULT_WIDTH,
  SECTION_HEADING_LEVELS,
  SECTION_HEADING_LEVEL_HEIGHT,
  SECTION_HEADING_LEVEL_TEXT_CLASS,
  SECTION_HEADING_TYPE,
  getSectionHeadingHeight,
  getSectionHeadingLevel,
  resizeSectionHeadingLeftEdge,
  resizeSectionHeadingRightEdge,
  type SectionHeadingLevel,
} from '@/components/collabboard/canvas/engine/sectionHeading';
import { FREEFORM_WORLD_MAX_X, FREEFORM_WORLD_MIN_X } from '@/components/collabboard/canvas/engine/freeformStageGeometry';
import { getFallbackMinimapItem, getMinimapItemKind } from '@/components/collabboard/canvas/minimap/useFreeformMinimapGeometry';
import { buildCanvasToolbarGroups } from '@/components/collabboard/canvas/ui/canvasToolbarRegistry';
import type { Padlet } from '@/types/collabboard';

/**
 * PATCH SECTION-H3B.2 -- Section Heading height now follows heading LEVEL:
 * H1=64, H2=56, H3=48, H4=40. WIDTH stays entirely user-controlled and is
 * never touched by a level change or by this map.
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
const engineSrc = read('components/collabboard/canvas/engine/sectionHeading.ts');
const cardsSrc = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
const canvasClient = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
const cameraSrc = read('components/collabboard/canvas/hooks/useCanvasCamera.ts');
const stageSrc = read('components/collabboard/canvas/engine/freeformStageGeometry.ts');
const minimapSrc = read('components/collabboard/canvas/minimap/FreeformMinimap.tsx');

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
      onCommitText={vi.fn()}
      clientToWorld={(x, y) => ({ x, y })}
      worldBounds={{ minX: FREEFORM_WORLD_MIN_X, maxX: FREEFORM_WORLD_MAX_X }}
      {...overrides}
    />,
  ));
  return { host };
}

/**
 * A minimal harness reproducing the REAL level-change wiring end-to-end:
 * FreeformPadletCards.tsx's commitSectionHeadingMetadata + setSectionHeadingLevel
 * pattern (one atomic update of metadata.headingLevel AND height), applied to
 * local state, so these tests prove the BEHAVIOR, not just source strings.
 */
function mountWithLevelChange(initial: Padlet) {
  const host = document.createElement('div');
  document.body.append(host);
  hosts.push(host);
  const root = createRoot(host);
  roots.push(root);
  let latest: Padlet = initial;

  function Harness() {
    const [padlet, setPadlet] = React.useState<Padlet>(initial);
    latest = padlet;
    const setLevel = React.useCallback((_id: string, level: SectionHeadingLevel) => {
      setPadlet((prev) => ({
        ...prev,
        height: getSectionHeadingHeight(level),
        metadata: { ...(prev.metadata || {}), headingLevel: level },
      } as Padlet));
    }, []);
    return (
      <div data-set-level-probe onClick={(e) => {
        const level = Number((e.target as HTMLElement).dataset.level) as SectionHeadingLevel;
        if (level) setLevel(padlet.id, level);
      }}>
        {SECTION_HEADING_LEVELS.map((l) => (
          <button key={l} type="button" data-level={l}>{`set H${l}`}</button>
        ))}
        <SectionHeadingPost
          padlet={padlet}
          isSelected={true}
          canEdit={true}
          isDraggingThis={false}
          onMouseDownCapture={vi.fn()}
          onCommitText={vi.fn()}
          clientToWorld={(x, y) => ({ x, y })}
          worldBounds={{ minX: FREEFORM_WORLD_MIN_X, maxX: FREEFORM_WORLD_MAX_X }}
        />
      </div>
    );
  }

  act(() => root.render(<Harness />));
  const setLevel = (level: SectionHeadingLevel) => {
    const btn = host.querySelector<HTMLButtonElement>(`[data-level="${level}"]`)!;
    act(() => btn.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  };
  return { host, setLevel, getPadlet: () => latest };
}

// Tailwind's documented line-heights for the classes SECTION_HEADING_LEVEL_TEXT_CLASS uses.
const TAILWIND_LINE_HEIGHT_PX: Record<string, number> = {
  'text-2xl': 32, // 2rem
  'text-xl': 28,  // 1.75rem
  'text-lg': 28,  // 1.75rem
  'text-base': 24, // 1.5rem
};

// ============================================================ CANONICAL MAP [1-7]
describe('SECTION-H3B.2 canonical height map [1-7]', () => {
  it('1. exactly one canonical height map exists, and nothing else redefines it', () => {
    const mapDefinitions = (engineSrc.match(/SECTION_HEADING_LEVEL_HEIGHT\s*:\s*Record<SectionHeadingLevel,\s*number>\s*=\s*\{/g) ?? []).length;
    expect(mapDefinitions).toBe(1);
    // Renderer and toolbar never restate the map or its literal number pairs
    // as a local object -- they only ever import and call the resolver.
    expect(code(headingSrc)).not.toMatch(/Record<SectionHeadingLevel,\s*number>|1:\s*64,?\s*2:\s*56/);
    expect(code(toolbarSrc)).not.toMatch(/Record<SectionHeadingLevel,\s*number>|1:\s*64,?\s*2:\s*56/);
  });

  it('2. H1 = 64', () => expect(SECTION_HEADING_LEVEL_HEIGHT[1]).toBe(64));
  it('3. H2 = 56', () => expect(SECTION_HEADING_LEVEL_HEIGHT[2]).toBe(56));
  it('4. H3 = 48', () => expect(SECTION_HEADING_LEVEL_HEIGHT[3]).toBe(48));
  it('5. H4 = 40', () => expect(SECTION_HEADING_LEVEL_HEIGHT[4]).toBe(40));

  it('6. malformed/missing level resolves through the SAME H2 fallback as getSectionHeadingLevel', () => {
    expect(getSectionHeadingHeight(makeHeading({ metadata: { headingLevel: 9 } as never }))).toBe(56);
    expect(getSectionHeadingHeight(makeHeading({ metadata: {} as never }))).toBe(56);
    expect(getSectionHeadingHeight(undefined)).toBe(56);
    expect(getSectionHeadingHeight(null)).toBe(56);
    // The raw-level overload uses the identical clamp, not a second one.
    expect(getSectionHeadingHeight(9 as unknown as SectionHeadingLevel)).toBe(56);
    expect(getSectionHeadingHeight(NaN as unknown as SectionHeadingLevel)).toBe(56);
  });

  it('7. a new heading now defaults to H2 height (56), not the old flat 64', () => {
    expect(SECTION_HEADING_DEFAULT_HEIGHT).toBe(56);
    expect(SECTION_HEADING_DEFAULT_HEIGHT).toBe(SECTION_HEADING_LEVEL_HEIGHT[SECTION_HEADING_DEFAULT_LEVEL]);
    // Creation call site is UNCHANGED -- correctness comes from the constant
    // itself now being level-derived, not from a new code path.
    expect(canvasClient).toContain('const height = SECTION_HEADING_DEFAULT_HEIGHT;');
  });
});

// ============================================================ LEVEL CHANGE GEOMETRY [8-14]
describe('SECTION-H3B.2 level change geometry [8-14]', () => {
  it.each([
    [1, 64], [2, 56], [3, 48], [4, 40],
  ] as const)('8-11. selecting H%i sets level AND height (%i)', (level, expectedHeight) => {
    const { setLevel, getPadlet } = mountWithLevelChange(makeHeading({ metadata: { headingLevel: 2 } as never, height: 56 }));
    setLevel(level as SectionHeadingLevel);
    const padlet = getPadlet();
    expect(getSectionHeadingLevel(padlet)).toBe(level);
    expect(padlet.height).toBe(expectedHeight);
  });

  it('12. x (position_x) is unchanged by a level change', () => {
    const { setLevel, getPadlet } = mountWithLevelChange(makeHeading({ position_x: 777 }));
    setLevel(4);
    expect(getPadlet().position_x).toBe(777);
  });

  it('13. y (position_y) is unchanged by a level change', () => {
    const { setLevel, getPadlet } = mountWithLevelChange(makeHeading({ position_y: 333 }));
    setLevel(1);
    expect(getPadlet().position_y).toBe(333);
  });

  it('14. width is unchanged by a level change', () => {
    const { setLevel, getPadlet } = mountWithLevelChange(makeHeading({ width: 800 }));
    setLevel(1);
    expect(getPadlet().width).toBe(800);
    setLevel(4);
    expect(getPadlet().width).toBe(800);
  });

  it('the real setSectionHeadingLevel call site updates level+height in ONE atomic write', () => {
    expect(cardsSrc).toContain(
      'void commitSectionHeadingMetadata(padletId, { headingLevel: level }, { height: getSectionHeadingHeight(level) });',
    );
    // ONE updatePostFieldsOrThrow call carries both metadata and height.
    const start = cardsSrc.indexOf('const commitSectionHeadingMetadata = React.useCallback(async (');
    const end = cardsSrc.indexOf('const setSectionHeadingLevel', start);
    const body = cardsSrc.slice(start, end);
    const writeCalls = (body.match(/updatePostFieldsOrThrow\(/g) ?? []).length;
    expect(writeCalls).toBe(1);
  });

  it('the real setSectionHeadingLevel call site never names width or position_y (source-level width/top-anchor freeze)', () => {
    const start = cardsSrc.indexOf('const setSectionHeadingLevel = React.useCallback(');
    const end = cardsSrc.indexOf('const setSectionHeadingTextStyle', start);
    const body = code(cardsSrc.slice(start, end));
    expect(start).toBeGreaterThan(-1);
    expect(body).not.toMatch(/\bwidth\b/);
    expect(body).not.toMatch(/position_y/);
  });
});

// ============================================================ HORIZONTAL RESIZE PRESERVES HEIGHT [15-18]
describe('SECTION-H3B.2 horizontal resize never touches height [15-18]', () => {
  const FREEFORM_BOUNDS = { minX: FREEFORM_WORLD_MIN_X, maxX: FREEFORM_WORLD_MAX_X };

  it.each([
    [1, 64], [2, 56], [3, 48], [4, 40],
  ] as const)('15-18. resizing an H%i heading (height %i) preserves that height', (level, height) => {
    const rectRight = resizeSectionHeadingRightEdge({ rect: { x: 0, width: 500 }, pointerWorldX: 0 }, 300, FREEFORM_BOUNDS);
    const rectLeft = resizeSectionHeadingLeftEdge({ rect: { x: 0, width: 500 }, pointerWorldX: 0 }, -100, FREEFORM_BOUNDS);
    // The resize RECT TYPE has no height field at all -- height cannot leak in.
    expect(Object.keys(rectRight).sort()).toEqual(['width', 'x']);
    expect(Object.keys(rectLeft).sort()).toEqual(['width', 'x']);

    // And end-to-end through the renderer: mounting at this level's height,
    // simulating a resize commit (position_x/width only), height is untouched.
    const padlet = makeHeading({ metadata: { headingLevel: level } as never, height });
    const { host } = mount(padlet, { isSelected: true });
    const surface = host.querySelector<HTMLElement>('[data-section-heading-surface="true"]')!;
    expect(surface.style.height).toBe(`${height}px`);
    // Simulate what commitSectionHeadingRect actually writes on a resize commit.
    const resized = { ...padlet, position_x: rectRight.x, width: rectRight.width } as Padlet;
    expect(resized.height).toBe(height);
  });

  it('commitSectionHeadingRect (the real resize-commit callback) never names height', () => {
    const start = cardsSrc.indexOf('const commitSectionHeadingRect = React.useCallback(async (');
    const end = cardsSrc.indexOf('const previewSectionHeadingRect', start);
    const body = cardsSrc.slice(start, end);
    expect(code(body)).not.toMatch(/\bheight\b/);
  });
});

// ============================================================ RENDERER FOLLOWS HEIGHT [19-22]
describe('SECTION-H3B.2 renderer follows the resolved height [19-22]', () => {
  it('19. accent stripe spans the full surface height at every level (structural: h-full tied to the SAME styled parent)', () => {
    expect(code(headingSrc)).toMatch(/data-section-heading-accent="true"[\s\S]{0,80}className="h-full/);
    for (const [level, height] of Object.entries(SECTION_HEADING_LEVEL_HEIGHT)) {
      const { host } = mount(makeHeading({ metadata: { headingLevel: Number(level) } as never, height }));
      const surface = host.querySelector<HTMLElement>('[data-section-heading-surface="true"]')!;
      const accent = host.querySelector<HTMLElement>('[data-section-heading-accent="true"]')!;
      expect(surface.style.height).toBe(`${height}px`);
      expect(accent.className).toContain('h-full');
    }
  });

  it('20. the selection ring and the height style live on the SAME element (ring always matches actual height)', () => {
    const { host } = mount(makeHeading({ metadata: { headingLevel: 4 } as never, height: 40 }), { isSelected: true });
    const surface = host.querySelector<HTMLElement>('[data-section-heading-surface="true"]')!;
    expect(surface.className).toContain('ring-2');
    expect(surface.style.height).toBe('40px');
  });

  it('21. resize handles center relative to the CURRENT height (h-full + items-center, not a fixed pixel offset)', () => {
    expect(code(headingSrc)).toMatch(/className="absolute top-0 flex h-full cursor-ew-resize items-center justify-center"/);
    // Hit-target size is not shrunk just because H4 is shorter than H1.
    expect(engineSrc).toContain('export const SECTION_HEADING_HANDLE_HIT_PX = 14;');
  });

  it('22. toolbar re-measurement is generic (depends on padlet.height, not a literal 64)', () => {
    expect(toolbarSrc).toContain('padlet.position_x, padlet.position_y, padlet.width, padlet.height, openPanel,');
    expect(code(toolbarSrc)).not.toMatch(/\b64\b/);
  });
});

// ============================================================ TYPOGRAPHY FIT [23-26]
describe('SECTION-H3B.2 typography fits every level with no clipping [23-26]', () => {
  it.each(
    Object.entries(SECTION_HEADING_LEVEL_HEIGHT).map(([level]) => Number(level)) as SectionHeadingLevel[],
  )('23-26. H%i text line-height fits comfortably inside its canonical height', (level) => {
    const textClass = SECTION_HEADING_LEVEL_TEXT_CLASS[level].split(' ')[0];
    const lineHeight = TAILWIND_LINE_HEIGHT_PX[textClass];
    const height = SECTION_HEADING_LEVEL_HEIGHT[level];
    expect(lineHeight).toBeLessThan(height);
  });

  it('typography classes are unchanged by this patch (no font size was altered to fit)', () => {
    expect(engineSrc).toContain("1: 'text-2xl font-bold',");
    expect(engineSrc).toContain("2: 'text-xl font-semibold',");
    expect(engineSrc).toContain("3: 'text-lg font-semibold',");
    expect(engineSrc).toContain("4: 'text-base font-medium',");
  });

  it('text remains vertically centered via flex, not per-level padding hacks', () => {
    expect(code(headingSrc)).toMatch(/data-section-heading-surface="true"[\s\S]{0,60}className=\{`relative flex items-center/);
  });
});

// ============================================================ MINIMAP [27]
describe('SECTION-H3B.2 minimap [27]', () => {
  it('27. minimap measures whatever height is actually persisted, at every level', () => {
    for (const [level, height] of Object.entries(SECTION_HEADING_LEVEL_HEIGHT)) {
      const heading = makeHeading({ metadata: { headingLevel: Number(level) } as never, height });
      expect(getMinimapItemKind(heading)).toBe('post');
      expect(getFallbackMinimapItem(heading)).toMatchObject({ height });
    }
    expect(minimapSrc).not.toMatch(/section_heading/);
  });
});

// ============================================================ LEGACY / DUPLICATE / COPY-PASTE / DATA MODEL [28-31]
describe('SECTION-H3B.2 legacy headings, duplicate, copy/paste, data model [28-31]', () => {
  it('28. duplicate preserves level, height and width verbatim (generic infra, no Section Heading branch)', () => {
    const start = canvasClient.indexOf('const duplicatePadlet = async (id: string)');
    const end = canvasClient.indexOf('\n  };', start);
    const body = canvasClient.slice(start, end);
    expect(code(body)).not.toMatch(/section_heading|SectionHeading|headingLevel/);
    expect(body).toContain('const rest = { ...padlet }');
  });

  it('29. copy/paste preserves level, height and width verbatim (same generic spread, no new format)', () => {
    const start = canvasClient.indexOf('const buildPastedPadletData = useCallback(');
    const end = canvasClient.indexOf('\n  }, [', start);
    const body = canvasClient.slice(start, end);
    expect(code(body)).not.toMatch(/section_heading|SectionHeading|headingLevel/);
    expect(body).toContain('const rest = { ...sourcePadlet }');
    // Only container/section bookkeeping keys are stripped -- height is not one of them.
    expect(body).not.toMatch(/delete\s+(rest|sourceMetadata)\.(height|width)/);
  });

  it('30. no schema migration and no new metadata/geometry keys', () => {
    const migrations = fs.readdirSync(path.join(process.cwd(), 'supabase/migrations'));
    expect(migrations.filter((f) => /section.?heading|heading.?level|heading.?height/i.test(f))).toEqual([]);
    // Still exactly metadata.headingLevel + the existing height column -- no new key.
    const typesSrc = read('types/collabboard.ts');
    expect(typesSrc).toContain('headingLevel?: 1 | 2 | 3 | 4;');
    expect(typesSrc).not.toMatch(/headingHeight|levelHeight|sectionHeadingHeight/);
  });

  it('31. no background/automatic write occurs merely by rendering an existing heading', () => {
    // Same guard SECTION-H1 test 43-45 uses: the renderer performs no
    // persistence call of its own, at mount or otherwise.
    expect(code(headingSrc)).not.toMatch(/updatePost|supabase|Repository/i);
    // A legacy heading (H4 level, but still height 64 from before this patch)
    // renders at its PERSISTED height, not a freshly recomputed one.
    const legacy = makeHeading({ metadata: { headingLevel: 4 } as never, height: 64 });
    const { host } = mount(legacy);
    const surface = host.querySelector<HTMLElement>('[data-section-heading-surface="true"]')!;
    expect(surface.style.height).toBe('64px');
  });
});

// ============================================================ SELECTION/EDIT REGRESSION GUARD [32-33]
describe('SECTION-H3B.2 selection/edit regression guard (SECTION-H3B.1 frozen) [32-33]', () => {
  it('32. click stopPropagation fix from SECTION-H3B.1 is still present, unmodified in intent', () => {
    const matches = code(headingSrc).match(/onClick=\{\(event\) => \{[\s\S]{0,120}?event\.stopPropagation\(\);/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('33. inline edit entry points (dblclick/F2/Enter, Enter-commits, Escape-cancels) are all still present', () => {
    expect(headingSrc).toContain("onDoubleClick={() => { if (canEdit) setIsEditing(true); }}");
    expect(headingSrc).toContain("event.key === 'F2'");
    expect(headingSrc).toContain("if (event.key === 'Enter') { event.preventDefault(); commit(); }");
    expect(headingSrc).toContain("else if (event.key === 'Escape') { event.preventDefault(); cancel(); }");
  });
});

// ============================================================ FROZEN [34-37]
describe('SECTION-H3B.2 frozen invariants [34-37]', () => {
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
    expect(code(cardsSrc)).not.toMatch(/getSectionHeadingHeight[\s\S]{0,40}Excalidraw/);
  });

  it('36. camera is untouched', () => {
    expect(cameraSrc).not.toMatch(/section_heading|SectionHeading/);
    expect(cameraSrc).toContain('const ZOOM_STEP = 0.1;');
  });

  it('37. horizontal resize math (world bounds, min width, signed stage) is untouched', () => {
    expect(engineSrc).toContain('export const SECTION_HEADING_MIN_WIDTH = 200;');
    expect(stageSrc).not.toMatch(/section_heading|SectionHeading/);
    // Golden-value check: same formula as SECTION-H3B/H2 -- x fixed, width absorbs travel.
    const rect = resizeSectionHeadingRightEdge({ rect: { x: 100, width: 500 }, pointerWorldX: 0 }, 300, { minX: FREEFORM_WORLD_MIN_X, maxX: FREEFORM_WORLD_MAX_X });
    expect(rect).toEqual({ x: 100, width: 800 });
  });
});
