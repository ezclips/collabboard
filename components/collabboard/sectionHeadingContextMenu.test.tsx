// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import SectionHeadingPost from '@/components/collabboard/canvas/ui/SectionHeadingPost';
import SectionHeadingToolbar from '@/components/collabboard/canvas/ui/SectionHeadingToolbar';
import { SectionHeadingContextMenu } from '@/components/collabboard/menus/SectionHeadingContextMenu';
import {
  SECTION_HEADING_DEFAULT_HEIGHT,
  SECTION_HEADING_DEFAULT_LEVEL,
  SECTION_HEADING_DEFAULT_TEXT,
  SECTION_HEADING_DEFAULT_WIDTH,
  SECTION_HEADING_TYPE,
  SECTION_HEADING_UNBOUNDED_WORLD,
} from '@/components/collabboard/canvas/engine/sectionHeading';
import { buildCanvasToolbarGroups } from '@/components/collabboard/canvas/ui/canvasToolbarRegistry';
import type { Padlet } from '@/types/collabboard';

/**
 * PATCH SECTION-H3B.4 -- the Section Heading right-click context menu.
 *
 * Architecture (see the RETURN report for the full audit): SectionHeadingPost
 * gains one renderer-neutral `onContextMenu(event, padletId)` prop -- it does
 * not know what a menu is, it just forwards the raw browser event, exactly
 * like `onMouseDownCapture` already does. The Freeform host
 * (FreeformPadletCards.tsx) owns the actual open/position state and renders
 * `SectionHeadingContextMenu`, a thin per-post-type wrapper (matching the
 * existing NotePostContextMenu/CommentPostContextMenu/LineContextMenu
 * pattern) built from the shared `PositionedContextMenu` primitive family --
 * the same one LineContextMenu already uses for host-positioned menus.
 * Copy/Paste/Delete/Bring to Front/Send to Back all delegate to the exact
 * same generic handlers (copyPadlet/handlePaste/requestDeletePadlet/
 * movePadletLayer) every other post type already uses.
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
const menuSrc = read('components/collabboard/menus/SectionHeadingContextMenu.tsx');
const engineSrc = read('components/collabboard/canvas/engine/sectionHeading.ts');
const cardsSrc = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
const canvasClient = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
const noteMenuSrc = read('components/collabboard/menus/NotePostContextMenu.tsx');
const commentMenuSrc = read('components/collabboard/menus/CommentPostContextMenu.tsx');
const cameraSrc = read('components/collabboard/canvas/hooks/useCanvasCamera.ts');
const drawingLayoutSrc = read('components/collabboard/canvas/layouts/DrawingLayout.tsx');

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
  const onResizePreview = vi.fn();
  const onResizeCommit = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  hosts.push(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(
    <SectionHeadingPost
      padlet={padlet}
      isSelected={overrides.isSelected ?? true}
      canEdit={overrides.canEdit ?? true}
      isDraggingThis={overrides.isDraggingThis ?? false}
      onMouseDownCapture={onMouseDownCapture}
      onCommitText={onCommitText}
      clientToWorld={(clientX, clientY) => ({ x: clientX, y: clientY })}
      worldBounds={SECTION_HEADING_UNBOUNDED_WORLD}
      onResizePreview={onResizePreview}
      onResizeCommit={onResizeCommit}
      {...overrides}
    />,
  ));
  return { host, onCommitText, onMouseDownCapture, onResizePreview, onResizeCommit };
}

/**
 * A harness reproducing the REAL end-to-end wiring: canonical mousedown
 * selection + click-bubble deselect (same as sectionHeadingSelectionPersistence
 * .test.tsx's mountWithCanonicalSelection), PLUS the host-owned context-menu
 * open/position state FreeformPadletCards.tsx actually adds in this patch.
 */
function mountWithContextMenu(padlet: Padlet) {
  const onCommitText = vi.fn();
  const onCopy = vi.fn();
  const onPaste = vi.fn();
  const onDelete = vi.fn();
  const onBringToFront = vi.fn();
  const onSendToBack = vi.fn();
  const outerClick = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  hosts.push(host);
  const root = createRoot(host);
  roots.push(root);

  function Harness({ canEdit }: { canEdit: boolean }) {
    const [selectedId, setSelectedId] = React.useState<string | null>(null);
    const [menu, setMenu] = React.useState<{ x: number; y: number } | null>(null);
    return (
      <div data-probe-viewport="true" onClick={() => { outerClick(); setSelectedId(null); }}>
        <div data-padlet-id={padlet.id}>
          <SectionHeadingPost
            padlet={padlet}
            isSelected={selectedId === padlet.id}
            canEdit={canEdit}
            isDraggingThis={false}
            onMouseDownCapture={(_event, padletId) => setSelectedId(padletId)}
            onCommitText={onCommitText}
            clientToWorld={(x, y) => ({ x, y })}
            worldBounds={SECTION_HEADING_UNBOUNDED_WORLD}
            onContextMenu={(event, padletId) => {
              // Mirrors FreeformPadletCards' handleSectionHeadingContextMenu.
              if (!canEdit) return;
              event.preventDefault();
              event.stopPropagation();
              setSelectedId(padletId);
              setMenu({ x: event.clientX, y: event.clientY });
            }}
          />
        </div>
        {menu && (
          <SectionHeadingContextMenu
            isOpen
            position={menu}
            padlet={padlet}
            onClose={() => setMenu(null)}
            onCopy={onCopy}
            onPaste={onPaste}
            onDelete={onDelete}
            onBringToFront={onBringToFront}
            onSendToBack={onSendToBack}
          />
        )}
      </div>
    );
  }

  act(() => root.render(<Harness canEdit={true} />));
  return { host, root, onCommitText, onCopy, onPaste, onDelete, onBringToFront, onSendToBack, outerClick };
}

function isSelected(host: HTMLElement): boolean {
  return host.querySelector('[data-section-heading-surface="true"]')!.className.includes('ring-2');
}

function rightClick(target: Element, opts: Partial<MouseEventInit> = {}) {
  const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 50, clientY: 60, ...opts });
  act(() => target.dispatchEvent(event));
  return event;
}

// ============================================================ REAL HOST HANDLER SOURCE [1b-4b]
// The behavioral tests above use a harness callback that MIRRORS
// FreeformPadletCards' real handleSectionHeadingContextMenu (unit-testing the
// full host in isolation is impractical -- it has hundreds of dependencies).
// These anchor directly to that real function's source so a regression in the
// production wiring itself (not just the mirrored harness logic) is caught.
describe('SECTION-H3B.4 real host handler source [1b-4b]', () => {
  function handlerBody(): string {
    const start = cardsSrc.indexOf('const handleSectionHeadingContextMenu = React.useCallback((event: React.MouseEvent, padletId: string) => {');
    const end = cardsSrc.indexOf('}, [canUseFreeformEditButton, closeAllToolbars, setSelectedPadletId]);', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    return cardsSrc.slice(start, end);
  }

  it('1b. the real handler is wired as SectionHeadingPost\'s onContextMenu prop', () => {
    expect(cardsSrc).toContain('onContextMenu={handleSectionHeadingContextMenu}');
  });

  it('2b. the real handler calls event.preventDefault()', () => {
    expect(handlerBody()).toContain('event.preventDefault();');
  });

  it('3b. the real handler calls event.stopPropagation()', () => {
    expect(handlerBody()).toContain('event.stopPropagation();');
  });

  it('4b. the real handler selects the padlet before/while opening the menu', () => {
    expect(handlerBody()).toContain('setSelectedPadletId(padletId);');
  });

  it('4c. read-only mode (!canUseFreeformEditButton) returns before preventDefault -- native menu allowed, matching NotePostContextMenu\'s disabled convention', () => {
    const body = handlerBody();
    const guardIndex = body.indexOf('if (!canUseFreeformEditButton) return;');
    const preventIndex = body.indexOf('event.preventDefault();');
    expect(guardIndex).toBeGreaterThan(-1);
    expect(preventIndex).toBeGreaterThan(guardIndex);
  });
});

// ============================================================ OPEN + SELECT [1-5]
describe('SECTION-H3B.4 context menu open + selection [1-5]', () => {
  // PositionedContextMenu renders via createPortal(..., document.body) --
  // its content is NOT a descendant of `host`, so it must be queried on
  // document.body (React portals bubble synthetic events through the OWNER
  // React tree, but the actual DOM nodes live wherever the portal targets).
  function menuRows(): HTMLElement[] {
    return Array.from(document.body.querySelectorAll<HTMLElement>('[data-positioned-menu-row="true"]'));
  }
  function menuSurface(): HTMLElement | null {
    return document.body.querySelector<HTMLElement>('[data-slot="positioned-context-menu-content"]');
  }

  it('1. context menu opens on right-click', () => {
    const { host } = mountWithContextMenu(makeHeading());
    rightClick(host.querySelector('[data-section-heading-surface="true"]')!);
    expect(menuSurface()).not.toBeNull();
  });

  it('2. native context menu is prevented', () => {
    const { host } = mountWithContextMenu(makeHeading());
    const event = rightClick(host.querySelector('[data-section-heading-surface="true"]')!);
    expect(event.defaultPrevented).toBe(true);
  });

  it('3. event propagation is stopped before reaching a React ancestor handler', () => {
    // A native addEventListener on an ancestor DOM node would fire during the
    // native bubble phase regardless of a descendant's synthetic
    // stopPropagation() (React 17+ delegates from its root container, which
    // sits below any native listener in bubble order) -- so this asserts the
    // thing SECTION-H3B.1's fix actually protects: a SECOND React onContextMenu
    // prop on an ancestor never fires once the heading's own handler stops it.
    const onCommitText = vi.fn();
    const ancestorHandler = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    hosts.push(host);
    const root = createRoot(host);
    roots.push(root);
    act(() => root.render(
      <div onContextMenu={ancestorHandler}>
        <SectionHeadingPost
          padlet={makeHeading()}
          isSelected={false}
          canEdit={true}
          isDraggingThis={false}
          onMouseDownCapture={() => {}}
          onCommitText={onCommitText}
          clientToWorld={(x, y) => ({ x, y })}
          worldBounds={SECTION_HEADING_UNBOUNDED_WORLD}
          onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }}
        />
      </div>,
    ));
    rightClick(host.querySelector('[data-section-heading-surface="true"]')!);
    expect(ancestorHandler).not.toHaveBeenCalled();
  });

  it('4. an unselected heading becomes selected on right-click', () => {
    const { host } = mountWithContextMenu(makeHeading());
    expect(isSelected(host)).toBe(false);
    rightClick(host.querySelector('[data-section-heading-surface="true"]')!);
    expect(isSelected(host)).toBe(true);
  });

  it('5. selection remains while the menu is open', () => {
    const { host } = mountWithContextMenu(makeHeading());
    rightClick(host.querySelector('[data-section-heading-surface="true"]')!);
    expect(isSelected(host)).toBe(true);
    expect(menuSurface()).not.toBeNull();
    expect(isSelected(host)).toBe(true);
  });
});

// ============================================================ MENU PRIMITIVE + LABELS [6]
describe('SECTION-H3B.4 canonical primitive reuse [6]', () => {
  it('6. the menu is built from the shared PositionedContextMenu family, not a bespoke surface', () => {
    expect(menuSrc).toContain("from '@/components/ui/context-menu'");
    expect(menuSrc).toContain('PositionedContextMenu');
    expect(menuSrc).toContain('PositionedContextMenuItem');
    expect(menuSrc).toContain('PositionedContextMenuSeparator');
    // No independent menu-surface CSS invented (no `role="menu"`/fixed-portal
    // logic reimplemented here -- that lives only in positioned-context-menu.tsx).
    expect(code(menuSrc)).not.toMatch(/createPortal|role="menu"/);
  });
});

// ============================================================ COPY [7-13]
describe('SECTION-H3B.4 Copy [7-13]', () => {
  it('7. Copy uses the generic clipboard path (copyPadlet), not a heading-specific one', () => {
    expect(cardsSrc).toMatch(/onCopy=\{\(\) => copyPadlet\(sectionHeadingContextMenu\.padletId\)\}/);
    expect(code(cardsSrc)).not.toMatch(/sectionHeadingClipboard|SectionHeadingClipboard/);
  });

  it('8. copyPadlet writes through the shared ClipboardManager (post payload, unmodified)', () => {
    expect(canvasClient).toMatch(/const copyPadlet = async[\s\S]{0,200}clipboardManager\.copy\(\[\{ type: 'post', data: padlet \}\]\)/);
  });

  it('9-13. paste construction preserves title/headingLevel/titleStyle/colors/width/height verbatim (generic spread, no field allowlist)', () => {
    const start = canvasClient.indexOf('const buildPastedPadletData = useCallback(');
    const end = canvasClient.indexOf('}, [canvasId]);', start);
    const body = canvasClient.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    // Whole-object spread carries type/title/width/height through untouched --
    // only id/timestamps/location_geog are stripped.
    expect(body).toContain('const rest = { ...sourcePadlet } as Partial<Padlet>;');
    expect(body).toContain('delete rest.id;');
    expect(body).not.toMatch(/delete rest\.title|delete rest\.width|delete rest\.height|delete rest\.type/);
    // Metadata (headingLevel/titleStyle/textColor/backgroundColor/accentColor)
    // is spread whole; only column-layout keys Section Heading never uses are
    // stripped.
    expect(body).toContain('const sourceMetadata = { ...((rest.metadata as Record<string, unknown>) || {}) } as Record<string, unknown>;');
    expect(body).not.toMatch(/delete sourceMetadata\.headingLevel|delete sourceMetadata\.titleStyle|delete sourceMetadata\.textColor|delete sourceMetadata\.backgroundColor|delete sourceMetadata\.accentColor/);
    // width/height ride through to the final rect unmodified.
    expect(body).toContain('width: sourcePadlet.width,');
    expect(body).toContain('height: sourcePadlet.height,');
  });
});

// ============================================================ PASTE [14-17]
describe('SECTION-H3B.4 Paste [14-17]', () => {
  it('14. Paste uses the generic paste path (handlePaste), not a heading-specific one', () => {
    expect(cardsSrc).toMatch(/onPaste=\{handlePaste\}/);
  });

  it('15. pasted posts get a distinct id (crypto.randomUUID), never the source id', () => {
    expect(canvasClient).toMatch(/const nextId = crypto\.randomUUID\(\);/);
    expect(canvasClient).toMatch(/buildPastedPadletData\(item\.data, nextId,/);
  });

  it('16. paste calling Copy first then Paste round-trips through the SectionHeadingContextMenu wiring', () => {
    const { host, onCopy, onPaste } = mountWithContextMenu(makeHeading());
    rightClick(host.querySelector('[data-section-heading-surface="true"]')!);
    act(() => (document.body.querySelectorAll('[data-positioned-menu-row="true"]')[0] as HTMLElement).click());
    expect(onCopy).toHaveBeenCalledTimes(1);
    rightClick(host.querySelector('[data-section-heading-surface="true"]')!);
    act(() => (document.body.querySelectorAll('[data-positioned-menu-row="true"]')[1] as HTMLElement).click());
    expect(onPaste).toHaveBeenCalledTimes(1);
  });

  it('17. Paste availability follows the established PER-POST-menu convention (unconditional item, no clipboard gate) -- matching CommentPostContextMenu, not the blank-canvas board menu', () => {
    // CommentPostContextMenu's own Paste item is unconditional today (no
    // canPasteFromClipboard check) -- the gate exists only on the blank-canvas
    // FreeformCanvasBoardMenu. Section Heading's menu is a POST menu, so it
    // follows that nearer precedent rather than inventing a third convention.
    expect(commentMenuSrc).toMatch(/handleAction\('edit\.paste'\)/);
    expect(commentMenuSrc).not.toMatch(/canPasteFromClipboard/);
    expect(cardsSrc).not.toMatch(/onPaste=\{sectionHeadingContextMenu[\s\S]{0,40}canPasteFromClipboard/);
  });
});

// ============================================================ DELETE + Z-ORDER [18-21]
describe('SECTION-H3B.4 Delete + z-order [18-21]', () => {
  it('18. Delete uses canonical requestDeletePadlet, not a direct Supabase call', () => {
    expect(cardsSrc).toMatch(/onDelete=\{\(\) => requestDeletePadlet\(sectionHeadingContextMenu\.padletId\)\}/);
    expect(code(menuSrc)).not.toMatch(/supabase|createClient/i);
  });

  it('19. Bring to Front uses the canonical movePadletLayer z-order handler', () => {
    expect(cardsSrc).toMatch(/onBringToFront=\{\(\) => movePadletLayer\(sectionHeadingContextMenu\.padletId, 'bringToFront'\)\}/);
  });

  it('20. Send to Back uses the canonical movePadletLayer z-order handler', () => {
    expect(cardsSrc).toMatch(/onSendToBack=\{\(\) => movePadletLayer\(sectionHeadingContextMenu\.padletId, 'sendToBack'\)\}/);
  });

  it('21. z-order persists through the same metadata.zIndex write path (not CSS-only)', () => {
    const start = canvasClient.indexOf('const movePadletLayer = async (id: string, action: string) => {');
    const end = canvasClient.indexOf('\n  };', start);
    const body = canvasClient.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(body).toContain('updatePostMetadataUnstamped({ postId: id, metadata: newMetadata }');
    // Send to Back has a safe floor -- never buries the heading behind the
    // world/background surface (which is not a padlet and has no zIndex here).
    expect(body).toContain("newZ = Math.max(10, minZ - 1);");
  });

  it('16 (menu row order). Copy, Paste, Delete, separator, Bring to Front, Send to Back -- in that exact order', () => {
    const { host } = mountWithContextMenu(makeHeading());
    rightClick(host.querySelector('[data-section-heading-surface="true"]')!);
    const surface = document.body.querySelector('[data-slot="positioned-context-menu-content"]')!;
    const rows = Array.from(surface.querySelectorAll('[data-positioned-menu-row="true"], [role="separator"]'))
      .map((el) => (el.getAttribute('role') === 'separator' ? '---' : el.textContent));
    expect(rows).toEqual(['Copy', 'Paste', 'Delete', '---', 'Bring to Front', 'Send to Back']);
  });
});

// ============================================================ LAYERING [22-23]
describe('SECTION-H3B.4 application-level layering [22-23]', () => {
  it('22. the formatting toolbar remains screen UI, unchanged by this patch', () => {
    expect(toolbarSrc).toContain("className=\"fixed z-[700]");
    expect(code(toolbarSrc)).not.toMatch(/onContextMenu=\{(?!isolate)/);
  });

  it('23. the context menu is application-level UI: portaled to document.body (no world/scaled ancestor), above the toolbar', () => {
    expect(menuSrc).toContain('z-[9999]');
    // No explicit `container` prop is passed, so PositionedContextMenu's own
    // default (document.body) applies -- it is never mounted inside the
    // zoomed/scaled Freeform world layer.
    expect(menuSrc).not.toMatch(/container=/);
  });
});

// ============================================================ RESIZE HANDLE + TOOLBAR RIGHT-CLICK [24-25]
describe('SECTION-H3B.4 resize handle and toolbar right-click [24-25]', () => {
  it('24. right-clicking a resize handle does not start a resize gesture', () => {
    const { host, onResizePreview, onResizeCommit } = mount(makeHeading(), { isSelected: true });
    const handle = host.querySelector('[data-section-heading-handle="right"]')!;
    act(() => handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 2, clientX: 500 })));
    act(() => handle.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 550 })));
    act(() => handle.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 2, clientX: 550 })));
    expect(onResizePreview).not.toHaveBeenCalled();
    expect(onResizeCommit).not.toHaveBeenCalled();
  });

  it('24b. the right-button guard is source-present in handleSizingStart', () => {
    expect(code(headingSrc)).toMatch(/handleSizingStart[\s\S]{0,400}if \(!canEdit \|\| !canResize \|\| event\.button === 2\) return;/);
  });

  it('25. right-clicking the toolbar (H1-H4 / Text style / Appearance) is isolated and never reaches the heading menu', () => {
    // The toolbar's pre-existing `onContextMenu={isolate}` on its own root
    // (SECTION-H2/H3B.1, untouched) already stops any right-click inside it.
    // Structurally the toolbar is also a SIBLING of the heading in the render
    // tree (FreeformPadletCards), not a descendant, so it could never reach
    // SectionHeadingPost's onContextMenu even without that guard.
    expect(toolbarSrc).toContain('onContextMenu={isolate}');
    const headingBlockStart = cardsSrc.indexOf('{rootPadlets.filter(padlet => isSectionHeading(padlet)).map(padlet => (');
    const headingBlockEnd = cardsSrc.indexOf('))}', headingBlockStart);
    const toolbarMountIndex = cardsSrc.indexOf('<SectionHeadingToolbar');
    expect(toolbarMountIndex).toBeGreaterThan(headingBlockEnd);
  });
});

// ============================================================ REGRESSION: OTHER MENUS / BLANK CANVAS [26-27]
describe('SECTION-H3B.4 no regression to other context menus [26-27]', () => {
  it('26. the blank-canvas board menu (FreeformCanvasBoardMenu) is untouched by this patch', () => {
    expect(cardsSrc).not.toMatch(/FreeformCanvasBoardMenu/);
    expect(canvasClient).toContain('canPaste={canPasteFromClipboard}');
  });

  it('27. other post-type context menus are untouched -- no shared behavior was changed to accommodate Section Heading', () => {
    expect(noteMenuSrc).not.toMatch(/SectionHeading|section-heading/);
    expect(commentMenuSrc).not.toMatch(/SectionHeading|section-heading/);
    expect(noteMenuSrc).toContain('Bring Forward');
    expect(noteMenuSrc).toContain('Send Backward');
  });
});

// ============================================================ FROZEN [28-38]
describe('SECTION-H3B.4 frozen invariants [28-38]', () => {
  it('28. H1-H4 level->height map is unchanged', () => {
    expect(engineSrc).toContain('1: 64,');
    expect(engineSrc).toContain('2: 56,');
    expect(engineSrc).toContain('3: 48,');
    expect(engineSrc).toContain('4: 40,');
  });

  it('29. square surface is unchanged (no rounded* class on the surface/accent)', () => {
    const surfaceMatch = headingSrc.match(/data-section-heading-surface="true"\s*\n\s*[\s\S]{0,400}?className=\{`([^`]*)`\}/);
    expect(surfaceMatch).not.toBeNull();
    expect(surfaceMatch![1]).not.toMatch(/rounded/);
  });

  it('30. the single shared optical text offset is unchanged', () => {
    const matches = headingSrc.match(/translateY\(-\$\{SECTION_HEADING_TEXT_OPTICAL_OFFSET_PX\}px\)/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('31. Appearance panel close (X) button is unchanged', () => {
    const appearanceSrc = read('components/collabboard/canvas/ui/SectionHeadingAppearancePanel.tsx');
    expect(appearanceSrc).toContain('title="Close"');
    expect(appearanceSrc).toContain('onClick={onClose}');
  });

  it('32. click-based selection persistence is unchanged (still exactly one stopPropagation click guard)', () => {
    const { host } = mountWithContextMenu(makeHeading());
    const surface = host.querySelector('[data-section-heading-surface="true"]')!;
    act(() => surface.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })));
    act(() => surface.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 })));
    expect(isSelected(host)).toBe(true);
    const matches = code(headingSrc).match(/onClick=\{\(event\) => \{[\s\S]{0,120}?event\.stopPropagation\(\);/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('33. inline edit (double-click) is unchanged', () => {
    const { host } = mount(makeHeading(), { isSelected: false });
    const label = host.querySelector<HTMLElement>('[data-section-heading-text="true"]')!;
    act(() => label.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    expect(host.querySelector('[data-section-heading-input="true"]')).not.toBeNull();
  });

  it('33b. right-click while editing does not commit, cancel, or disturb the draft', () => {
    const { host, onCommitText } = mount(makeHeading(), { isSelected: true });
    const label = host.querySelector<HTMLElement>('[data-section-heading-text="true"]')!;
    act(() => label.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    const input = host.querySelector<HTMLInputElement>('[data-section-heading-input="true"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(input, 'Draft in progress');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const event = rightClick(host.querySelector('[data-section-heading="true"]')!);
    // Not forwarded/prevented while editing -- native input menu is allowed.
    expect(event.defaultPrevented).toBe(false);
    expect(onCommitText).not.toHaveBeenCalled();
    expect(host.querySelector<HTMLInputElement>('[data-section-heading-input="true"]')!.value).toBe('Draft in progress');
  });

  it('34. horizontal resize math is unchanged (engine.ts untouched by this patch)', () => {
    expect(engineSrc).toContain('export function resizeSectionHeadingRightEdge(');
    expect(engineSrc).toContain('export function resizeSectionHeadingLeftEdge(');
    expect(engineSrc).not.toMatch(/ContextMenu|contextmenu|onContextMenu/i);
  });

  it('35. engine independence is preserved -- no menu/context-menu concept leaks into SectionHeadingPost or the engine', () => {
    expect(code(headingSrc)).not.toMatch(/PositionedContextMenu|ContextMenuItem|actionRegistry/);
    expect(code(engineSrc)).not.toMatch(/ContextMenu|actionRegistry/);
    // The prop itself is a plain forwarded callback, not a menu-shaped API.
    expect(headingSrc).toContain('onContextMenu?: (event: React.MouseEvent, padletId: string) => void;');
  });

  it('36. non-Freeform, non-Drawing layouts still do not expose the H tool (superseded by SECTION-H3C: Drawing itself now does)', () => {
    const FLAGS = {
      isMapLayout: false, isFreeformLayout: false, isFreeformGraphMode: false,
      isTimelineLayout: false, chronoMode: null, canManageCanvasShare: false,
      canUseFreeformEditButton: true, isDrawingLayout: false,
    };
    const types = buildCanvasToolbarGroups(FLAGS as never).flatMap((g) => g.tools.map((t) => t.type));
    expect(types).not.toContain('section-heading');
  });

  it('37. no Drawing/Excalidraw file is touched by this patch (superseded for DrawingLayout.tsx itself by SECTION-H3C)', () => {
    // The shared renderer and this Freeform-specific menu wrapper remain
    // completely Drawing-agnostic -- still true after SECTION-H3C, which
    // gave Drawing its OWN adapter/menu wiring instead of reusing these.
    expect(code(headingSrc)).not.toMatch(/excalidraw|Excalidraw|DrawingLayout/);
    expect(code(menuSrc)).not.toMatch(/excalidraw|Excalidraw|DrawingLayout/);
  });

  it('38. camera is unchanged (no Section Heading mention, ZOOM_STEP untouched)', () => {
    expect(cameraSrc).toContain('ZOOM_STEP = 0.1');
    expect(cameraSrc).not.toMatch(/section-heading|SectionHeading/);
  });
});
