// PATCH 8A -- COMMENT UI CONTRACT v1 (characterization / freeze only).
// PATCH 8C -- Site A migrated to the shared comment foundation
// (CommentList/FreeformCommentRow). Its duplicated inline JSX is gone from
// FreeformPadletCards.tsx, so its assertions were rewritten from "this exact
// source block exists" to "the same behavior exists through
// CommentList/FreeformCommentRow" (8C spec step 10): implementation-pinning
// -> contract-level.
// PATCH 8E -- COMMENT UI CONTRACT UNLOCK: CLIPART SITE B. Site B (the
// on-canvas Clipart comment badge) is deliberately superseded: it now
// renders through CommentPopup.tsx, the exact same canonical component the
// Clipart edit modal (ClipartCardDraftModal.tsx) already used. This closes
// the two-Clipart-comment-UX duality PATCH 8D's audit surfaced. Site B's
// assertions below were rewritten the same way Site A's were in 8C:
// implementation-pinning ("this inline JSX exists") -> contract-level ("the
// same canonical component Site B and the Clipart modal both consume is
// used, and the old duplicated inline implementation is gone"). This is an
// explicit, labeled, one-site UNLOCK -- see COMMENT_UI_CONTRACT_V1.md.
// Sites C, D, F remain untouched inline implementations and their
// assertions are unchanged from 8A. Site E (the Clipart toolbar-open
// popup) is also untouched source, but PATCH 8E's trace found it is dead
// code: `cardToolbarPadletId` is never set to a non-null value anywhere in
// the codebase (grep-verified), so `activeCardToolbarPadlet` is always
// null and Site E's whole gated block never renders. It is characterized
// here exactly as before (frozen source, not touched), not because it is
// reachable.
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
// (CommentList.tsx/FreeformCommentRow.tsx for Site A, CommentPopup.tsx for
// Site B) are similarly source-checked here rather than mounted -- their
// OWN behavior is already proven by mounted tests (components/collabboard/
// comments/*.test.tsx for A; CommentPopup.colorAndLink.test.tsx and
// CommentPopup.clipartContract.test.tsx for B); this file only needs to
// prove each migrated site is wired to its shared component with the
// intended contract intact.
//
// Sites, by unique anchor string:
//   A = image padlet, badge-triggered popup (toolbar closed) -- MIGRATED (8C): now <CommentList profile={SITE_A_PROFILE}>
//   B = card/clipart padlet, badge-triggered popup (toolbar closed) -- MIGRATED (8E): now <CommentPopup>
//   C = standalone "comment" padlet, collapsed pin marker popup
//   D = image padlet, toolbar-triggered popup (activeImageToolbarPadlet)
//   E = card/clipart padlet, toolbar-triggered popup (activeCardToolbarPadlet) -- dead code, see above
//   F = generic fallback (note/drawing/ai-component/...), badge-triggered popup
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const FREEFORM_PATH = 'components/collabboard/canvas/ui/FreeformPadletCards.tsx';
const COMMENT_LIST_PATH = 'components/collabboard/comments/CommentList.tsx';
const COMMENT_ROW_PATH = 'components/collabboard/comments/FreeformCommentRow.tsx';
const COMMENT_POPUP_PATH = 'components/collabboard/editors/CommentPopup.tsx';
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
function readCommentPopup(): string {
  return fs.readFileSync(COMMENT_POPUP_PATH, 'utf8');
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
//
// IMPORTANT: this only stays correct for sites whose block actually
// contains every marker searched for. A migrated site (A, B) that no
// longer contains an inline marker (e.g. 'title="Delete"') will cause
// sliceThrough to walk forward into a LATER site's occurrence instead of
// throwing -- silently producing a block that spans past the intended
// site. Never call sliceThrough for A or B with markers that only existed
// in their old inline implementations; use the CommentList/CommentPopup
// self-closing tag markers instead (see the 8C/8E migration-wiring
// describes below).
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
// own comment-list/badge anchor in source order (all popups precede their
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

  it('3 remaining inline sites (C, D, E) render comment text via dangerouslySetInnerHTML+DOMPurify in FreeformPadletCards.tsx; site F does not; Site A\'s equivalent lives in FreeformCommentRow.tsx, Site B\'s in CommentPopup.tsx (each exactly once)', () => {
    const src = readFreeform();
    const count = (src.match(/dangerouslySetInnerHTML=\{\{ __html: DOMPurify\.sanitize\((c|comment)\.text\) \}\}/g) || []).length;
    expect(count).toBe(3);
    const rowSrc = readCommentRow();
    const rowCount = (rowSrc.match(/dangerouslySetInnerHTML=\{\{ __html: DOMPurify\.sanitize\(comment\.text\) \}\}/g) || []).length;
    expect(rowCount).toBe(1);
    const popupSrc = readCommentPopup();
    const popupCount = (popupSrc.match(/dangerouslySetInnerHTML=\{\{ __html: DOMPurify\.sanitize\(comment\.text\) \}\}/g) || []).length;
    expect(popupCount).toBe(1);
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

  it('exactly ONE site (A) uses CommentList -- C, D, E, F still import nothing from the shared comments/ foundation, and Site B (migrated separately in 8E) uses CommentPopup instead, never CommentList', () => {
    const src = readFreeform();
    for (const site of ['C', 'D', 'E', 'F'] as const) {
      const block = sliceThrough(src, ANCHORS[site], 'title="Delete"', '</button>');
      expect(block, `site ${site} must not use CommentList`).not.toContain('<CommentList');
    }
    const siteBBlock = sliceThrough(src, ANCHORS.B, '<CommentPopup', '/>');
    expect(siteBBlock, 'site B must not use CommentList').not.toContain('<CommentList');
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

describe('PATCH 8E -- Site B migration wiring (COMMENT UI CONTRACT UNLOCK: CLIPART SITE B)', () => {
  it('Site B imports and uses the canonical CommentPopup, and no longer contains its own inline row/action-rail JSX', () => {
    const src = readFreeform();
    expect(src).toContain("import CommentPopup from '@/components/collabboard/editors/CommentPopup';");
    const siteBBlock = sliceThrough(src, ANCHORS.B, '<CommentPopup', '/>');
    // The duplicated inline implementation (per-row action titles, textarea
    // engine markers, its own gated TextStylePopup) must be GONE from Site
    // B's own block -- proves this is a real migration onto the canonical
    // component, not an additive import next to the old code.
    expect(siteBBlock).not.toContain('title="Strikethrough"');
    expect(siteBBlock).not.toContain('title="Delete"');
    expect(siteBBlock).not.toContain('title="Color"');
    expect(siteBBlock).not.toContain('<textarea');
    expect(siteBBlock).not.toContain('dangerouslySetInnerHTML');
    expect(siteBBlock).not.toContain('<TextStylePopup');
    expect(siteBBlock).not.toContain('<Edit2');
    expect(siteBBlock).not.toContain('<Palette');
  });

  it('exactly ONE site (B) uses CommentPopup inside FreeformPadletCards.tsx -- ClipartCardDraftModal.tsx (the Clipart edit modal) is the only other consumer in the whole app, so both Clipart entry points render through the same component instance type', () => {
    const src = readFreeform();
    expect((src.match(/<CommentPopup\b/g) || []).length, 'exactly one CommentPopup usage in FreeformPadletCards.tsx').toBe(1);
  });

  it('Site B persists through the SAME metadata.detachedComments field and the SAME optimistic cardCommentList mirror + updatePadletMetadata pattern PATCH 8C established for Site A -- no schema/storage migration', () => {
    const src = readFreeform();
    const siteBBlock = sliceThrough(src, ANCHORS.B, '<CommentPopup', '/>');
    expect(siteBBlock).toContain('comments={cardCommentList}');
    expect(siteBBlock).toContain('detachedComments: nextComments');
    expect((siteBBlock.match(/updatePadletMetadata\(padlet\.id, \{ detachedComments: nextComments \}\)/g) || []).length).toBe(5);
    expect((siteBBlock.match(/setCardCommentList\(nextComments\)/g) || []).length).toBe(5);
    // Every mutation is awaited before updating the local mirror, same
    // ordering Site A's inline callbacks and CommentList's onCommentsChange
    // already use.
    expect(siteBBlock).toMatch(/await updatePadletMetadata\(padlet\.id, \{ detachedComments: nextComments \}\);\s*setCardCommentList\(nextComments\);/);
  });

  it('COMMENT UI CONTRACT UNLOCK: Site B\'s color-write shape changed from textColor-only to the canonical {textColor, backgroundColor} shape CommentPopup\'s onCommentColor always supplies -- no legacy `color` mirror is written (unlike A and C, whose shell-owned color popups are untouched)', () => {
    const src = readFreeform();
    const siteBBlock = sliceThrough(src, ANCHORS.B, '<CommentPopup', '/>');
    expect(siteBBlock).toMatch(/comment\.id === commentId \? \{ \.\.\.comment, textColor, backgroundColor \} : comment/);
    expect(siteBBlock).not.toMatch(/textColor: color/);
    expect(siteBBlock).not.toContain(', color }');
  });

  it('COMMENT UI CONTRACT UNLOCK: Site B can now author a link (Color/Edit/Link/Strikethrough/Delete, TipTap editing, not a plain textarea) because CommentPopup.tsx -- the component it now renders -- has the Link button and TipTap Link extension; FreeformPadletCards.tsx itself still contains no inline Link/TipTap code for any site', () => {
    const src = readFreeform();
    // No site's OWN inline code (C, D, E, F -- still untouched textarea-based
    // implementations) gained Link authoring; the whole file still has zero
    // inline `title="Link"` or Link-extension code of its own.
    expect(src).not.toMatch(/title="Link"/);
    expect(src).not.toContain('@tiptap/extension-link');

    const popupSrc = readCommentPopup();
    expect(popupSrc).toContain("import Link from '@tiptap/extension-link';");
    expect(popupSrc).toMatch(/title="Link"/);
    expect(popupSrc).toContain('useEditor');
    // Site B's row supports double-click-to-edit and stops the Color
    // button's mousedown/click from bubbling, same interaction-boundary
    // guarantees the old inline sites provide, just implemented inside the
    // shared component instead of duplicated per site.
    expect(popupSrc).toContain('onDoubleClick');
    expect((popupSrc.match(/\.stopPropagation\(\)/g) || []).length).toBeGreaterThan(2);
  });

  it('submitting a comment never closes Site B\'s panel -- setCardCommentPopupPadletId(null) appears exactly once in Site B\'s block, inside onOpenChange, never inside onSubmit', () => {
    const src = readFreeform();
    const siteBBlock = sliceThrough(src, ANCHORS.B, '<CommentPopup', '/>');
    expect((siteBBlock.match(/setCardCommentPopupPadletId\(null\)/g) || []).length, 'setCardCommentPopupPadletId(null) should only be called from onOpenChange').toBe(1);
    expect(siteBBlock).toMatch(/onOpenChange=\{\(open\) => \{\s*if \(!open\) setCardCommentPopupPadletId\(null\);\s*\}\}/);
    const onSubmitBlock = sliceThrough(siteBBlock, 'onSubmit={async (commentText) => {', 'onEditComment=');
    expect(onSubmitBlock, 'onSubmit must not close the panel').not.toContain('setCardCommentPopupPadletId');
  });

  it('Site B\'s shell wrapper stops click/mousedown propagation, same guard the Clipart edit modal\'s comments-panel wrapper already has -- without it, a row click (setActiveCommentId, no stopPropagation of its own inside CommentPopup) bubbles to the card\'s own onClick, which calls closeAllToolbars() and unconditionally resets cardCommentPopupPadletId, closing the panel on every row click (caught live during PATCH 8E browser testing)', () => {
    const src = readFreeform();
    // PATCH 8L-B moved Site B's shell out of the card's JSX and into the
    // ViewportAnchoredCommentShell component (the panel is now portaled to
    // document.body and positioned in viewport space). The guard itself is
    // unchanged and still required: React portals propagate through the REACT
    // tree, so a row click still reaches the card's onClick -> closeAllToolbars
    // without it. Assert it where it now lives.
    const shellStart = src.indexOf('function ViewportAnchoredCommentShell');
    expect(shellStart, 'ViewportAnchoredCommentShell must exist').toBeGreaterThan(-1);
    const shellBlock = src.slice(shellStart, src.indexOf('\nfunction FreeformPadletCards', shellStart));
    expect(shellBlock).toMatch(/onClick=\{\(e\) => e\.stopPropagation\(\)\}/);
    expect(shellBlock).toMatch(/onMouseDown=\{\(e\) => e\.stopPropagation\(\)\}/);
    // ...and Site B must actually route through that shell.
    expect(src).toContain('<ViewportAnchoredCommentShell>');
  });

  it('entry-point parity: Site B and the Clipart edit modal (ClipartCardDraftModal.tsx) pass the exact same CommentPopup capability prop set -- isOpen/onOpenChange/onSubmit/onEditComment/onRemoveComment/onToggleCommentStrikethrough/onCommentColor/comments/currentUserId/currentUserName -- so neither entry point can silently drift to offer fewer comment actions than the other', () => {
    const src = readFreeform();
    const siteBBlock = sliceThrough(src, ANCHORS.B, '<CommentPopup', '/>');
    const modalSrc = fs.readFileSync('components/collabboard/editors/ClipartCardDraftModal.tsx', 'utf8');
    const modalBlock = sliceThrough(modalSrc, '<CommentPopup', '/>');

    const capabilityProps = [
      'onSubmit=',
      'onEditComment=',
      'onRemoveComment=',
      'onToggleCommentStrikethrough=',
      'onCommentColor=',
      'comments=',
      'currentUserId=',
      'currentUserName=',
    ];
    for (const prop of capabilityProps) {
      expect(siteBBlock, `Site B must pass ${prop}`).toContain(prop);
      expect(modalBlock, `Clipart modal must pass ${prop}`).toContain(prop);
    }
  });
});

describe('COMMENT UI CONTRACT v1 -- action cluster (order, count, icon identity)', () => {
  // Only site B (card/clipart, expanded/badge-triggered view) used Edit2
  // before PATCH 8E. It no longer has an inline Edit icon of its own at all
  // (CommentPopup.tsx renders its own hardcoded pencil <svg>, neither
  // PenTool nor Edit2 -- see the 8E migration-wiring describe above).
  // Every remaining inline site -- including E, the SAME post type's
  // toolbar-collapsed view -- still uses PenTool. This is pre-existing icon
  // drift WITHIN a single post type's own two comment panels, not just
  // across post types, and PATCH 8E did not touch it (E is untouched, dead
  // code besides).
  it('remaining inline sites (C, D, E, F) still use PenTool for the Edit action (pre-existing icon drift, not touched); Site A\'s SITE_A_PROFILE also specifies PenTool; Site B no longer has an inline Edit2/PenTool icon at all (see PATCH 8E section)', () => {
    const src = readFreeform();
    const penToolSites: Array<keyof typeof ANCHORS> = ['C', 'D', 'E', 'F'];

    for (const site of penToolSites) {
      const block = sliceThrough(src, ANCHORS[site], 'title="Edit"', '</button>');
      expect(block, `site ${site} Edit icon`).toContain('<PenTool');
      expect(block, `site ${site} Edit icon`).not.toContain('<Edit2');
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

  it('remaining inline sites (C, D, E, F) present the action cluster in the exact frozen order: (Color|Edit toggle), Strikethrough, Delete; Site A\'s CommentList does too', () => {
    const src = readFreeform();
    const inlineSites: Array<keyof typeof ANCHORS> = ['C', 'D', 'E', 'F'];
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

    // Site B's canonical action set -- Edit/Color/Link/Strikethrough/Delete.
    // Link appears in both edit mode and the selected-range styling mode,
    // which intentionally produces two source occurrences here.
    // per comment row -- lives in CommentPopup.tsx, checked directly rather
    // than sliced from FreeformPadletCards.tsx (see PATCH 8E section above).
    const popupSrc = readCommentPopup();
    const popupBlock = sliceThrough(popupSrc, 'effectiveComments.map((comment)', 'title="Delete"', '</button>');
    const popupTitles = titlesInOrder(popupBlock).filter((t) => ['Color', 'Link', 'Edit', 'Strikethrough', 'Delete'].includes(t));
    expect(popupTitles, 'Site B (CommentPopup) action order').toEqual(['Color', 'Link', 'Link', 'Edit', 'Strikethrough', 'Delete']);
  });

  it('remaining inline sites\' (C, D, E, F) action buttons are individually disabled when nothing is active; Site A\'s CommentList also disables all three -- Site B\'s canonical per-row buttons act on their OWN row\'s comment, so a disabled/nothing-active state does not apply (there is no shared "active comment" precondition)', () => {
    const src = readFreeform();
    const inlineSites: Array<keyof typeof ANCHORS> = ['C', 'D', 'E', 'F'];
    for (const site of inlineSites) {
      const block = sliceThrough(src, ANCHORS[site], 'title="Delete"', '</button>');
      expect((block.match(/disabled=\{!(activeCardComment|collapsedActiveCommentId)\}/g) || []).length, `site ${site} disabled-button count`).toBeGreaterThanOrEqual(3);
    }
    const commentListSrc = readCommentList();
    expect((commentListSrc.match(/disabled=\{!activeComment\}/g) || []).length, 'Site A (CommentList) disabled-button count').toBeGreaterThanOrEqual(3);
  });
});

describe('COMMENT UI CONTRACT v1 -- storage backing', () => {
  it('remaining inline sites D, E, F persist through metadata.detachedComments; site C persists through metadata.comments; Site A writes through the same detachedComments path via CommentList\'s onCommentsChange; Site B writes through the same path directly (see PATCH 8E section for its own dedicated proof)', () => {
    const src = readFreeform();
    const detachedSites: Array<keyof typeof ANCHORS> = ['D', 'E', 'F'];
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

  it('color persistence writes a different field shape per remaining site: A and C write BOTH textColor and legacy color; Site A\'s color popup block is untouched shell chrome, still owned by FreeformPadletCards.tsx directly (Site B\'s shape change is covered by its own dedicated PATCH 8E test)', () => {
    const src = readFreeform();
    // A's own TextStylePopup color-popup block sits textually BEFORE its
    // comment-list anchor; C's sits AFTER (it renders inside the "marker
    // clicked" side popup, below the pin-shape comment). Unchanged by 8C --
    // this block was never part of the migrated row/action-rail JSX (Site
    // A's color popup is shell chrome that stays outside CommentList).
    expect(windowAround(src, ANCHORS.A, 3000, 0), 'site A color write shape').toMatch(/textColor: color, color \}/);
    expect(windowAround(src, ANCHORS.C, 0, 6000), 'site C color write shape').toMatch(/textColor: color, color \}/);

    const commentListSrc = readCommentList();
    expect(commentListSrc).toMatch(/mirrorLegacyColor:\s*true/);
  });

  it('strikethrough remains a record-level boolean field (isStrikethrough), not a TipTap mark, on remaining inline sites (C, D, E, F); Site A\'s CommentList delegates to the same domain toggleCommentStrikethrough operation; Site B\'s CommentPopup wiring writes the identical field shape (see PATCH 8E section)', () => {
    const src = readFreeform();
    const inlineSites: Array<keyof typeof ANCHORS> = ['C', 'D', 'E', 'F'];
    for (const site of inlineSites) {
      const block = sliceThrough(src, ANCHORS[site], 'title="Strikethrough"', '</button>');
      expect(block, `site ${site} strikethrough representation`).toMatch(/isStrikethrough: !(comment|c)\.isStrikethrough/);
    }
    const domainSrc = readDomain();
    expect(domainSrc).toMatch(/isStrikethrough: !comment\.isStrikethrough/);
    const commentListSrc = readCommentList();
    expect(commentListSrc).toContain('toggleCommentStrikethrough(comments, activeComment.id)');
  });

  it('delete filters by the exact target comment id and never mutates other comments on remaining inline sites (C, D, E, F); Site A\'s CommentList delegates to the same domain removeComment operation; Site B\'s CommentPopup wiring filters by exact id too (see PATCH 8E section)', () => {
    const src = readFreeform();
    const inlineSites: Array<keyof typeof ANCHORS> = ['C', 'D', 'E', 'F'];
    for (const site of inlineSites) {
      const block = sliceThrough(src, ANCHORS[site], 'title="Delete"', '</button>');
      expect(block, `site ${site} delete isolation`).toMatch(/currentComments\.filter\(\([a-zA-Z]+: any\) => [a-zA-Z]+\.id !== (activeCardComment|collapsedActiveCommentId)(\.id)?\)/);
    }
    const domainSrc = readDomain();
    expect(domainSrc).toMatch(/comments\.filter\(\(comment\) => comment\.id !== commentId\)/);
    const commentListSrc = readCommentList();
    expect(commentListSrc).toContain('removeComment(comments, activeComment.id)');

    const siteBBlock = sliceThrough(src, ANCHORS.B, '<CommentPopup', '/>');
    expect(siteBBlock, 'site B delete isolation').toMatch(/cardCommentList\.filter\(\(comment: any\) => comment\.id !== commentId\)/);
  });
});

describe('COMMENT UI CONTRACT v1 -- link authoring and click-through (current state, not desired state)', () => {
  it('no REMAINING INLINE site can author a link -- there is no Link button and no TipTap Link extension anywhere in FreeformPadletCards.tsx\'s own inline comment code, nor in the shared Site A implementation (Site B now CAN, via the canonical CommentPopup.tsx it renders -- see PATCH 8E section above)', () => {
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

  it('remaining inline HTML-rendering sites (C, D, E) route link clicks through the shared safe-link handler; site F cannot render a link at all (plain text); Site A\'s shared FreeformCommentRow and Site B\'s CommentPopup also route through the same handler (Site B proven directly by CommentPopup.clipartContract.test.tsx, a real-DOM click-through test)', () => {
    const src = readFreeform();
    const htmlSites: Array<keyof typeof ANCHORS> = ['C', 'D', 'E'];
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
    const popupSrc = readCommentPopup();
    expect(popupSrc).toContain('handleSafeCommentLinkClick(e)');
  });
});

describe('COMMENT UI CONTRACT v1 -- color popup wiring (includes a real, pre-existing defect)', () => {
  it('sites A and C each render their own gated TextStylePopup color popup (Site A\'s is unchanged shell chrome, not part of the 8C migration); site F also does; Site B no longer renders a local TextStylePopup at all -- its per-row color popover now lives inside CommentPopup.tsx (COMMENT UI CONTRACT UNLOCK, see PATCH 8E section)', () => {
    const src = readFreeform();
    expect(windowAround(src, ANCHORS.A, 3000, 0), 'site A should have a nearby TextStylePopup color popup').toContain('<TextStylePopup');
    // C and F: the popup renders AFTER the badge/pin anchor (C: inside the
    // "marker clicked" side popup; F: after the badge and emoji-picker
    // blocks, still within the same NotePostContextMenu wrapper).
    expect(windowAround(src, ANCHORS.C, 0, 6000), 'site C should have a nearby TextStylePopup color popup').toContain('<TextStylePopup');
    expect(windowAround(src, ANCHORS.F, 0, 6000), 'site F should have a nearby TextStylePopup color popup').toContain('<TextStylePopup');

    const siteBBlock = sliceThrough(src, ANCHORS.B, '<CommentPopup', '/>');
    expect(siteBBlock, 'site B must not render its own local TextStylePopup').not.toContain('<TextStylePopup');
    const popupSrc = readCommentPopup();
    expect(popupSrc).toContain('<TextStylePopup');
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
    // activeImageToolbarPadlet or activeCardToolbarPadlet -- A's popup is
    // explicitly gated OFF while its OWN toolbar is open
    // (!imageToolbarPadletId), and no replacement popup exists for the
    // toolbar-open state. (Site B's equivalent gate is gone entirely as of
    // PATCH 8E -- its color popover is now CommentPopup's own
    // viewport-anchored portal, independent of cardToolbarPadletId, so this
    // specific "gated off while toolbar open" framing no longer applies to
    // B; it is characterized only for A here.)
    expect(src).not.toMatch(/commentColorPopupId[\s\S]{0,200}activeImageToolbarPadlet/);
    expect(src).not.toMatch(/commentColorPopupId[\s\S]{0,200}activeCardToolbarPadlet/);
    expect(src).toMatch(/cardCommentPopupPadletId === padlet\.id && commentColorPopupId && !imageToolbarPadletId/);
  });
});

describe('COMMENT UI CONTRACT v1 -- editing engine and composer', () => {
  it('remaining inline sites (C, D, E, F) edit via a plain <textarea> (not TipTap); Site A\'s shared FreeformCommentRow also uses a plain <textarea>, not TipTap -- current v1 behavior, not upgraded by consolidation. COMMENT UI CONTRACT UNLOCK: Site B now edits via TipTap (CommentPopup.tsx), a deliberate, labeled part of the PATCH 8E canonicalization, not an accidental engine swap', () => {
    const src = readFreeform();
    const inlineSites: Array<keyof typeof ANCHORS> = ['C', 'D', 'E', 'F'];
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

    const popupSrc = readCommentPopup();
    expect(popupSrc).toContain('useEditor');
    expect(popupSrc).not.toContain('<textarea');
  });

  it('remaining inline sites\' (C, D, E, F) composer is a single-line <input type="text"> that submits only on Enter (no Send button, no Shift+Enter newline) -- Site A\'s composer is unchanged shell chrome, not part of the 8C migration; Site B\'s composer moved inside CommentPopup.tsx but keeps the identical contract (checked directly on CommentPopup.tsx, not sliced from FreeformPadletCards.tsx, since Site B no longer has an inline composer to slice)', () => {
    const src = readFreeform();
    for (const site of ['A', 'C', 'D', 'E', 'F'] as const) {
      const block = sliceThrough(src, ANCHORS[site], 'placeholder="Add a comment...', "inputElement.value = '';");
      expect(block, `site ${site} composer type`).toContain('type="text"');
      expect(block, `site ${site} composer submit`).toContain("e.key === 'Enter'");
    }

    const popupSrc = readCommentPopup();
    const popupComposerBlock = windowAround(popupSrc, 'placeholder="Add a comment...', 900, 0);
    expect(popupComposerBlock, 'site B (CommentPopup) composer type').toMatch(/type="text"/);
    expect(popupComposerBlock, 'site B (CommentPopup) composer submit').toContain("e.key === 'Enter'");
    // No Send button, no Shift+Enter newline handling for Site B either.
    expect(popupComposerBlock).not.toMatch(/shiftKey/);
  });

  it('double-click-to-edit is wired on the row for remaining inline sites (C, D, E) but NOT on site F; Site A\'s shared FreeformCommentRow also wires onDoubleClick (pre-existing gap on F, not fixed here); Site B\'s CommentPopup wires onDoubleClick too (proven in the PATCH 8E section above)', () => {
    const src = readFreeform();
    const wiredSites: Array<keyof typeof ANCHORS> = ['C', 'D', 'E'];
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
  it('every remaining inline read-only comment-text node (C, D, E) stops mousedown propagation so a click inside it cannot start a card drag; Site A\'s shared FreeformCommentRow also does; Site B\'s CommentPopup achieves the same guarantee at the panel level (its root onMouseDown always calls stopPropagation -- proven in the PATCH 8E section above, and exercised live in the PATCH 8E return report\'s browser pass)', () => {
    const src = readFreeform();
    const htmlSites: Array<keyof typeof ANCHORS> = ['C', 'D', 'E'];
    for (const site of htmlSites) {
      const block = sliceThrough(src, ANCHORS[site], 'dangerouslySetInnerHTML');
      expect(block, `site ${site} mousedown isolation`).toContain('onMouseDown={(e) => e.stopPropagation()}');
    }
    const rowSrc = readCommentRow();
    expect(rowSrc).toContain('onMouseDown={(e) => e.stopPropagation()}');
  });

  it('the Color toggle button explicitly stops propagation (onMouseDown + onClick) on remaining inline sites (C, D, E, F), guarding the popover-open focus race; Site A\'s CommentList Color button also does; Site B\'s CommentPopup Color button does too (proven in the PATCH 8E section above)', () => {
    const src = readFreeform();
    const inlineSites: Array<keyof typeof ANCHORS> = ['C', 'D', 'E', 'F'];
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

  it('the row itself sets only its own comment active on click -- distinct setters per remaining inline site (activeCardCommentId for D/E/F, collapsedActiveCommentId for C); Site A\'s CommentList is wired to the same setActiveCardCommentId setter it always used; Site B\'s CommentPopup manages its own internal activeCommentId, isolated per comment row and never cross-wired to setActiveCardCommentId (intentional as of PATCH 8E -- see "why genuinely one implementation" in the return report: Site E, the only other consumer of that shared setter for this post type, is confirmed dead code, so there is no live cross-site state to desync)', () => {
    const src = readFreeform();
    const cardCommentSites: Array<keyof typeof ANCHORS> = ['D', 'E', 'F'];
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

    const siteBBlock = sliceThrough(src, ANCHORS.B, '<CommentPopup', '/>');
    expect(siteBBlock, 'site B must not be wired to setActiveCardCommentId (no controlled active-id prop on CommentPopup)').not.toContain('setActiveCardCommentId');
    const popupSrc = readCommentPopup();
    expect(popupSrc).toContain('onClick={() => setActiveCommentId(comment.id)}');
  });
});

describe('PATCH 8E -- architectural anti-duplication guard', () => {
  // This is the guard PATCH 8E step 13 requires: it must fail if someone
  // later reintroduces a second, local Clipart comment-row/action
  // implementation inside FreeformPadletCards.tsx instead of extending the
  // canonical CommentPopup. It does not merely check "does CommentPopup
  // appear" (that alone wouldn't catch a second implementation added
  // ALONGSIDE it) -- it checks that no per-row action-button titles the old
  // Site B implementation used to hardcode (Edit/Color/Strikethrough/
  // Delete/Link, outside of CommentPopup.tsx and CommentList.tsx/
  // FreeformCommentRow.tsx's own files) exist anywhere near the card/
  // Clipart badge-popup anchor, and that the file contains exactly one
  // CommentPopup usage total.
  it('fails if a second local Clipart comment action implementation is reintroduced near the Site B anchor', () => {
    const src = readFreeform();
    const siteBBlock = sliceThrough(src, ANCHORS.B, '<CommentPopup', '/>');
    for (const forbiddenTitle of ['title="Edit"', 'title="Color"', 'title="Strikethrough"', 'title="Delete"', 'title="Link"']) {
      expect(siteBBlock, `Site B block must not locally hardcode ${forbiddenTitle} -- that belongs to CommentPopup.tsx only`).not.toContain(forbiddenTitle);
    }
    expect((src.match(/<CommentPopup\b/g) || []).length, 'exactly one CommentPopup usage in FreeformPadletCards.tsx -- a second usage would mean a second Clipart (or other) canvas comment surface was added instead of reusing this one').toBe(1);
  });
});
