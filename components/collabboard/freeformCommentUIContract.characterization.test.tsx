// PATCH 8A -- COMMENT UI CONTRACT v1 (characterization / freeze only).
//
// FreeformPadletCards.tsx is not mounted directly in this suite: per the
// established convention documented in freeformDocumentPersistence.
// integration.test.tsx, it is a 300KB+ monolith requiring
// CanvasEditorContext/CanvasConfigContext and dozens of unrelated
// action-map callbacks that have nothing to do with comment behavior.
// This file instead freezes CURRENT behavior via source-level assertions,
// the same technique already used against this exact file by
// CardPreview.test.tsx, documentCardPreview.behavior.test.tsx,
// EmojiReactionPicker.test.tsx, and freeformCanvasBoardMenu.
// characterization.test.tsx.
//
// IMPORTANT CORRECTION TO THE PRIOR AUDIT: this file contains SIX inline
// comment-panel implementations, not five. The previously reported "5" only
// counted the 5 sites using `dangerouslySetInnerHTML` for the read-only
// comment text. A 6th exists for the generic post-type fallback (Note,
// Drawing, AI-component, and any type not specifically branched above it)
// -- it renders comment text as plain `{c.text}` (no HTML interpretation
// at all, so no link rendering, and immune-by-accident to the same-tab-
// navigation issue the other 5 had). See COMMENT_UI_CONTRACT_V1.md.
//
// Sites, by unique anchor string:
//   A = image padlet, badge-triggered popup (toolbar closed)
//   B = card/clipart padlet, badge-triggered popup (toolbar closed)
//   C = standalone "comment" padlet, collapsed pin marker popup
//   D = image padlet, toolbar-triggered popup (activeImageToolbarPadlet)
//   E = card/clipart padlet, toolbar-triggered popup (activeCardToolbarPadlet)
//   F = generic fallback (note/drawing/ai-component/...), badge-triggered popup
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const FREEFORM_PATH = 'components/collabboard/canvas/ui/FreeformPadletCards.tsx';

function readFreeform(): string {
  return fs.readFileSync(FREEFORM_PATH, 'utf8');
}

const ANCHORS = {
  A: 'Image Comments Popup - Right side',
  B: 'Card Comments Popup - Right side',
  C: 'Custom pin shape with number inside',
  D: 'activeImageToolbarPadlet && cardCommentPopupPadletId === activeImageToolbarPadlet.id',
  E: '{/* Comment panel */}',
  F: '{/* Comment Badge - yellow indicator with count */}',
} as const;

// Slices from a start anchor forward through a sequence of markers found in
// order after it -- robust to the exact byte-length of each site (which
// differs slightly) without needing hand-tuned char windows. Because
// `indexOf(marker, fromIndex)` always resumes searching from where the last
// marker ended, this reliably captures THIS site's own occurrence of a
// marker even when that marker text is byte-identical across all 6 sites.
function sliceThrough(src: string, startAnchor: string, ...markersInOrder: string[]): string {
  const start = src.indexOf(startAnchor);
  if (start === -1) throw new Error(`start anchor not found: ${startAnchor}`);
  let end = start;
  for (const marker of markersInOrder) {
    const idx = src.indexOf(marker, end);
    if (idx === -1) throw new Error(`marker not found after anchor "${startAnchor}": ${marker}`);
    end = idx + marker.length;
  }
  return src.slice(start, end);
}

function titlesInOrder(block: string): string[] {
  return Array.from(block.matchAll(/title="([^"]+)"/g)).map((m) => m[1]);
}

// Each site's color-popup TextStylePopup block renders textually BEFORE its
// own comment-list/badge anchor in source order (all 4 popups precede their
// list). Widening the window backward from the anchor captures it reliably.
function windowAround(src: string, anchor: string, before: number, after: number): string {
  const idx = src.indexOf(anchor);
  if (idx === -1) throw new Error(`anchor not found: ${anchor}`);
  return src.slice(Math.max(0, idx - before), idx + after);
}

describe('COMMENT UI CONTRACT v1 -- site inventory', () => {
  it('all 6 anchors are present exactly once (guards against the block moving or being deduplicated silently)', () => {
    const src = readFreeform();
    for (const [site, anchor] of Object.entries(ANCHORS)) {
      const count = src.split(anchor).length - 1;
      expect(count, `anchor for site ${site} should appear exactly once: "${anchor}"`).toBe(1);
    }
  });

  it('exactly 5 sites render comment text via dangerouslySetInnerHTML+DOMPurify; site F does not', () => {
    const src = readFreeform();
    const count = (src.match(/dangerouslySetInnerHTML=\{\{ __html: DOMPurify\.sanitize\((c|comment)\.text\) \}\}/g) || []).length;
    expect(count).toBe(5);
  });
});

describe('COMMENT UI CONTRACT v1 -- action cluster (order, count, icon identity)', () => {
  // Only site B (card/clipart, expanded/badge-triggered view) uses Edit2.
  // Every other site -- including E, the SAME post type's toolbar-collapsed
  // view -- still uses PenTool. This is pre-existing icon drift WITHIN a
  // single post type's own two comment panels, not just across post types.
  it('site B uses Edit2 for the Edit action; every other site (A, C, D, E, F) still uses PenTool (pre-existing icon drift, not touched)', () => {
    const src = readFreeform();
    const penToolSites: Array<keyof typeof ANCHORS> = ['A', 'C', 'D', 'E', 'F'];
    const edit2Sites: Array<keyof typeof ANCHORS> = ['B'];

    for (const site of penToolSites) {
      const block = sliceThrough(src, ANCHORS[site], 'title="Edit"', '</button>');
      expect(block, `site ${site} Edit icon`).toContain('<PenTool');
      expect(block, `site ${site} Edit icon`).not.toContain('<Edit2');
    }
    for (const site of edit2Sites) {
      const block = sliceThrough(src, ANCHORS[site], 'title="Edit"', '</button>');
      expect(block, `site ${site} Edit icon`).toContain('<Edit2');
      expect(block, `site ${site} Edit icon`).not.toContain('<PenTool');
    }
  });

  it('every site presents the action cluster in the exact current order: (Color|Edit toggle), Strikethrough, Delete', () => {
    const src = readFreeform();
    for (const [site, anchor] of Object.entries(ANCHORS)) {
      const block = sliceThrough(src, anchor, 'title="Delete"', '</button>');
      const titles = titlesInOrder(block).filter((t) => ['Color', 'Edit', 'Strikethrough', 'Delete'].includes(t));
      // The Color/Edit button occupies a single conditional slot (Color when
      // editing, Edit otherwise) so only one of the two appears per render
      // pass -- the *source* therefore contains both titles adjacent to each
      // other (ternary branches), always immediately followed by
      // Strikethrough then Delete.
      expect(titles, `site ${site} action order`).toEqual(['Color', 'Edit', 'Strikethrough', 'Delete']);
    }
  });

  it('every site\'s action buttons are individually disabled when nothing is active, matching current UX (no silent no-op clicks)', () => {
    const src = readFreeform();
    for (const [site, anchor] of Object.entries(ANCHORS)) {
      const block = sliceThrough(src, anchor, 'title="Delete"', '</button>');
      expect((block.match(/disabled=\{!(activeCardComment|collapsedActiveCommentId)\}/g) || []).length, `site ${site} disabled-button count`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('COMMENT UI CONTRACT v1 -- storage backing', () => {
  it('sites A, B, D, E, F persist through metadata.detachedComments; site C persists through metadata.comments', () => {
    const src = readFreeform();
    const detachedSites: Array<keyof typeof ANCHORS> = ['A', 'B', 'D', 'E', 'F'];
    for (const site of detachedSites) {
      const block = sliceThrough(src, ANCHORS[site], 'title="Delete"', '</button>');
      expect(block, `site ${site} storage field`).toContain('detachedComments');
      expect(block, `site ${site} storage field`).not.toMatch(/updatePadletMetadata\([^,]+,\s*\{\s*comments:/);
    }
    const commentsBlock = sliceThrough(src, ANCHORS.C, 'title="Delete"', '</button>');
    expect(commentsBlock).toMatch(/updatePadletMetadata\(padlet\.id,\s*\{\s*comments:/);
  });

  it('color persistence writes a different field shape per site: A and C write BOTH textColor and legacy color; B writes textColor only', () => {
    const src = readFreeform();
    // A's own TextStylePopup color-popup block sits textually BEFORE its
    // comment-list anchor; C's sits AFTER (it renders inside the "marker
    // clicked" side popup, below the pin-shape comment).
    expect(windowAround(src, ANCHORS.A, 3000, 0), 'site A color write shape').toMatch(/textColor: color, color \}/);
    expect(windowAround(src, ANCHORS.C, 0, 6000), 'site C color write shape').toMatch(/textColor: color, color \}/);
    // Site B writes textColor only (no legacy `color` field written).
    const bBlock = windowAround(src, ANCHORS.B, 3000, 0);
    expect(bBlock).toMatch(/textColor: color \}/);
    expect(bBlock).not.toMatch(/textColor: color, color \}/);
  });

  it('strikethrough remains a record-level boolean field (isStrikethrough), not a TipTap mark, on every site', () => {
    const src = readFreeform();
    for (const [site, anchor] of Object.entries(ANCHORS)) {
      const block = sliceThrough(src, anchor, 'title="Strikethrough"', '</button>');
      expect(block, `site ${site} strikethrough representation`).toMatch(/isStrikethrough: !(comment|c)\.isStrikethrough/);
    }
  });

  it('delete filters by the exact target comment id and never mutates other comments (every site)', () => {
    const src = readFreeform();
    for (const [site, anchor] of Object.entries(ANCHORS)) {
      const block = sliceThrough(src, anchor, 'title="Delete"', '</button>');
      expect(block, `site ${site} delete isolation`).toMatch(/currentComments\.filter\(\([a-zA-Z]+: any\) => [a-zA-Z]+\.id !== (activeCardComment|collapsedActiveCommentId)(\.id)?\)/);
    }
  });
});

describe('COMMENT UI CONTRACT v1 -- link authoring and click-through (current state, not desired state)', () => {
  it('no site can author a link -- there is no Link button and no TipTap Link extension anywhere in the file\'s inline comment code', () => {
    const src = readFreeform();
    expect(src).not.toMatch(/title="Link"/);
    expect(src).not.toContain('@tiptap/extension-link');
  });

  it('sites A-E (which render HTML) route link clicks through the shared safe-link handler; site F cannot render a link at all (plain text)', () => {
    const src = readFreeform();
    const htmlSites: Array<keyof typeof ANCHORS> = ['A', 'B', 'C', 'D', 'E'];
    for (const site of htmlSites) {
      const block = sliceThrough(src, ANCHORS[site], 'dangerouslySetInnerHTML');
      expect(block, `site ${site} safe-link wiring`).toContain('handleSafeCommentLinkClick(e)');
    }
    const fBlock = sliceThrough(src, ANCHORS.F, 'title="Delete"', '</button>');
    expect(fBlock).not.toContain('dangerouslySetInnerHTML');
    expect(fBlock).not.toContain('handleSafeCommentLinkClick');
    expect(fBlock).toMatch(/\{c\.text\}/);
  });
});

describe('COMMENT UI CONTRACT v1 -- color popup wiring (includes a real, pre-existing defect)', () => {
  it('sites A, B, C, F each render their own gated TextStylePopup color popup', () => {
    const src = readFreeform();
    // A, B: the popup block precedes the badge/list block in source order.
    const precedingSites: Array<keyof typeof ANCHORS> = ['A', 'B'];
    for (const site of precedingSites) {
      expect(windowAround(src, ANCHORS[site], 3000, 0), `site ${site} should have a nearby TextStylePopup color popup`).toContain('<TextStylePopup');
    }
    // C and F: the popup renders AFTER the badge/pin anchor (C: inside the
    // "marker clicked" side popup; F: after the badge and emoji-picker
    // blocks, still within the same NotePostContextMenu wrapper).
    expect(windowAround(src, ANCHORS.C, 0, 6000), 'site C should have a nearby TextStylePopup color popup').toContain('<TextStylePopup');
    expect(windowAround(src, ANCHORS.F, 0, 6000), 'site F should have a nearby TextStylePopup color popup').toContain('<TextStylePopup');
  });

  it('KNOWN DEFECT (frozen, not fixed): sites D and E have a Color button that sets commentColorPopupId but no popup is ever rendered for their scope -- clicking Color while the image/card toolbar is open does nothing visible', () => {
    const src = readFreeform();
    // D and E's own comment-list blocks (activeImageToolbarPadlet /
    // activeCardToolbarPadlet scope) contain the Color BUTTON...
    const dBlock = sliceThrough(src, ANCHORS.D, 'title="Delete"', '</button>');
    expect(dBlock).toContain('title="Color"');
    const eBlock = sliceThrough(src, ANCHORS.E, 'title="Delete"', '</button>');
    expect(eBlock).toContain('title="Color"');

    // ...but no TextStylePopup anywhere is gated on
    // activeImageToolbarPadlet or activeCardToolbarPadlet -- A's and B's
    // popups are explicitly gated OFF while the toolbar is open
    // (!imageToolbarPadletId / !cardToolbarPadletId), and no replacement
    // popup exists for the toolbar-open state.
    expect(src).not.toMatch(/commentColorPopupId[\s\S]{0,200}activeImageToolbarPadlet/);
    expect(src).not.toMatch(/commentColorPopupId[\s\S]{0,200}activeCardToolbarPadlet/);
    expect(src).toMatch(/cardCommentPopupPadletId === padlet\.id && commentColorPopupId && !imageToolbarPadletId/);
    expect(src).toMatch(/cardCommentPopupPadletId === padlet\.id && commentColorPopupId && !cardToolbarPadletId/);
  });
});

describe('COMMENT UI CONTRACT v1 -- editing engine and composer', () => {
  it('every site edits via a plain <textarea> (not TipTap) -- current v1 behavior, not to be upgraded silently by consolidation', () => {
    const src = readFreeform();
    for (const [site, anchor] of Object.entries(ANCHORS)) {
      const block = sliceThrough(src, anchor, 'rows={1}', 'autoFocus');
      expect(block, `site ${site} editing engine`).toContain('<textarea');
      expect(block, `site ${site} editing engine`).not.toContain('useEditor');
    }
  });

  it('every site\'s composer is a single-line <input type="text"> that submits only on Enter (no Send button, no Shift+Enter newline)', () => {
    const src = readFreeform();
    for (const [site, anchor] of Object.entries(ANCHORS)) {
      const block = sliceThrough(src, anchor, 'placeholder="Add a comment...', "inputElement.value = '';");
      expect(block, `site ${site} composer type`).toContain('type="text"');
      expect(block, `site ${site} composer submit`).toContain("e.key === 'Enter'");
    }
  });

  it('double-click-to-edit is wired on the row for sites A, B, C, D, E but NOT on site F (pre-existing gap, not fixed here)', () => {
    const src = readFreeform();
    const wiredSites: Array<keyof typeof ANCHORS> = ['A', 'B', 'C', 'D', 'E'];
    for (const site of wiredSites) {
      const block = sliceThrough(src, ANCHORS[site], 'dangerouslySetInnerHTML');
      expect(block, `site ${site} double-click-to-edit`).toContain('onDoubleClick');
    }
    const fBlock = sliceThrough(src, ANCHORS.F, 'title="Delete"', '</button>');
    expect(fBlock).not.toContain('onDoubleClick');
  });
});

describe('COMMENT UI CONTRACT v1 -- interaction boundaries (must not start a card drag or select the wrong comment)', () => {
  it('every read-only comment-text node stops mousedown propagation so a click inside it cannot start a card drag', () => {
    const src = readFreeform();
    const htmlSites: Array<keyof typeof ANCHORS> = ['A', 'B', 'C', 'D', 'E'];
    for (const site of htmlSites) {
      const block = sliceThrough(src, ANCHORS[site], 'dangerouslySetInnerHTML');
      expect(block, `site ${site} mousedown isolation`).toContain('onMouseDown={(e) => e.stopPropagation()}');
    }
  });

  it('the Color toggle button explicitly stops propagation (onMouseDown + onClick) on every site, guarding the popover-open focus race', () => {
    const src = readFreeform();
    for (const [site, anchor] of Object.entries(ANCHORS)) {
      const block = sliceThrough(src, anchor, 'title="Color"', '</button>');
      expect((block.match(/\.stopPropagation\(\)/g) || []).length, `site ${site} Color button propagation guard`).toBeGreaterThanOrEqual(2);
    }
  });

  it('the row itself sets only its own comment active on click -- distinct setters per site (activeCardCommentId for A/B/D/E/F, collapsedActiveCommentId for C)', () => {
    const src = readFreeform();
    const cardCommentSites: Array<keyof typeof ANCHORS> = ['A', 'B', 'D', 'E', 'F'];
    for (const site of cardCommentSites) {
      const block = sliceThrough(src, ANCHORS[site], 'dangerouslySetInnerHTML');
      expect(block, `site ${site} row selection isolation`).toContain('onClick={() => setActiveCardCommentId(');
    }
    const cBlock = sliceThrough(src, ANCHORS.C, 'dangerouslySetInnerHTML');
    expect(cBlock).toContain('onClick={() => setCollapsedActiveCommentId(');
  });
});
