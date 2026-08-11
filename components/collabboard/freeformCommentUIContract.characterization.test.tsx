// PATCH 8A -- COMMENT UI CONTRACT v1 (characterization / freeze only).
// PATCH 8C -- Site A migrated to the shared comment foundation. Its
// duplicated inline JSX is gone from FreeformPadletCards.tsx, so its
// assertions below were rewritten from "this exact source block exists" to
// "the same behavior exists through CommentList/FreeformCommentRow" per the
// 8C spec (step 10): implementation-pinning -> contract-level. Sites B-F
// remain untouched inline implementations and their assertions are
// byte-for-byte the same as 8A wrote them.
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
// characterization.test.tsx. The shared foundation files
// (CommentList.tsx/FreeformCommentRow.tsx) are similarly source-checked here
// rather than mounted -- their OWN behavior is already proven by mounted
// tests in components/collabboard/comments/*.test.tsx; this file only needs
// to prove Site A is wired to them with the frozen contract intact.
//
// Sites, by unique anchor string:
//   A = image padlet, badge-triggered popup (toolbar closed) -- MIGRATED (8C): now <CommentList profile={SITE_A_PROFILE}>
//   B = card/clipart padlet, badge-triggered popup (toolbar closed)
//   C = standalone "comment" padlet, collapsed pin marker popup
//   D = image padlet, toolbar-triggered popup (activeImageToolbarPadlet)
//   E = card/clipart padlet, toolbar-triggered popup (activeCardToolbarPadlet)
//   F = generic fallback (note/drawing/ai-component/...), badge-triggered popup
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const FREEFORM_PATH = 'components/collabboard/canvas/ui/FreeformPadletCards.tsx';
const COMMENT_LIST_PATH = 'components/collabboard/comments/CommentList.tsx';
const COMMENT_ROW_PATH = 'components/collabboard/comments/FreeformCommentRow.tsx';
const DOMAIN_PATH = 'lib/domain/canvas/comments.ts';

function readFreeform(): string {
  return fs.readFileSync(FREEFORM_PATH, 'utf8');
}
function readCommentList(): string {
  return fs.readFileSync(COMMENT_LIST_PATH, 'utf8');
}
function readCommentRow(): string {
  return fs.readFileSync(COMMENT_ROW_PATH, 'utf8');
}
function readDomain(): string {
  return fs.readFileSync(DOMAIN_PATH, 'utf8');
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

  it('4 remaining inline sites (B, C, D, E) render comment text via dangerouslySetInnerHTML+DOMPurify in FreeformPadletCards.tsx; site F does not; Site A\'s equivalent now lives in the shared FreeformCommentRow.tsx (exactly once)', () => {
    const src = readFreeform();
    const count = (src.match(/dangerouslySetInnerHTML=\{\{ __html: DOMPurify\.sanitize\((c|comment)\.text\) \}\}/g) || []).length;
    expect(count).toBe(4);
    const rowSrc = readCommentRow();
    const rowCount = (rowSrc.match(/dangerouslySetInnerHTML=\{\{ __html: DOMPurify\.sanitize\(comment\.text\) \}\}/g) || []).length;
    expect(rowCount).toBe(1);
  });
});

describe('PATCH 8C -- Site A migration wiring', () => {
  it('Site A imports and uses the shared CommentList with SITE_A_PROFILE, and no longer contains its own inline row/action-rail JSX', () => {
    const src = readFreeform();
    expect(src).toContain("import CommentList, { SITE_A_PROFILE } from '@/components/collabboard/comments/CommentList';");
    const siteABlock = sliceThrough(src, ANCHORS.A, '<CommentList', '/>');
    expect(siteABlock).toContain('profile={SITE_A_PROFILE}');
    // The duplicated inline implementation (action-rail titles, textarea
    // engine markers) must be GONE from Site A's own block -- proves this
    // is a real migration, not just an additive import.
    expect(siteABlock).not.toContain('title="Strikethrough"');
    expect(siteABlock).not.toContain('<textarea');
    expect(siteABlock).not.toContain('dangerouslySetInnerHTML');
  });

  it('exactly ONE site (A) has migrated -- B, C, D, E, F still import nothing from the shared comments/ foundation', () => {
    const src = readFreeform();
    // Only Site A's block may reference CommentList; every other site's
    // block (sliced the same way 8A always sliced them) must not.
    for (const site of ['B', 'C', 'D', 'E', 'F'] as const) {
      const block = sliceThrough(src, ANCHORS[site], 'title="Delete"', '</button>');
      expect(block, `site ${site} must not use CommentList`).not.toContain('<CommentList');
    }
    expect((src.match(/<CommentList\b/g) || []).length, 'exactly one CommentList usage in the whole file').toBe(1);
  });

  it('Site A\'s CommentList is wired to the SAME shared state family Site D reads (activeCardCommentId/editingCardCommentId/editingCardCommentText/commentColorPopupId/cardCommentList) -- not new, isolated state', () => {
    const src = readFreeform();
    const siteABlock = sliceThrough(src, ANCHORS.A, '<CommentList', '/>');
    expect(siteABlock).toContain('comments={cardCommentList}');
    expect(siteABlock).toContain('activeCommentId={activeCardCommentId}');
    expect(siteABlock).toContain('onActiveCommentIdChange={setActiveCardCommentId}');
    expect(siteABlock).toContain('editingCommentId={editingCardCommentId}');
    expect(siteABlock).toContain('editingText={editingCardCommentText}');
    expect(siteABlock).toContain('onEditingCommentIdChange={setEditingCardCommentId}');
    expect(siteABlock).toContain('onEditingTextChange={setEditingCardCommentText}');
    expect(siteABlock).toContain('colorPopupCommentId={commentColorPopupId}');
    expect(siteABlock).toContain('onColorPopupCommentIdChange={setCommentColorPopupId}');
  });

  it('Site A\'s shell (close button, header, Badge Color, composer, color popup) is unchanged and stays OUTSIDE CommentList', () => {
    const src = readFreeform();
    // The shell block from the panel wrapper through the composer must
    // still contain all of this chrome; CommentList itself (per its own
    // tests) contains none of it.
    const shellBlock = sliceThrough(src, ANCHORS.A, "inputElement.value = '';");
    expect(shellBlock).toContain('title="Close"');
    expect(shellBlock).toContain('title="Badge Color"');
    expect(shellBlock).toContain('>Comments<');
    expect(shellBlock).toContain('placeholder="Add a comment...');
    const commentListSrc = readCommentList();
    expect(commentListSrc).not.toContain('title="Close"');
    expect(commentListSrc).not.toContain('title="Badge Color"');
    expect(commentListSrc).not.toContain('placeholder="Add a comment');
  });
});

describe('COMMENT UI CONTRACT v1 -- action cluster (order, count, icon identity)', () => {
  // Only site B (card/clipart, expanded/badge-triggered view) uses Edit2.
  // Every other site -- including E, the SAME post type's toolbar-collapsed
  // view -- still uses PenTool. This is pre-existing icon drift WITHIN a
  // single post type's own two comment panels, not just across post types.
  it('site B uses Edit2 for the Edit action; remaining inline sites (C, D, E, F) still use PenTool (pre-existing icon drift, not touched); Site A\'s SITE_A_PROFILE also specifies PenTool', () => {
    const src = readFreeform();
    const penToolSites: Array<keyof typeof ANCHORS> = ['C', 'D', 'E', 'F'];
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

    const commentListSrc = readCommentList();
    // Unlike an inline site (which hardcodes exactly one icon), CommentList
    // genuinely supports both -- gated at render time by `profile.editIcon`
    // -- so both identifiers legitimately appear in ITS source. The frozen
    // claim to prove is narrower: SITE_A_PROFILE itself specifies PenTool,
    // and the ternary really does render PenTool whenever it's not 'Edit2'.
    const siteAProfileBlock = sliceThrough(commentListSrc, 'export const SITE_A_PROFILE', '};');
    expect(siteAProfileBlock).toMatch(/editIcon:\s*'PenTool'/);
    expect(commentListSrc).toMatch(/profile\.editIcon === 'Edit2' \? <Edit2[^:]*: <PenTool/);
  });

  it('remaining inline sites (B, C, D, E, F) present the action cluster in the exact frozen order: (Color|Edit toggle), Strikethrough, Delete; Site A\'s CommentList does too', () => {
    const src = readFreeform();
    const inlineSites: Array<keyof typeof ANCHORS> = ['B', 'C', 'D', 'E', 'F'];
    for (const site of inlineSites) {
      const block = sliceThrough(src, ANCHORS[site], 'title="Delete"', '</button>');
      const titles = titlesInOrder(block).filter((t) => ['Color', 'Edit', 'Strikethrough', 'Delete'].includes(t));
      // The Color/Edit button occupies a single conditional slot (Color when
      // editing, Edit otherwise) so only one of the two appears per render
      // pass -- the *source* therefore contains both titles adjacent to each
      // other (ternary branches), always immediately followed by
      // Strikethrough then Delete.
      expect(titles, `site ${site} action order`).toEqual(['Color', 'Edit', 'Strikethrough', 'Delete']);
    }

    const commentListSrc = readCommentList();
    const clBlock = sliceThrough(commentListSrc, 'export default function CommentList', 'title="Delete"', '</button>');
    const clTitles = titlesInOrder(clBlock).filter((t) => ['Color', 'Edit', 'Strikethrough', 'Delete'].includes(t));
    expect(clTitles, 'Site A (CommentList) action order').toEqual(['Color', 'Edit', 'Strikethrough', 'Delete']);
  });

  it('remaining inline sites\' action buttons are individually disabled when nothing is active; Site A\'s CommentList also disables all three', () => {
    const src = readFreeform();
    const inlineSites: Array<keyof typeof ANCHORS> = ['B', 'C', 'D', 'E', 'F'];
    for (const site of inlineSites) {
      const block = sliceThrough(src, ANCHORS[site], 'title="Delete"', '</button>');
      expect((block.match(/disabled=\{!(activeCardComment|collapsedActiveCommentId)\}/g) || []).length, `site ${site} disabled-button count`).toBeGreaterThanOrEqual(3);
    }
    const commentListSrc = readCommentList();
    expect((commentListSrc.match(/disabled=\{!activeComment\}/g) || []).length, 'Site A (CommentList) disabled-button count').toBeGreaterThanOrEqual(3);
  });
});

describe('COMMENT UI CONTRACT v1 -- storage backing', () => {
  it('sites B, D, E, F persist through metadata.detachedComments; site C persists through metadata.comments; Site A now writes through the same detachedComments path via CommentList\'s onCommentsChange', () => {
    const src = readFreeform();
    const detachedSites: Array<keyof typeof ANCHORS> = ['B', 'D', 'E', 'F'];
    for (const site of detachedSites) {
      const block = sliceThrough(src, ANCHORS[site], 'title="Delete"', '</button>');
      expect(block, `site ${site} storage field`).toContain('detachedComments');
      expect(block, `site ${site} storage field`).not.toMatch(/updatePadletMetadata\([^,]+,\s*\{\s*comments:/);
    }
    const commentsBlock = sliceThrough(src, ANCHORS.C, 'title="Delete"', '</button>');
    expect(commentsBlock).toMatch(/updatePadletMetadata\(padlet\.id,\s*\{\s*comments:/);

    const siteABlock = sliceThrough(src, ANCHORS.A, '<CommentList', '/>');
    expect(siteABlock, 'site A (CommentList) storage field').toContain('detachedComments');
    expect(siteABlock, 'site A (CommentList) storage field').toContain('comments={cardCommentList}');
    expect(siteABlock).not.toMatch(/updatePadletMetadata\([^,]+,\s*\{\s*comments:/);
  });

  it('color persistence writes a different field shape per site: A and C write BOTH textColor and legacy color; B writes textColor only (Site A\'s color popup block is untouched shell chrome, still owned by FreeformPadletCards.tsx directly)', () => {
    const src = readFreeform();
    // A's own TextStylePopup color-popup block sits textually BEFORE its
    // comment-list anchor; C's sits AFTER (it renders inside the "marker
    // clicked" side popup, below the pin-shape comment). Unchanged by 8C --
    // this block was never part of the migrated row/action-rail JSX (Site
    // A's color popup is shell chrome that stays outside CommentList).
    expect(windowAround(src, ANCHORS.A, 3000, 0), 'site A color write shape').toMatch(/textColor: color, color \}/);
    expect(windowAround(src, ANCHORS.C, 0, 6000), 'site C color write shape').toMatch(/textColor: color, color \}/);
    // Site B writes textColor only (no legacy `color` field written).
    const bBlock = windowAround(src, ANCHORS.B, 3000, 0);
    expect(bBlock).toMatch(/textColor: color \}/);
    expect(bBlock).not.toMatch(/textColor: color, color \}/);

    const commentListSrc = readCommentList();
    expect(commentListSrc).toMatch(/mirrorLegacyColor:\s*true/);
  });

  it('strikethrough remains a record-level boolean field (isStrikethrough), not a TipTap mark, on remaining inline sites (B, C, D, E, F); Site A\'s CommentList delegates to the same domain toggleCommentStrikethrough operation', () => {
    const src = readFreeform();
    const inlineSites: Array<keyof typeof ANCHORS> = ['B', 'C', 'D', 'E', 'F'];
    for (const site of inlineSites) {
      const block = sliceThrough(src, ANCHORS[site], 'title="Strikethrough"', '</button>');
      expect(block, `site ${site} strikethrough representation`).toMatch(/isStrikethrough: !(comment|c)\.isStrikethrough/);
    }
    const domainSrc = readDomain();
    expect(domainSrc).toMatch(/isStrikethrough: !comment\.isStrikethrough/);
    const commentListSrc = readCommentList();
    expect(commentListSrc).toContain('toggleCommentStrikethrough(comments, activeComment.id)');
  });

  it('delete filters by the exact target comment id and never mutates other comments on remaining inline sites; Site A\'s CommentList delegates to the same domain removeComment operation', () => {
    const src = readFreeform();
    const inlineSites: Array<keyof typeof ANCHORS> = ['B', 'C', 'D', 'E', 'F'];
    for (const site of inlineSites) {
      const block = sliceThrough(src, ANCHORS[site], 'title="Delete"', '</button>');
      expect(block, `site ${site} delete isolation`).toMatch(/currentComments\.filter\(\([a-zA-Z]+: any\) => [a-zA-Z]+\.id !== (activeCardComment|collapsedActiveCommentId)(\.id)?\)/);
    }
    const domainSrc = readDomain();
    expect(domainSrc).toMatch(/comments\.filter\(\(comment\) => comment\.id !== commentId\)/);
    const commentListSrc = readCommentList();
    expect(commentListSrc).toContain('removeComment(comments, activeComment.id)');
  });
});

describe('COMMENT UI CONTRACT v1 -- link authoring and click-through (current state, not desired state)', () => {
  it('no site can author a link -- there is no Link button and no TipTap Link extension anywhere in the file\'s inline comment code, nor in the shared Site A implementation', () => {
    const src = readFreeform();
    expect(src).not.toMatch(/title="Link"/);
    expect(src).not.toContain('@tiptap/extension-link');

    const commentListSrc = readCommentList();
    const commentRowSrc = readCommentRow();
    expect(commentListSrc).not.toMatch(/title="Link"/);
    expect(commentListSrc).not.toContain('@tiptap/extension-link');
    expect(commentRowSrc).not.toMatch(/title="Link"/);
    expect(commentRowSrc).not.toContain('@tiptap/extension-link');
    expect(commentRowSrc).not.toContain('useEditor');
  });

  it('remaining inline HTML-rendering sites (B, C, D, E) route link clicks through the shared safe-link handler; site F cannot render a link at all (plain text); Site A\'s shared FreeformCommentRow also routes through the same handler', () => {
    const src = readFreeform();
    const htmlSites: Array<keyof typeof ANCHORS> = ['B', 'C', 'D', 'E'];
    for (const site of htmlSites) {
      const block = sliceThrough(src, ANCHORS[site], 'dangerouslySetInnerHTML');
      expect(block, `site ${site} safe-link wiring`).toContain('handleSafeCommentLinkClick(e)');
    }
    const fBlock = sliceThrough(src, ANCHORS.F, 'title="Delete"', '</button>');
    expect(fBlock).not.toContain('dangerouslySetInnerHTML');
    expect(fBlock).not.toContain('handleSafeCommentLinkClick');
    expect(fBlock).toMatch(/\{c\.text\}/);

    const rowSrc = readCommentRow();
    expect(rowSrc).toContain('handleSafeCommentLinkClick(e)');
  });
});

describe('COMMENT UI CONTRACT v1 -- color popup wiring (includes a real, pre-existing defect)', () => {
  it('sites A, B, C, F each render their own gated TextStylePopup color popup (Site A\'s is unchanged shell chrome, not part of the 8C migration)', () => {
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
  it('remaining inline sites (B, C, D, E, F) edit via a plain <textarea> (not TipTap); Site A\'s shared FreeformCommentRow also uses a plain <textarea>, not TipTap -- current v1 behavior, not upgraded by consolidation', () => {
    const src = readFreeform();
    const inlineSites: Array<keyof typeof ANCHORS> = ['B', 'C', 'D', 'E', 'F'];
    for (const site of inlineSites) {
      const block = sliceThrough(src, ANCHORS[site], 'rows={1}', 'autoFocus');
      expect(block, `site ${site} editing engine`).toContain('<textarea');
      expect(block, `site ${site} editing engine`).not.toContain('useEditor');
    }
    const rowSrc = readCommentRow();
    expect(rowSrc).toContain('<textarea');
    expect(rowSrc).not.toContain('useEditor');
    expect(rowSrc).toContain('rows={1}');
    expect(rowSrc).toContain('autoFocus');
  });

  it('every site\'s composer is a single-line <input type="text"> that submits only on Enter (no Send button, no Shift+Enter newline) -- Site A\'s composer is unchanged shell chrome, not part of the 8C migration', () => {
    const src = readFreeform();
    for (const [site, anchor] of Object.entries(ANCHORS)) {
      const block = sliceThrough(src, anchor, 'placeholder="Add a comment...', "inputElement.value = '';");
      expect(block, `site ${site} composer type`).toContain('type="text"');
      expect(block, `site ${site} composer submit`).toContain("e.key === 'Enter'");
    }
  });

  it('double-click-to-edit is wired on the row for remaining inline sites (B, C, D, E) but NOT on site F; Site A\'s shared FreeformCommentRow also wires onDoubleClick (pre-existing gap on F, not fixed here)', () => {
    const src = readFreeform();
    const wiredSites: Array<keyof typeof ANCHORS> = ['B', 'C', 'D', 'E'];
    for (const site of wiredSites) {
      const block = sliceThrough(src, ANCHORS[site], 'dangerouslySetInnerHTML');
      expect(block, `site ${site} double-click-to-edit`).toContain('onDoubleClick');
    }
    const fBlock = sliceThrough(src, ANCHORS.F, 'title="Delete"', '</button>');
    expect(fBlock).not.toContain('onDoubleClick');

    const rowSrc = readCommentRow();
    expect((rowSrc.match(/onDoubleClick/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});

describe('COMMENT UI CONTRACT v1 -- interaction boundaries (must not start a card drag or select the wrong comment)', () => {
  it('every remaining inline read-only comment-text node stops mousedown propagation so a click inside it cannot start a card drag; Site A\'s shared FreeformCommentRow also does', () => {
    const src = readFreeform();
    const htmlSites: Array<keyof typeof ANCHORS> = ['B', 'C', 'D', 'E'];
    for (const site of htmlSites) {
      const block = sliceThrough(src, ANCHORS[site], 'dangerouslySetInnerHTML');
      expect(block, `site ${site} mousedown isolation`).toContain('onMouseDown={(e) => e.stopPropagation()}');
    }
    const rowSrc = readCommentRow();
    expect(rowSrc).toContain('onMouseDown={(e) => e.stopPropagation()}');
  });

  it('the Color toggle button explicitly stops propagation (onMouseDown + onClick) on remaining inline sites, guarding the popover-open focus race; Site A\'s CommentList Color button also does', () => {
    const src = readFreeform();
    const inlineSites: Array<keyof typeof ANCHORS> = ['B', 'C', 'D', 'E', 'F'];
    for (const site of inlineSites) {
      const block = sliceThrough(src, ANCHORS[site], 'title="Color"', '</button>');
      expect((block.match(/\.stopPropagation\(\)/g) || []).length, `site ${site} Color button propagation guard`).toBeGreaterThanOrEqual(2);
    }
    const commentListSrc = readCommentList();
    // Anchor BEFORE the button (its onMouseDown/onClick handlers, which
    // carry the stopPropagation calls, precede the title="Color" attribute
    // in JSX source order -- sliceThrough needs a start point that precedes
    // them, exactly like the inline sites' own SITE anchor does).
    const clBlock = sliceThrough(
      commentListSrc,
      'editingCommentId && activeComment && editingCommentId === activeComment.id ? (',
      'title="Color"',
      '</button>'
    );
    expect((clBlock.match(/\.stopPropagation\(\)/g) || []).length, 'Site A (CommentList) Color button propagation guard').toBeGreaterThanOrEqual(2);
  });

  it('the row itself sets only its own comment active on click -- distinct setters per remaining inline site (activeCardCommentId for B/D/E/F, collapsedActiveCommentId for C); Site A\'s CommentList is wired to the same setActiveCardCommentId setter it always used', () => {
    const src = readFreeform();
    const cardCommentSites: Array<keyof typeof ANCHORS> = ['B', 'D', 'E', 'F'];
    for (const site of cardCommentSites) {
      const block = sliceThrough(src, ANCHORS[site], 'dangerouslySetInnerHTML');
      expect(block, `site ${site} row selection isolation`).toContain('onClick={() => setActiveCardCommentId(');
    }
    const cBlock = sliceThrough(src, ANCHORS.C, 'dangerouslySetInnerHTML');
    expect(cBlock).toContain('onClick={() => setCollapsedActiveCommentId(');

    const siteABlock = sliceThrough(src, ANCHORS.A, '<CommentList', '/>');
    expect(siteABlock, 'site A CommentList wired to setActiveCardCommentId').toContain('onActiveCommentIdChange={setActiveCardCommentId}');
    const commentListSrc = readCommentList();
    expect(commentListSrc).toContain('onSelect={() => onActiveCommentIdChange(comment.id)}');
  });
});
