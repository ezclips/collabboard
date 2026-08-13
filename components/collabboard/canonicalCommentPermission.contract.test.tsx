// PATCH 8O.1/8O.2 -- COMMENT UI CONTRACT UNLOCK — PERMISSIONS ONLY.
//
// Source-level architecture guard: every CURRENT canonical Clipart/Image
// CommentPopup call site must pass an explicit accessMode, and every comment
// mutation callback it defines must be wrapped with the correct guard
// (guardCommentMutation for panel-level/manage-only props, guardCommentComposition
// for composing a new comment, guardOwnCommentMutation for mutating an
// EXISTING comment) before it reaches the caller's own
// optimistic-local-state-plus-persistence body. No canonical caller may
// silently omit the access contract.
//
// Source-level rather than mounted: FreeformPadletCards.tsx and
// CanvasClient.tsx are both too large to mount in this suite (established
// convention -- see freeformCommentUIContract.characterization.test.tsx),
// and the actual RESOLUTION logic (resolveCommentAccessMode) already has
// full mounted-equivalent unit coverage in lib/domain/canvas/comments.test.ts.
// This file's job is narrower and different: prove the WIRING reaches every
// site it must.
//
// PATCH 8P (2026-08-12): normal/detached Note comments (FreeformPadletCards.tsx's
// two Note sites, plus NoteEditor.tsx's own detached-comment CommentPopup,
// reached via CanvasModals.tsx -> CanvasClient.tsx) are now wired too, using
// guardCommentMutation(...) directly at every prop -- simpler than Clipart/
// Image's ternary, because COMMENT mode stays dormant for Note (no
// commentModeMutations branch to route through; see COMMENT_UI_CONTRACT_V1.md's
// "Live status"). NoteEditor.tsx's OTHER CommentPopup (the selected-text/
// anchored-thread popup) is explicitly out of scope and stays unwired --
// see the "Note anchored-thread comments stay out of scope" block below.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const FREEFORM_PATH = 'components/collabboard/canvas/ui/FreeformPadletCards.tsx';
const CANVAS_PATH = 'app/dashboard/canvas/[id]/CanvasClient.tsx';
const DRAFT_PATH = 'components/collabboard/editors/ClipartCardDraftModal.tsx';
const COMMENTS_DOMAIN_PATH = 'lib/domain/canvas/comments.ts';

const read = (path: string) => fs.readFileSync(path, 'utf8');

// Slices from a start anchor through the target CommentPopup element's own
// closing `/>` -- robust to exact byte-length differences between sites,
// same technique freeformCommentUIContract.characterization.test.tsx uses.
function commentPopupBlockAfter(src: string, startAnchor: string, fromIndex = 0): string {
  const start = src.indexOf(startAnchor, fromIndex);
  if (start === -1) throw new Error(`start anchor not found: ${startAnchor}`);
  const popupStart = src.indexOf('<CommentPopup', start);
  if (popupStart === -1) throw new Error(`no <CommentPopup after anchor: ${startAnchor}`);
  const end = src.indexOf('/>', popupStart);
  if (end === -1) throw new Error(`<CommentPopup did not close after anchor: ${startAnchor}`);
  return src.slice(start, end + 2);
}

// Props that stay 'manage'-only under the three-tier model (title editing,
// title styling, Badge Color) -- always wrapped with guardCommentMutation(
// directly, at every canonical caller, unchanged by PATCH 8O.2.
const PANEL_ONLY_PROPS = ['onCommentTitleChange=', 'onCommentTitleStyleChange='] as const;
// Props that mutate an EXISTING, specific comment -- 'manage' can touch any
// comment, 'comment' only its own (guardOwnCommentMutation), 'read' never.
const OWN_COMMENT_PROPS = ['onEditComment=', 'onRemoveComment=', 'onToggleCommentStrikethrough=', 'onCommentColor='] as const;

function expectPanelOnlyPropsGuarded(block: string, expectBadgeColor: boolean) {
  for (const prop of PANEL_ONLY_PROPS) {
    const propStart = block.indexOf(prop);
    expect(propStart, `${prop} must be present in this canonical caller block`).toBeGreaterThan(-1);
    const nextNonSpace = block.slice(propStart + prop.length).match(/^\s*\{?\s*(\S+)/);
    expect(nextNonSpace?.[1]?.startsWith('guardCommentMutation('), `${prop} must be wrapped with guardCommentMutation(...), found: ${nextNonSpace?.[0]}`).toBe(true);
  }
  if (expectBadgeColor) {
    const propStart = block.indexOf('onBadgeColorChange=');
    expect(propStart, 'onBadgeColorChange= must be present').toBeGreaterThan(-1);
    const nextNonSpace = block.slice(propStart + 'onBadgeColorChange='.length).match(/^\s*\{?\s*(\S+)/);
    expect(nextNonSpace?.[1]?.startsWith('guardCommentMutation(')).toBe(true);
  }
}

// FreeformPadletCards.tsx / CanvasClient.tsx (Drawing layout) sites: each of
// the 5 own-comment-capable props (submit + the 4 OWN_COMMENT_PROPS) is a
// ternary -- a 'comment'-mode branch routed through commentModeMutations
// (guardCommentComposition / guardOwnCommentMutation), falling back to the
// EXACT pre-8O.2 guardCommentMutation(...) body for 'manage' (byte-identical
// manage-mode requirement). Both branches must be present so neither an
// added 'comment' path nor a preserved 'manage' path can silently vanish.
function expectTernaryWiredCallSite(block: string, expectBadgeColor: boolean) {
  const submitStart = block.indexOf('onSubmit=');
  expect(submitStart, 'onSubmit= must be present').toBeGreaterThan(-1);
  const submitSlice = block.slice(submitStart, submitStart + 500);
  expect(submitSlice, 'onSubmit= must have a comment-mode branch using guardCommentComposition(').toContain('guardCommentComposition(commentAccessMode,');
  expect(submitSlice, 'onSubmit= must fall back to guardCommentMutation( for manage/read').toContain('guardCommentMutation(commentAccessMode,');

  for (const prop of OWN_COMMENT_PROPS) {
    const propStart = block.indexOf(prop);
    expect(propStart, `${prop} must be present`).toBeGreaterThan(-1);
    const slice = block.slice(propStart, propStart + 600);
    expect(slice, `${prop} must have a comment-mode branch using guardOwnCommentMutation(`).toContain('guardOwnCommentMutation(commentAccessMode,');
    expect(slice, `${prop} must fall back to guardCommentMutation( for manage/read`).toContain('guardCommentMutation(commentAccessMode,');
  }

  expectPanelOnlyPropsGuarded(block, expectBadgeColor);
}

// ClipartCardDraftModal.tsx: draft-local persistence (updateMetadata, not
// commentModeMutations -- see the modal's own props doc comment for why),
// so the guard is applied directly, no ternary.
function expectDraftModalWired(block: string) {
  const submitStart = block.indexOf('onSubmit=');
  expect(submitStart, 'onSubmit= must be present').toBeGreaterThan(-1);
  const submitNext = block.slice(submitStart + 'onSubmit='.length).match(/^\s*\{?\s*(\S+)/);
  expect(submitNext?.[1]?.startsWith('guardCommentComposition('), `onSubmit= must be wrapped with guardCommentComposition(...), found: ${submitNext?.[0]}`).toBe(true);

  for (const prop of OWN_COMMENT_PROPS) {
    const propStart = block.indexOf(prop);
    expect(propStart, `${prop} must be present`).toBeGreaterThan(-1);
    const nextNonSpace = block.slice(propStart + prop.length).match(/^\s*\{?\s*(\S+)/);
    expect(nextNonSpace?.[1]?.startsWith('guardOwnCommentMutation('), `${prop} must be wrapped with guardOwnCommentMutation(...), found: ${nextNonSpace?.[0]}`).toBe(true);
  }

  expectPanelOnlyPropsGuarded(block, false);
}

// PATCH 8P: Note's normal/detached CommentPopup sites -- onSubmit and the 4
// OWN_COMMENT_PROPS are wrapped directly with guardCommentMutation(...), NOT
// a ternary and NOT guardOwnCommentMutation/guardCommentComposition. This is
// deliberate, not a shortcut: COMMENT mode stays dormant for Note (no
// commentModeMutations wiring), so the only two reachable modes are 'read'
// and 'manage' -- guardCommentMutation alone (reject read, allow manage) is
// the complete, correct contract, matching the spec's explicit instruction
// to reuse guardCommentMutation and not invent Note-specific permission logic.
function expectManageOnlyWiredCallSite(block: string, expectTitleStyle: boolean) {
  const submitStart = block.indexOf('onSubmit=');
  expect(submitStart, 'onSubmit= must be present').toBeGreaterThan(-1);
  const submitNext = block.slice(submitStart + 'onSubmit='.length).match(/^\s*\{?\s*(\S+)/);
  expect(submitNext?.[1]?.startsWith('guardCommentMutation('), `onSubmit= must be wrapped with guardCommentMutation(...), found: ${submitNext?.[0]}`).toBe(true);

  for (const prop of OWN_COMMENT_PROPS) {
    const propStart = block.indexOf(prop);
    expect(propStart, `${prop} must be present`).toBeGreaterThan(-1);
    const nextNonSpace = block.slice(propStart + prop.length).match(/^\s*\{?\s*(\S+)/);
    expect(nextNonSpace?.[1]?.startsWith('guardCommentMutation('), `${prop} must be wrapped with guardCommentMutation(...), found: ${nextNonSpace?.[0]}`).toBe(true);
  }

  const titleStart = block.indexOf('onCommentTitleChange=');
  expect(titleStart, 'onCommentTitleChange= must be present').toBeGreaterThan(-1);
  const titleNext = block.slice(titleStart + 'onCommentTitleChange='.length).match(/^\s*\{?\s*(\S+)/);
  expect(titleNext?.[1]?.startsWith('guardCommentMutation('), `onCommentTitleChange= must be wrapped with guardCommentMutation(...), found: ${titleNext?.[0]}`).toBe(true);

  if (expectTitleStyle) {
    const styleStart = block.indexOf('onCommentTitleStyleChange=');
    expect(styleStart, 'onCommentTitleStyleChange= must be present').toBeGreaterThan(-1);
    const styleNext = block.slice(styleStart + 'onCommentTitleStyleChange='.length).match(/^\s*\{?\s*(\S+)/);
    expect(styleNext?.[1]?.startsWith('guardCommentMutation('), `onCommentTitleStyleChange= must be wrapped with guardCommentMutation(...), found: ${styleNext?.[0]}`).toBe(true);
  }

  const badgeStart = block.indexOf('onBadgeColorChange=');
  expect(badgeStart, 'onBadgeColorChange= must be present').toBeGreaterThan(-1);
  const badgeNext = block.slice(badgeStart + 'onBadgeColorChange='.length).match(/^\s*\{?\s*(\S+)/);
  expect(badgeNext?.[1]?.startsWith('guardCommentMutation('), `onBadgeColorChange= must be wrapped with guardCommentMutation(...), found: ${badgeNext?.[0]}`).toBe(true);
}

describe('PATCH 8O.1/8O.2 -- canonical comment permission wiring', () => {
  describe('CommentPopup.tsx exposes the access contract', () => {
    it('accepts an accessMode prop sourced from the shared three-tier CommentAccessMode type', () => {
      const popup = read('components/collabboard/editors/CommentPopup.tsx');
      expect(popup).toContain("import { canMutateComment, type CommentAccessMode } from '@/lib/domain/canvas/comments';");
      expect(popup).toContain('accessMode?: CommentAccessMode;');
      expect(popup).toContain("const isReadOnly = accessMode === 'read';");
      expect(popup).toContain("const canManagePanel = accessMode === 'manage';");
    });

    // Step 5 (PATCH 8O.1): "if somehow invoked programmatically while access
    // mode === read, NO mutation callback may fire." These functions are
    // component-internal closures (not exported), and every mounted-DOM path
    // that could reach them is ALSO gated at the UI-render level -- so with
    // the render gate in place, a mounted test cannot distinguish "internal
    // guard present" from "internal guard removed" (verified directly: with
    // the render gate intact, removing handleSubmit's own `if (isReadOnly)
    // return;` produced zero mounted-test failures). The internal guard is
    // still required defense-in-depth (a render-gate bug elsewhere must not
    // cascade into a live mutation), so it is asserted here structurally.
    it('every internal mutation function returns immediately when isReadOnly, as the very first statement', () => {
      const popup = read('components/collabboard/editors/CommentPopup.tsx');
      const guardedFunctions = [
        'const handleSubmit = () => {',
        'const handleEditCommit = () => {',
        'const applySelectedStrikethrough = useCallback(() => {',
        'const openLinkPopover = useCallback((commentId: string) => {',
        'const handleApplyLink = useCallback(() => {',
      ];
      for (const signature of guardedFunctions) {
        const start = popup.indexOf(signature);
        expect(start, `function not found: ${signature}`).toBeGreaterThan(-1);
        const bodyStart = start + signature.length;
        const firstStatement = popup.slice(bodyStart, bodyStart + 200).trim();
        expect(firstStatement.startsWith('if (isReadOnly) return;'), `${signature} must guard isReadOnly as its first statement, found: ${firstStatement.slice(0, 60)}`).toBe(true);
      }
      // applySelectedStyle takes a leading (type, color) signature -- checked separately.
      const applyStart = popup.indexOf("const applySelectedStyle = useCallback((type: 'color' | 'highlight', color: string) => {");
      expect(applyStart).toBeGreaterThan(-1);
      expect(popup.slice(applyStart, applyStart + 250)).toContain('if (isReadOnly) return;');
    });

    // PATCH 8O.2 -- title editing is now 'manage'-only (not merely
    // non-read), so its two internal guards moved from `isReadOnly` to
    // `!canManagePanel`. Checked separately from the isReadOnly block above
    // since these two are the ONLY internal guards that changed condition.
    it('title-editing internal guards use canManagePanel (manage-only), not isReadOnly alone', () => {
      const popup = read('components/collabboard/editors/CommentPopup.tsx');
      for (const signature of ['const startTitleEditing = () => {', 'const commitTitle = () => {']) {
        const start = popup.indexOf(signature);
        expect(start, `function not found: ${signature}`).toBeGreaterThan(-1);
        const bodyStart = start + signature.length;
        const firstStatement = popup.slice(bodyStart, bodyStart + 200).trim();
        expect(firstStatement.startsWith('if (!canManagePanel) return;'), `${signature} must guard !canManagePanel as its first statement, found: ${firstStatement.slice(0, 60)}`).toBe(true);
      }
    });

    // PATCH 8O.2 -- ownership defense-in-depth, same masking-risk rationale
    // as the isReadOnly block above: every mounted-DOM path to these
    // functions is ALSO gated by the render-level canManageThisRow/
    // canMutateCommentById checks, so a mounted test cannot distinguish
    // "internal ownership guard present" from "removed" once the render
    // gate is intact. Verified directly for negative controls A/B (this
    // patch's return report enumerates the exact repro). Structural check is
    // the only thing that catches a regression to this specific layer.
    it('every internal mutation function targeting a specific comment also guards ownership via canMutateCommentById', () => {
      const popup = read('components/collabboard/editors/CommentPopup.tsx');
      const ownershipGuardedFunctions = [
        { signature: 'const handleEditCommit = () => {', needle: 'if (!canMutateCommentById(editingCommentId)) return;' },
        { signature: "const applySelectedStyle = useCallback((type: 'color' | 'highlight', color: string) => {", needle: 'if (!canMutateCommentById(selection.commentId)) return;' },
        { signature: 'const applySelectedStrikethrough = useCallback(() => {', needle: 'if (!canMutateCommentById(selection.commentId)) return;' },
        { signature: 'const openLinkPopover = useCallback((commentId: string) => {', needle: 'if (!canMutateCommentById(commentId)) return;' },
        { signature: 'const handleApplyLink = useCallback(() => {', needle: 'if (!canMutateCommentById(linkPopoverCommentId)) return;' },
      ];
      for (const { signature, needle } of ownershipGuardedFunctions) {
        const start = popup.indexOf(signature);
        expect(start, `function not found: ${signature}`).toBeGreaterThan(-1);
        const body = popup.slice(start, start + 700);
        expect(body, `${signature} must guard ownership via: ${needle}`).toContain(needle);
      }
      // The per-row color-popup's onSelectColor/onSelectHighlight handlers
      // also call directly into onCommentColor -- guarded independently.
      // Both signatures appear twice in this file (the OverlayLayer
      // text-span color picker's handlers at the top of the component use
      // the same block-arrow shape but are explicitly out of scope -- see
      // this file's own "Out of scope" note); lastIndexOf reaches the
      // per-row one, which is declared later.
      for (const signature of ['onSelectColor={(color) => {', 'onSelectHighlight={(color) => {']) {
        const start = popup.lastIndexOf(signature);
        expect(start, `handler not found: ${signature}`).toBeGreaterThan(-1);
        const body = popup.slice(start, start + 200);
        expect(body, `${signature} must guard ownership via canMutateCommentById(target.id)`).toContain('if (!canMutateCommentById(target.id)) return;');
      }
    });

    // Complements the internal-function guards above: these are the JSX
    // render-condition gates that actually keep mutation UI out of the DOM
    // (not disabled -- absent, so not keyboard/tab reachable). Verified
    // directly that each is independently load-bearing: with the matching
    // internal function guard still in place, removing any ONE of these
    // outer gates alone produces zero mounted-test failures (the inner guard
    // masks it) -- so this structural check is the only thing that catches a
    // regression to this specific layer.
    it('every panel-level mutation-affording render condition uses canManagePanel (manage-only)', () => {
      const popup = read('components/collabboard/editors/CommentPopup.tsx');
      const requiredGateSnippets = [
        // Title editing entry point (the h4's onClick).
        'onClick={canManagePanel && onCommentTitleChange ? startTitleEditing : undefined}',
        // The titleEditing input itself never renders unless 'manage'.
        '{canManagePanel && titleEditing ? (',
        // Title style button.
        '{canManagePanel && titleEditing && onCommentTitleStyleChange && (',
        // Badge Color button.
        '{canManagePanel && onBadgeColorChange && (',
        // Badge Color palette popup.
        '{canManagePanel && badgeColorPickerOpen && onBadgeColorChange && (',
        // Title style popup portal.
        'const titleStylePortal = canManagePanel && titleStyleOpen && onCommentTitleStyleChange',
      ];
      for (const snippet of requiredGateSnippets) {
        expect(popup, `missing manage-only mutation-UI gate: ${snippet}`).toContain(snippet);
      }
    });

    it('per-comment mutation-affording render conditions use isReadOnly (comment mode may still act on OWN comments)', () => {
      const popup = read('components/collabboard/editors/CommentPopup.tsx');
      const requiredGateSnippets = [
        // Per-comment color popover portal render gate.
        '{!isReadOnly && commentColorPopupId && onCommentColor && (() => {',
        // Per-comment link popover portal render gate.
        '{!isReadOnly && linkPopoverCommentId && createPortal(',
        // Composer + Send.
        '{!hideComposer && !isReadOnly && (',
      ];
      for (const snippet of requiredGateSnippets) {
        expect(popup, `missing mutation-UI gate: ${snippet}`).toContain(snippet);
      }
      // isEditing/hasReadOnlySelection are forced false in read mode, which
      // makes the whole edit-mode body (not just the action rail) and the
      // whole selection-driven action row unreachable regardless of stale
      // editingCommentId/readOnlySelection state.
      expect(popup).toContain('const isEditing = !isReadOnly && editingCommentId === comment.id;');
      expect(popup).toContain('const hasReadOnlySelection = !isReadOnly && enableCanonicalSelectionStyling && (');
    });

    // PATCH 8O.2 -- the whole per-row actions rail (Edit/Color/Link/
    // Strikethrough/Delete) now renders only for a comment this user can
    // actually mutate: unconditionally for 'manage', ownership-gated for
    // 'comment', never for 'read'. This single render gate is what makes
    // negative controls A/B (another user's Edit/Delete becoming reachable)
    // fail without needing a mounted test to catch it -- the row for
    // another user's comment has NO actions column at all.
    it('the whole per-row actions rail is gated by canManageThisRow, ownership-aware for comment mode', () => {
      const popup = read('components/collabboard/editors/CommentPopup.tsx');
      expect(popup).toContain("const canManageThisRow = !isReadOnly && (accessMode !== 'comment' || canMutateCommentById(comment.id));");
      expect(popup).toContain('{canManageThisRow && (');
      // Every individual button inside the rail ALSO re-checks ownership
      // (defense-in-depth against the same class of render-gate-only bug
      // 8O.1 guarded against for isReadOnly). Checked via the pencil Edit
      // button's onClick (the SECOND setEditingCommentId(comment.id) call --
      // the first is the row's onDoubleClick, which has its own pre-existing
      // raw ownership check unrelated to this patch).
      const editButtonStart = popup.lastIndexOf('setEditingCommentId(comment.id);');
      expect(editButtonStart, 'pencil Edit button onClick not found').toBeGreaterThan(-1);
      const editButtonHandler = popup.slice(Math.max(0, editButtonStart - 200), editButtonStart);
      expect(editButtonHandler, 'pencil Edit button must guard ownership via canMutateCommentById(comment.id)').toContain('if (!canMutateCommentById(comment.id)) return;');
    });
  });

  describe('lib/domain/canvas/comments.ts exports the access contract', () => {
    it('exports the three-tier CommentAccessMode plus ownership + guard functions', () => {
      const domain = read(COMMENTS_DOMAIN_PATH);
      expect(domain).toContain("export type CommentAccessMode = 'read' | 'comment' | 'manage';");
      expect(domain).toContain('export function resolveCommentAccessMode(');
      expect(domain).toContain('export function isOwnComment(');
      expect(domain).toContain('export function canMutateComment(');
      expect(domain).toContain('export function guardCommentMutation<');
      expect(domain).toContain('export function guardCommentComposition<');
      expect(domain).toContain('export function guardOwnCommentMutation<');
    });

    it("resolveCommentAccessMode maps BoardPermission 'commenter' to 'comment'", () => {
      const domain = read(COMMENTS_DOMAIN_PATH);
      expect(domain).toContain("if (boardPermission === 'commenter') return 'comment';");
    });
  });

  describe('Clipart -- editor modal (Path A)', () => {
    it('ClipartCardDraftModal.tsx accepts commentAccessMode + real currentUserId/currentUserName and forwards them', () => {
      const draft = read(DRAFT_PATH);
      expect(draft).toContain("import { guardCommentMutation, guardCommentComposition, guardOwnCommentMutation, type CommentAccessMode } from '@/lib/domain/canvas/comments';");
      expect(draft).toContain('commentAccessMode?: CommentAccessMode;');
      expect(draft).toContain("commentAccessMode = 'manage',");
      expect(draft).toContain('currentUserId?: string;');
      expect(draft).toContain("currentUserId = 'anon',");
      expect(draft).toContain('const draftCommentUserId = currentUserId;');
      const block = commentPopupBlockAfter(draft, '<CommentPopup');
      expect(block).toContain('accessMode={commentAccessMode}');
      expectDraftModalWired(block);
    });

    it('CanvasClient.tsx passes the real authenticated user into ClipartCardDraftModal, not a hardcoded literal', () => {
      const canvas = read(CANVAS_PATH);
      expect(canvas).toContain("currentUserId={user?.id || 'anon'}");
      expect(canvas).toContain("currentUserName={user?.email?.split('@')[0] || 'You'}");
    });
  });

  describe('Clipart -- saved Site B (on-canvas)', () => {
    it('is wired with accessMode and every mutation callback guarded (ternary comment/manage branches)', () => {
      const freeform = read(FREEFORM_PATH);
      const block = commentPopupBlockAfter(freeform, 'cardCommentPopupPadletId === padlet.id && !cardToolbarPadletId');
      expect(block).toContain('accessMode={commentAccessMode}');
      expectTernaryWiredCallSite(block, false);
    });
  });

  describe('Image -- three live canonical entry points', () => {
    it('Freeform on-canvas badge popup is wired with accessMode and guarded callbacks (incl. Badge Color)', () => {
      const freeform = read(FREEFORM_PATH);
      const block = commentPopupBlockAfter(freeform, 'cardCommentPopupPadletId === padlet.id && !imageToolbarPadletId');
      expect(block).toContain('accessMode={commentAccessMode}');
      expectTernaryWiredCallSite(block, true);
    });

    it('Freeform image-toolbar popup is wired with accessMode and guarded callbacks (incl. Badge Color)', () => {
      const freeform = read(FREEFORM_PATH);
      const block = commentPopupBlockAfter(freeform, 'activeImageToolbarPadlet && cardCommentPopupPadletId === activeImageToolbarPadlet.id');
      expect(block).toContain('accessMode={commentAccessMode}');
      expectTernaryWiredCallSite(block, true);
    });

    it('non-Freeform (Drawing layout) image-toolbar popup in CanvasClient.tsx is wired with accessMode and guarded callbacks', () => {
      const canvas = read(CANVAS_PATH);
      const block = commentPopupBlockAfter(canvas, 'Drawing image toolbar');
      expect(block).toContain('accessMode={commentAccessMode}');
      expectTernaryWiredCallSite(block, true);
    });
  });

  describe('FreeformPadletCards.tsx receives and threads the resolved access mode + comment-mode persistence', () => {
    it('accepts commentAccessMode and commentModeMutations on its props interface', () => {
      const freeform = read(FREEFORM_PATH);
      expect(freeform).toContain("import { guardCommentMutation, guardCommentComposition, guardOwnCommentMutation, type CommentAccessMode } from '@/lib/domain/canvas/comments';");
      expect(freeform).toContain("import type { CommentModeMutations } from '@/lib/infra/canvas/commentMutations';");
      expect(freeform).toContain('commentAccessMode?: CommentAccessMode;');
      expect(freeform).toContain("commentAccessMode = 'manage',");
      expect(freeform).toContain('commentModeMutations?: CommentModeMutations;');
    });

    it('usage counts of the four guard functions match exactly the in-scope sites', () => {
      const freeform = read(FREEFORM_PATH);
      // Image on-canvas (8 guardCommentMutation: title, titleStyle, badge, +
      // 5 manage-branch fallbacks for submit/edit/remove/toggle/color) +
      // Clipart Site B (7: same minus badge) + Image toolbar (8) = 23,
      // unchanged from 8O.1 -- the manage-mode fallback body is untouched,
      // just now reached via a ternary instead of directly. PATCH 8P adds
      // Note's 2 sites x 8 (all 8 props direct-wrapped, no ternary since
      // COMMENT stays dormant for Note) = 16. 23 + 16 = 39. PATCH 8S adds
      // Todo's 1 on-canvas site x 8 (same direct-wrap pattern, COMMENT stays
      // dormant for Todo too) = 8. 39 + 8 = 47. PATCH 8U adds Link's 1
      // on-canvas site x 8 (same direct-wrap pattern, COMMENT stays dormant
      // for Link too) = 8. 47 + 8 = 55. PATCH 8V adds Table's 1 on-canvas
      // site x 8 (same direct-wrap pattern, COMMENT stays dormant for Table
      // too) = 8. 55 + 8 = 63. PATCH 8Z adds Comment post's two LIVE
      // on-canvas primary-thread surfaces (CommentPost is Category B/SPECIAL,
      // not a CommentPopup site, but every mutation callback is still
      // guardCommentMutation-wrapped the same way): the CommentPost call
      // site (6: onTitleChange/onAddComment/onEditComment/
      // onToggleCommentStrikethrough/onDeleteComment/onUpdateCommentColor)
      // + the dead internal badge-color swatch (1, defensively guarded even
      // though unreachable) + the collapsed-marker block (9: badge trigger,
      // badge swatch, per-comment color/highlight x2, Color/Edit/
      // Strikethrough/Delete row actions x4, composer) = 16. 63 + 16 = 79.
      expect((freeform.match(/guardCommentMutation\(/g) ?? []).length).toBe(79);
      // 4 ownership-gated callbacks (edit/remove/toggle/color) x 3
      // COMMENT-capable sites (Clipart Site B, Image x2) = 12 -- Note does
      // NOT use this guard (COMMENT stays dormant there), so unchanged by 8P.
      expect((freeform.match(/guardOwnCommentMutation\(/g) ?? []).length).toBe(12);
      // 1 composition-gated callback (submit) x 3 COMMENT-capable sites = 3 --
      // unchanged by 8P for the same reason.
      expect((freeform.match(/guardCommentComposition\(/g) ?? []).length).toBe(3);
    });
  });

  describe('CanvasClient.tsx is the controller boundary -- resolves the mode once and threads it down', () => {
    it('computes commentAccessMode via resolveCommentAccessMode(currentWorkspaceRole)', () => {
      const canvas = read(CANVAS_PATH);
      expect(canvas).toContain("import { resolveCommentAccessMode, guardCommentMutation, guardCommentComposition, guardOwnCommentMutation } from '@/lib/domain/canvas/comments';");
      expect(canvas).toContain('resolveCommentAccessMode(currentWorkspaceRole)');
    });

    // PATCH 8O.2a follow-up (2026-08-12): CanvasClient no longer calls
    // get_board_permission. That RPC is scoped to the nav-orphaned
    // `canvases`/`canvas_collaborators` schema (zero live rows, see
    // .fable5/docs/CURRENT_TASK.md's PATCH-022 census and
    // LESSONS_LEARNED.md) and always errored against the live `boards`
    // system -- confirmed live via a real authenticated request returning
    // PostgREST 42703 "column canvases.workspace_id does not exist".
    // Calling it provided zero real signal (currentBoardPermission always
    // resolved to null) while spamming console.error on every canvas load,
    // so the dead call was removed rather than kept as silent scaffolding.
    it('does NOT call the dead-schema get_board_permission RPC', () => {
      const canvas = read(CANVAS_PATH);
      expect(canvas).not.toContain("supabase.rpc('get_board_permission'");
      expect(canvas).not.toContain('currentBoardPermission');
      expect(canvas).not.toContain('setCurrentBoardPermission');
    });

    it('creates commentModeMutations once via lib/infra/canvas/commentMutations.ts and threads it to FreeformPadletCards', () => {
      const canvas = read(CANVAS_PATH);
      expect(canvas).toContain("import { createCommentModeMutations } from '@/lib/infra/canvas/commentMutations';");
      expect(canvas).toContain('createCommentModeMutations({ supabase, setPadlets })');
      expect(canvas).toContain('commentModeMutations={commentModeMutations}');
    });

    it('passes the resolved mode down to both FreeformPadletCards and ClipartCardDraftModal', () => {
      const canvas = read(CANVAS_PATH);
      const matches = canvas.match(/commentAccessMode=\{commentAccessMode\}/g) ?? [];
      // <FreeformPadletCards commentAccessMode=...> and <ClipartCardDraftModal commentAccessMode=...>
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });

    it('CommentPopup itself never resolves permission -- no auth/database query inside the canonical component', () => {
      const popup = read('components/collabboard/editors/CommentPopup.tsx');
      expect(popup).not.toContain('supabase');
      expect(popup).not.toContain('createClient');
      expect(popup).not.toContain('useAuth');
    });
  });

  describe('Note -- two detached-comment entry points in FreeformPadletCards.tsx (PATCH 8P)', () => {
    it('on-canvas badge popup is wired with accessMode and guarded callbacks (manage-only, no COMMENT-mode branch)', () => {
      const freeform = read(FREEFORM_PATH);
      const firstNoteAnchor = 'Note detached comments use the canonical panel; this shell only owns placement and close state.';
      const block = commentPopupBlockAfter(freeform, firstNoteAnchor);
      expect(block).toContain('accessMode={commentAccessMode}');
      expect(block).not.toContain('guardOwnCommentMutation(');
      expect(block).not.toContain('guardCommentComposition(');
      expect(block).not.toContain('commentModeMutations');
      expectManageOnlyWiredCallSite(block, true);
    });

    it('toolbar popup is wired with accessMode and guarded callbacks (manage-only, no COMMENT-mode branch)', () => {
      const freeform = read(FREEFORM_PATH);
      const secondNoteAnchor = 'Note detached comments use the canonical panel; this toolbar shell owns placement only.';
      const block = commentPopupBlockAfter(freeform, secondNoteAnchor);
      expect(block).toContain('accessMode={commentAccessMode}');
      expect(block).not.toContain('guardOwnCommentMutation(');
      expect(block).not.toContain('guardCommentComposition(');
      expect(block).not.toContain('commentModeMutations');
      expectManageOnlyWiredCallSite(block, true);
    });
  });

  describe('Note -- NoteEditor.tsx own detached-comment CommentPopup, threaded via CanvasModals.tsx (PATCH 8P)', () => {
    it('NoteEditor.tsx accepts an accessMode prop and wires only the detached/Category-A CommentPopup with it', () => {
      const noteEditor = read('components/collabboard/editors/NoteEditor.tsx');
      expect(noteEditor).toContain("import { guardCommentMutation, type CommentAccessMode } from '@/lib/domain/canvas/comments';");
      expect(noteEditor).toContain('accessMode?: CommentAccessMode;');
      expect(noteEditor).toContain("accessMode = 'manage',");
      const block = commentPopupBlockAfter(noteEditor, '{panels.open.detached && (');
      expect(block).toContain('accessMode={accessMode}');
      const submitStart = block.indexOf('onSubmit=');
      expect(submitStart).toBeGreaterThan(-1);
      const submitNext = block.slice(submitStart + 'onSubmit='.length).match(/^\s*\{?\s*(\S+)/);
      expect(submitNext?.[1]?.startsWith('guardCommentMutation(')).toBe(true);
      for (const prop of OWN_COMMENT_PROPS) {
        const propStart = block.indexOf(prop);
        expect(propStart, `${prop} must be present`).toBeGreaterThan(-1);
        const nextNonSpace = block.slice(propStart + prop.length).match(/^\s*\{?\s*(\S+)/);
        expect(nextNonSpace?.[1]?.startsWith('guardCommentMutation(')).toBe(true);
      }
    });

    // PATCH 8P.1: real identity + canonical title wiring, Category A only.
    it('uses real currentUserId/currentUserName props at the Category A site, not the historical "user1"/"R" placeholder', () => {
      const noteEditor = read('components/collabboard/editors/NoteEditor.tsx');
      expect(noteEditor).toContain('currentUserId?: string;');
      expect(noteEditor).toContain('currentUserName?: string;');
      expect(noteEditor).toContain("currentUserId = 'anon',");
      expect(noteEditor).toContain("currentUserName = 'You',");
      const block = commentPopupBlockAfter(noteEditor, '{panels.open.detached && (');
      expect(block).toContain('userId: currentUserId,');
      expect(block).toContain('userName: currentUserName,');
      expect(block).toContain('currentUserId={currentUserId}');
      expect(block).toContain('currentUserName={currentUserName}');
      expect(block).not.toContain('userId: \'user1\'');
      expect(block).not.toContain('currentUserId="user1"');
    });

    it('wires commentTitle/commentTitleStyle to real state, guarded, at the Category A site', () => {
      const noteEditor = read('components/collabboard/editors/NoteEditor.tsx');
      const block = commentPopupBlockAfter(noteEditor, '{panels.open.detached && (');
      expect(block).toContain('commentTitle={commentTitle}');
      expect(block).toContain('commentTitleStyle={');
      expect(block).not.toContain('commentTitle={undefined}');
      const titleChangeStart = block.indexOf('onCommentTitleChange=');
      expect(titleChangeStart).toBeGreaterThan(-1);
      const titleChangeNext = block.slice(titleChangeStart + 'onCommentTitleChange='.length).match(/^\s*\{?\s*(\S+)/);
      expect(titleChangeNext?.[1]?.startsWith('guardCommentMutation(')).toBe(true);
      const titleStyleChangeStart = block.indexOf('onCommentTitleStyleChange=');
      expect(titleStyleChangeStart).toBeGreaterThan(-1);
      const titleStyleChangeNext = block.slice(titleStyleChangeStart + 'onCommentTitleStyleChange='.length).match(/^\s*\{?\s*(\S+)/);
      expect(titleStyleChangeNext?.[1]?.startsWith('guardCommentMutation(')).toBe(true);
    });

    it('PATCH 8AB: the OTHER CommentPopup in NoteEditor.tsx (selected-text/anchored-thread popup) is now wired with accessMode, guards, and real identity', () => {
      const noteEditor = read('components/collabboard/editors/NoteEditor.tsx');
      const block = commentPopupBlockAfter(noteEditor, '{panels.open.comment && (');
      expect(block).toContain('accessMode={anchoredAccessMode}');
      expect(block).toContain('onRemoveThread');
      expect(block).toContain('highlightColor={activeThread?.color}');
      expect(block).toContain('currentUserId={currentUserId}');
      expect(block).toContain('currentUserName={currentUserName}');
      expect(block).not.toContain('currentUserId="user1"');
      expect(block).not.toContain('currentUserName="R"');
      for (const prop of ['onSubmit=', 'onEditComment=', 'onRemoveComment=', 'onRemoveThread=', 'onToggleCommentStrikethrough=', 'onColor=', 'onCommentColor=']) {
        const propStart = block.indexOf(prop);
        expect(propStart, `${prop} must be present`).toBeGreaterThan(-1);
        const nextNonSpace = block.slice(propStart + prop.length).match(/^\s*\{?\s*(\S+)/);
        expect(nextNonSpace?.[1]?.startsWith('guardCommentMutation(anchoredAccessMode,'), `${prop} must be wrapped with guardCommentMutation(anchoredAccessMode, ...), found: ${nextNonSpace?.[0]}`).toBe(true);
      }
    });

    it('CanvasModals.tsx threads commentAccessMode from CanvasClient.tsx into NoteEditor as accessMode', () => {
      const canvasModals = read('components/collabboard/canvas/ui/CanvasModals.tsx');
      expect(canvasModals).toContain("import type { CommentAccessMode } from '@/lib/domain/canvas/comments';");
      expect(canvasModals).toContain('commentAccessMode?: CommentAccessMode;');
      expect(canvasModals).toContain("commentAccessMode = 'manage',");
      // No <CommentPopup lives inline in CanvasModals.tsx (NoteEditor owns its
      // own internally) -- slice the <NoteEditor element itself instead of
      // reusing commentPopupBlockAfter, which looks for a <CommentPopup anchor.
      const noteEditorStart = canvasModals.indexOf('<NoteEditor');
      const noteEditorEnd = canvasModals.indexOf('/>', canvasModals.indexOf('initialTitle=', noteEditorStart));
      const noteEditorBlock = canvasModals.slice(noteEditorStart, noteEditorEnd);
      expect(noteEditorBlock).toContain('accessMode={commentAccessMode}');
    });

    it('CanvasModals.tsx passes real user identity and persisted commentTitle/commentTitleStyle into NoteEditor', () => {
      const canvasModals = read('components/collabboard/canvas/ui/CanvasModals.tsx');
      const noteEditorStart = canvasModals.indexOf('<NoteEditor');
      const noteEditorEnd = canvasModals.indexOf('/>', canvasModals.indexOf('initialTitle=', noteEditorStart));
      const noteEditorBlock = canvasModals.slice(noteEditorStart, noteEditorEnd);
      expect(noteEditorBlock).toContain("currentUserId={user?.id || 'anon'}");
      expect(noteEditorBlock).toContain("currentUserName={user?.email?.split('@')[0] || 'You'}");
      expect(noteEditorBlock).toContain('initialCommentTitle=');
      expect(noteEditorBlock).toContain('initialCommentTitleStyle=');
    });

    it('CanvasClient.tsx passes commentAccessMode into CanvasModals', () => {
      const canvas = read(CANVAS_PATH);
      expect(canvas).toContain('commentAccessMode={commentAccessMode}');
    });
  });

  describe('Todo -- on-canvas entry point in FreeformPadletCards.tsx (PATCH 8S)', () => {
    it('is wired with accessMode and guarded callbacks (manage-only, no COMMENT-mode branch), migrated off the local hand-rolled implementation', () => {
      const freeform = read(FREEFORM_PATH);
      const anchor = 'Todo detached comments use the canonical panel; this shell only owns placement and close state (PATCH 8S';
      const block = commentPopupBlockAfter(freeform, anchor);
      expect(block).toContain('accessMode={commentAccessMode}');
      expect(block).not.toContain('guardOwnCommentMutation(');
      expect(block).not.toContain('guardCommentComposition(');
      expect(block).not.toContain('commentModeMutations');
      expectManageOnlyWiredCallSite(block, true);
    });

    it('the panel wrapper stops click/mousedown propagation so a comment-row click cannot bubble to the Todo card (checkbox toggle / closeAllToolbars)', () => {
      const freeform = read(FREEFORM_PATH);
      const anchor = 'Todo detached comments use the canonical panel; this shell only owns placement and close state (PATCH 8S';
      const anchorStart = freeform.indexOf(anchor);
      const popupStart = freeform.indexOf('<CommentPopup', anchorStart);
      const wrapperStart = freeform.lastIndexOf('<div', popupStart);
      const wrapperSlice = freeform.slice(wrapperStart, popupStart);
      expect(wrapperSlice).toContain('onClick={(e) => e.stopPropagation()}');
      expect(wrapperSlice).toContain('onMouseDown={(e) => e.stopPropagation()}');
    });

    it('the padlet.type === "todo" branch no longer contains the local hand-rolled comment row/composer JSX', () => {
      const freeform = read(FREEFORM_PATH);
      // Scoped to the Todo branch specifically: a copy-pasted, MISLABELED
      // "Todo Comments Popup - Right side" comment also exists (unchanged,
      // out of scope) inside the actual "Comment" post family's own branch
      // elsewhere in this file, so a whole-file substring check would give a
      // false negative here -- narrow to padlet.type === 'todo' ... padlet.type === 'container'.
      const todoStart = freeform.indexOf("if (padlet.type === 'todo') {");
      const todoEnd = freeform.indexOf("if (padlet.type === 'container') {", todoStart);
      expect(todoStart).toBeGreaterThan(-1);
      expect(todoEnd).toBeGreaterThan(todoStart);
      const todoBranch = freeform.slice(todoStart, todoEnd);
      expect(todoBranch).not.toContain('Todo Comments Popup - Right side');
      expect(todoBranch).not.toContain('editingCardCommentText');
      expect(todoBranch).not.toContain('No comments yet');
    });
  });

  describe('Todo -- TodoEditor.tsx own detached-comment CommentPopup, threaded via CanvasModals.tsx (PATCH 8S)', () => {
    it('TodoEditor.tsx accepts an accessMode prop and wires its single CommentPopup with it, migrated off the local hand-rolled implementation', () => {
      const todoEditor = read('components/collabboard/editors/TodoEditor.tsx');
      expect(todoEditor).toContain("import { guardCommentMutation, type CommentAccessMode } from '@/lib/domain/canvas/comments';");
      expect(todoEditor).toContain("import CommentPopup from './CommentPopup';");
      expect(todoEditor).toContain('accessMode?: CommentAccessMode;');
      expect(todoEditor).toContain("accessMode = 'manage',");
      const total = (todoEditor.match(/<CommentPopup/g) ?? []).length;
      expect(total, 'TodoEditor.tsx must have exactly one CommentPopup usage').toBe(1);
      const block = commentPopupBlockAfter(todoEditor, '<CommentPopup');
      expect(block).toContain('accessMode={accessMode}');
      expectManageOnlyWiredCallSite(block, true);
    });

    it('uses real currentUserId/currentUserName props, not the historical "user1"/"You" literal', () => {
      const todoEditor = read('components/collabboard/editors/TodoEditor.tsx');
      expect(todoEditor).toContain('currentUserId?: string;');
      expect(todoEditor).toContain('currentUserName?: string;');
      expect(todoEditor).toContain("currentUserId = 'anon',");
      expect(todoEditor).toContain("currentUserName = 'You',");
      const block = commentPopupBlockAfter(todoEditor, '<CommentPopup');
      expect(block).toContain('userId: currentUserId,');
      expect(block).toContain('userName: currentUserName,');
      expect(block).toContain('currentUserId={currentUserId}');
      expect(block).toContain('currentUserName={currentUserName}');
      expect(block).not.toContain("userId: 'user1'");
    });

    it('wires commentTitle/commentTitleStyle to real state, guarded', () => {
      const todoEditor = read('components/collabboard/editors/TodoEditor.tsx');
      const block = commentPopupBlockAfter(todoEditor, '<CommentPopup');
      expect(block).toContain('commentTitle={commentTitle}');
      expect(block).toContain('commentTitleStyle={');
      const titleChangeStart = block.indexOf('onCommentTitleChange=');
      expect(titleChangeStart).toBeGreaterThan(-1);
      const titleChangeNext = block.slice(titleChangeStart + 'onCommentTitleChange='.length).match(/^\s*\{?\s*(\S+)/);
      expect(titleChangeNext?.[1]?.startsWith('guardCommentMutation(')).toBe(true);
    });

    it('no local hand-rolled Todo comment row/composer/color-popup JSX remains in TodoEditor.tsx', () => {
      const todoEditor = read('components/collabboard/editors/TodoEditor.tsx');
      expect(todoEditor).not.toContain('getTimeAgo');
      expect(todoEditor).not.toContain('renderTextWithLinks');
      expect(todoEditor).not.toContain('commentColorPopupId');
      expect(todoEditor).not.toContain('editingCommentId');
    });

    it('CanvasModals.tsx threads commentAccessMode + real identity + persisted commentTitle/commentTitleStyle into TodoEditor', () => {
      const canvasModals = read('components/collabboard/canvas/ui/CanvasModals.tsx');
      const todoEditorStart = canvasModals.indexOf('<TodoEditor');
      const todoEditorEnd = canvasModals.indexOf('/>', canvasModals.indexOf('boardId=', todoEditorStart));
      const todoEditorBlock = canvasModals.slice(todoEditorStart, todoEditorEnd);
      expect(todoEditorBlock).toContain('accessMode={commentAccessMode}');
      expect(todoEditorBlock).toContain("currentUserId={user?.id || 'anon'}");
      expect(todoEditorBlock).toContain("currentUserName={user?.email?.split('@')[0] || 'You'}");
      expect(canvasModals).toContain('commentTitle: typeof padletToEdit.metadata.commentTitle');
      expect(canvasModals).toContain('commentTitleStyle: padletToEdit.metadata.commentTitleStyle');
    });
  });

  describe('Drawing -- DrawingEditor.tsx own detached-comment CommentPopup, threaded via CanvasModals.tsx (PATCH 8R)', () => {
    it('DrawingEditor.tsx accepts an accessMode prop and wires its single CommentPopup with it', () => {
      const drawingEditor = read('components/collabboard/editors/DrawingEditor.tsx');
      expect(drawingEditor).toContain("import { guardCommentMutation, type CommentAccessMode } from '@/lib/domain/canvas/comments';");
      expect(drawingEditor).toContain('accessMode?: CommentAccessMode;');
      expect(drawingEditor).toContain("accessMode = 'manage',");
      const block = commentPopupBlockAfter(drawingEditor, '<CommentPopup');
      expect(block).toContain('accessMode={accessMode}');
      expectManageOnlyWiredCallSite(block, true);
    });

    it('uses real currentUserId/currentUserName props, not the historical "anon"/"You" literal', () => {
      const drawingEditor = read('components/collabboard/editors/DrawingEditor.tsx');
      expect(drawingEditor).toContain('currentUserId?: string;');
      expect(drawingEditor).toContain('currentUserName?: string;');
      expect(drawingEditor).toContain("currentUserId = 'anon',");
      expect(drawingEditor).toContain("currentUserName = 'You',");
      const block = commentPopupBlockAfter(drawingEditor, '<CommentPopup');
      expect(block).toContain('userId: currentUserId,');
      expect(block).toContain('userName: currentUserName,');
      expect(block).toContain('currentUserId={currentUserId}');
      expect(block).toContain('currentUserName={currentUserName}');
      expect(block).not.toContain('userId: \'anon\'');
      expect(block).not.toContain('currentUserId="anon"');
    });

    it('wires commentTitle/commentTitleStyle to real state, guarded', () => {
      const drawingEditor = read('components/collabboard/editors/DrawingEditor.tsx');
      const block = commentPopupBlockAfter(drawingEditor, '<CommentPopup');
      expect(block).toContain('commentTitle={commentTitle}');
      expect(block).toContain('commentTitleStyle={');
      const titleChangeStart = block.indexOf('onCommentTitleChange=');
      expect(titleChangeStart).toBeGreaterThan(-1);
      const titleChangeNext = block.slice(titleChangeStart + 'onCommentTitleChange='.length).match(/^\s*\{?\s*(\S+)/);
      expect(titleChangeNext?.[1]?.startsWith('guardCommentMutation(')).toBe(true);
    });

    // The Comment button/badge/panel used to live inside the same
    // `{!readOnly && (...)}` block as Text style/Color/Reaction/Caption,
    // which made it (and the ability to even see a comment count) entirely
    // unreachable in the read-only lightbox. PATCH 8R pulled it out so READ
    // can see the count and read comments; the other four stay hidden in
    // read-only since they are unrelated to comments and out of this
    // patch's scope.
    it('the Comment toolbar entry is reachable regardless of readOnly; Text/Color/Reaction/Caption remain readOnly-gated', () => {
      const drawingEditor = read('components/collabboard/editors/DrawingEditor.tsx');
      const toolbarStart = drawingEditor.indexOf('Left toolbar -- Text style/Color/Reaction/Comment/Caption');
      expect(toolbarStart).toBeGreaterThan(-1);
      const commentBlockStart = drawingEditor.indexOf("onClick={() => openDetachedPanel('comment', isCommentPanelOpen)}", toolbarStart);
      expect(commentBlockStart).toBeGreaterThan(-1);
      const captionBlockStart = drawingEditor.indexOf("onClick={() => togglePanel('caption')}", commentBlockStart);
      expect(captionBlockStart).toBeGreaterThan(-1);
      // The Text/Color/Reaction fragment opened by {!readOnly && ( must
      // already be closed (</> then a bare `)}`) before the Comment button
      // -- i.e. the gate does not wrap the Comment block.
      const betweenToolbarAndComment = drawingEditor.slice(toolbarStart, commentBlockStart);
      expect(betweenToolbarAndComment, 'the {!readOnly && ( fragment wrapping Text/Color/Reaction must close before the Comment button').toContain('</>\n                    )}');
      // Caption stays individually gated.
      const betweenCommentAndCaption = drawingEditor.slice(commentBlockStart, captionBlockStart);
      expect(betweenCommentAndCaption).toContain('{!readOnly && (');
    });

    it('DrawingEditor.tsx has exactly 1 <CommentPopup usage (no duplicate/local comment implementation)', () => {
      const drawingEditor = read('components/collabboard/editors/DrawingEditor.tsx');
      const total = (drawingEditor.match(/<CommentPopup/g) ?? []).length;
      expect(total).toBe(1);
    });

    it('the Comment panel portal wrapper stops click propagation (interaction isolation, unchanged by this patch)', () => {
      const drawingEditor = read('components/collabboard/editors/DrawingEditor.tsx');
      const block = commentPopupBlockAfter(drawingEditor, '<CommentPopup');
      const wrapperStart = drawingEditor.lastIndexOf('<div', drawingEditor.indexOf(block));
      const wrapperSlice = drawingEditor.slice(wrapperStart, drawingEditor.indexOf(block));
      expect(wrapperSlice).toContain('onClick={(e) => e.stopPropagation()}');
    });

    it('CanvasModals.tsx threads commentAccessMode + real identity into both DrawingEditor instances (edit modal and read-only lightbox)', () => {
      const canvasModals = read('components/collabboard/canvas/ui/CanvasModals.tsx');
      const occurrences = [...canvasModals.matchAll(/<DrawingEditor/g)].map((m) => m.index!);
      expect(occurrences.length).toBe(2);
      for (const start of occurrences) {
        const end = canvasModals.indexOf('/>', canvasModals.indexOf('readOnly=', start));
        const block = canvasModals.slice(start, end);
        expect(block, 'each DrawingEditor instance must pass accessMode={commentAccessMode}').toContain('accessMode={commentAccessMode}');
        expect(block, 'each DrawingEditor instance must pass real currentUserId').toContain("currentUserId={user?.id || 'anon'}");
        expect(block, 'each DrawingEditor instance must pass real currentUserName').toContain("currentUserName={user?.email?.split('@')[0] || 'You'}");
        expect(block, 'each DrawingEditor instance must pass initialMetadata so comments/title actually load').toContain('initialMetadata=');
      }
    });
  });

  describe('AI Component -- AIComponentEditor.tsx own detached-comment CommentPopup, threaded via CanvasModals.tsx (PATCH 8T)', () => {
    it('AIComponentEditor.tsx accepts an accessMode prop and wires its single CommentPopup with it, migrated off placeholder identity', () => {
      const aiEditor = read('components/collabboard/editors/AIComponentEditor.tsx');
      expect(aiEditor).toContain("import { guardCommentMutation, type CommentAccessMode } from '@/lib/domain/canvas/comments';");
      expect(aiEditor).toContain('accessMode?: CommentAccessMode;');
      expect(aiEditor).toContain("accessMode = 'manage',");
      const total = (aiEditor.match(/<CommentPopup/g) ?? []).length;
      expect(total, 'AIComponentEditor.tsx must have exactly one CommentPopup usage').toBe(1);
      const block = commentPopupBlockAfter(aiEditor, '<CommentPopup');
      expect(block).toContain('accessMode={accessMode}');
      expectManageOnlyWiredCallSite(block, true);
    });

    it('uses real currentUserId/currentUserName props, not the historical "anon"/"You" literal', () => {
      const aiEditor = read('components/collabboard/editors/AIComponentEditor.tsx');
      expect(aiEditor).toContain('currentUserId?: string;');
      expect(aiEditor).toContain('currentUserName?: string;');
      expect(aiEditor).toContain("currentUserId = 'anon',");
      expect(aiEditor).toContain("currentUserName = 'You',");
      const block = commentPopupBlockAfter(aiEditor, '<CommentPopup');
      expect(block).toContain('userId: currentUserId,');
      expect(block).toContain('userName: currentUserName,');
      expect(block).toContain('currentUserId={currentUserId}');
      expect(block).toContain('currentUserName={currentUserName}');
      expect(block).not.toContain("userId: 'anon'");
      expect(block).not.toContain('currentUserId="anon"');
    });

    it('wires commentTitle/commentTitleStyle to real state, guarded', () => {
      const aiEditor = read('components/collabboard/editors/AIComponentEditor.tsx');
      const block = commentPopupBlockAfter(aiEditor, '<CommentPopup');
      expect(block).toContain('commentTitle={commentTitle}');
      expect(block).toContain('commentTitleStyle={');
      const titleChangeStart = block.indexOf('onCommentTitleChange=');
      expect(titleChangeStart).toBeGreaterThan(-1);
      const titleChangeNext = block.slice(titleChangeStart + 'onCommentTitleChange='.length).match(/^\s*\{?\s*(\S+)/);
      expect(titleChangeNext?.[1]?.startsWith('guardCommentMutation(')).toBe(true);
    });

    it('AIComponentEditor.tsx has exactly 1 <CommentPopup usage (no duplicate/local comment implementation)', () => {
      const aiEditor = read('components/collabboard/editors/AIComponentEditor.tsx');
      const total = (aiEditor.match(/<CommentPopup/g) ?? []).length;
      expect(total).toBe(1);
    });

    // AI-specific interaction boundary: comment interactions must never
    // reach the generation lifecycle (generate/cancel/setStage/abortRef),
    // and the portal wrapper must stop propagation so a click inside the
    // Comments panel cannot bubble to the modal's own onClick handlers.
    it('comment interactions are isolated from AI generation/regeneration (interaction isolation)', () => {
      const aiEditor = read('components/collabboard/editors/AIComponentEditor.tsx');
      const block = commentPopupBlockAfter(aiEditor, '<CommentPopup');
      expect(block).not.toContain('generate(');
      expect(block).not.toContain('cancel(');
      expect(block).not.toContain('setStage(');
      expect(block).not.toContain('abortRef');
      const wrapperStart = aiEditor.lastIndexOf('<div', aiEditor.indexOf(block));
      const wrapperSlice = aiEditor.slice(wrapperStart, aiEditor.indexOf(block));
      expect(wrapperSlice).toContain('onClick={(e) => e.stopPropagation()}');
    });

    it('CanvasModals.tsx threads commentAccessMode + real identity into AIComponentEditor', () => {
      const canvasModals = read('components/collabboard/canvas/ui/CanvasModals.tsx');
      const start = canvasModals.indexOf('<AIComponentEditor');
      const end = canvasModals.indexOf('/>', canvasModals.indexOf('lockedSubtype=', start));
      const block = canvasModals.slice(start, end);
      expect(block, 'AIComponentEditor instance must pass accessMode={commentAccessMode}').toContain('accessMode={commentAccessMode}');
      expect(block, 'AIComponentEditor instance must pass real currentUserId').toContain("currentUserId={user?.id || 'anon'}");
      expect(block, 'AIComponentEditor instance must pass real currentUserName').toContain("currentUserName={user?.email?.split('@')[0] || 'You'}");
      expect(block, 'AIComponentEditor instance must pass initialMetadata so comments/title actually load').toContain('initialMetadata=');
    });
  });

  describe('Link -- on-canvas entry point in FreeformPadletCards.tsx (PATCH 8U)', () => {
    it('is wired with accessMode and guarded callbacks (manage-only, no COMMENT-mode branch), migrated off the local hand-rolled implementation', () => {
      const freeform = read(FREEFORM_PATH);
      const anchor = 'Link detached comments use the canonical panel; this shell only owns placement and close state (PATCH 8U';
      const block = commentPopupBlockAfter(freeform, anchor);
      expect(block).toContain('accessMode={commentAccessMode}');
      expect(block).not.toContain('guardOwnCommentMutation(');
      expect(block).not.toContain('guardCommentComposition(');
      expect(block).not.toContain('commentModeMutations');
      expectManageOnlyWiredCallSite(block, true);
    });

    it('the panel wrapper stops click/mousedown propagation so a comment-row click cannot bubble to the Link card (navigation / post selection / context-menu open)', () => {
      const freeform = read(FREEFORM_PATH);
      const anchor = 'Link detached comments use the canonical panel; this shell only owns placement and close state (PATCH 8U';
      const anchorStart = freeform.indexOf(anchor);
      const popupStart = freeform.indexOf('<CommentPopup', anchorStart);
      const wrapperStart = freeform.lastIndexOf('<div', popupStart);
      const wrapperSlice = freeform.slice(wrapperStart, popupStart);
      expect(wrapperSlice).toContain('onClick={(e) => e.stopPropagation()}');
      expect(wrapperSlice).toContain('onMouseDown={(e) => e.stopPropagation()}');
    });

    it('the padlet.type === "link" branch no longer contains the local hand-rolled comment row/composer JSX', () => {
      const freeform = read(FREEFORM_PATH);
      // Scoped to the Link branch specifically: a copy-pasted, MISLABELED
      // "Todo Comments Popup - Right side" comment exists (unchanged, out of
      // scope) inside the actual "Comment" post family's own branch
      // elsewhere in this file, and a genuine "Table Comments Popup" local
      // implementation exists in the Table branch (also unchanged, out of
      // scope) -- a whole-file check would give a false negative/positive
      // here, so narrow to padlet.type === 'link' ... padlet.type === 'table'.
      const linkStart = freeform.indexOf("if (padlet.type === 'link') {");
      const linkEnd = freeform.indexOf("if (padlet.type === 'table') {", linkStart);
      expect(linkStart).toBeGreaterThan(-1);
      expect(linkEnd).toBeGreaterThan(linkStart);
      const linkBranch = freeform.slice(linkStart, linkEnd);
      expect(linkBranch).not.toContain('Link Comments Popup - Right side');
      expect(linkBranch).not.toContain('editingCardCommentText');
      expect(linkBranch).not.toContain('No comments yet');
    });

    it('does not touch Link-post URL/title/preview metadata fields (linkUrl/linkTitle/linkImage/linkFavicon/linkDomain)', () => {
      const freeform = read(FREEFORM_PATH);
      const anchor = 'Link detached comments use the canonical panel; this shell only owns placement and close state (PATCH 8U';
      const block = commentPopupBlockAfter(freeform, anchor);
      for (const field of ['linkUrl', 'linkTitle', 'linkImage', 'linkFavicon', 'linkDomain']) {
        expect(block, `Link comment site must never reference ${field}`).not.toContain(field);
      }
    });
  });

  describe('Link -- LinkEditor.tsx own detached-comment CommentPopup, threaded via CanvasModals.tsx (PATCH 8U)', () => {
    it('LinkEditor.tsx accepts an accessMode prop and wires its single CommentPopup with it, migrated off the local hand-rolled implementation', () => {
      const linkEditor = read('components/collabboard/editors/LinkEditor.tsx');
      expect(linkEditor).toContain("import { guardCommentMutation, type CommentAccessMode } from '@/lib/domain/canvas/comments';");
      expect(linkEditor).toContain("import CommentPopup from './CommentPopup';");
      expect(linkEditor).toContain('accessMode?: CommentAccessMode;');
      expect(linkEditor).toContain("accessMode = 'manage',");
      const total = (linkEditor.match(/<CommentPopup/g) ?? []).length;
      expect(total, 'LinkEditor.tsx must have exactly one CommentPopup usage').toBe(1);
      const block = commentPopupBlockAfter(linkEditor, '<CommentPopup');
      expect(block).toContain('accessMode={accessMode}');
      expectManageOnlyWiredCallSite(block, true);
    });

    it('uses real currentUserId/currentUserName props, not the historical "current-user"/"You" literal', () => {
      const linkEditor = read('components/collabboard/editors/LinkEditor.tsx');
      expect(linkEditor).toContain('currentUserId?: string;');
      expect(linkEditor).toContain('currentUserName?: string;');
      expect(linkEditor).toContain("currentUserId = 'anon',");
      expect(linkEditor).toContain("currentUserName = 'You',");
      const block = commentPopupBlockAfter(linkEditor, '<CommentPopup');
      expect(block).toContain('userId: currentUserId,');
      expect(block).toContain('userName: currentUserName,');
      expect(block).toContain('currentUserId={currentUserId}');
      expect(block).toContain('currentUserName={currentUserName}');
      expect(block).not.toContain("userId: 'current-user'");
    });

    it('wires commentTitle/commentTitleStyle to real state, guarded', () => {
      const linkEditor = read('components/collabboard/editors/LinkEditor.tsx');
      const block = commentPopupBlockAfter(linkEditor, '<CommentPopup');
      expect(block).toContain('commentTitle={commentTitle}');
      expect(block).toContain('commentTitleStyle={');
      const titleChangeStart = block.indexOf('onCommentTitleChange=');
      expect(titleChangeStart).toBeGreaterThan(-1);
      const titleChangeNext = block.slice(titleChangeStart + 'onCommentTitleChange='.length).match(/^\s*\{?\s*(\S+)/);
      expect(titleChangeNext?.[1]?.startsWith('guardCommentMutation(')).toBe(true);
    });

    it('no local hand-rolled Link comment row/composer/color-popup JSX remains in LinkEditor.tsx', () => {
      const linkEditor = read('components/collabboard/editors/LinkEditor.tsx');
      expect(linkEditor).not.toContain('activeCommentId');
      expect(linkEditor).not.toContain('editingCommentId');
      expect(linkEditor).not.toContain('newCommentText');
      expect(linkEditor).not.toContain('commentColorPopupId');
      expect(linkEditor).not.toContain('showBadgeColorPicker');
      expect(linkEditor).not.toContain('BADGE_COLORS');
    });

    it('the comment panel does not read or write Link-post URL/title/preview metadata state (linkUrl/linkTitle/linkImage/linkFavicon/linkDomain)', () => {
      const linkEditor = read('components/collabboard/editors/LinkEditor.tsx');
      const block = commentPopupBlockAfter(linkEditor, '<CommentPopup');
      for (const field of ['linkUrl', 'linkTitle', 'linkImage', 'linkFavicon', 'linkDomain']) {
        expect(block, `Link comment panel must never reference ${field}`).not.toContain(field);
      }
    });

    it('CanvasModals.tsx threads commentAccessMode + real identity + persisted commentTitle/commentTitleStyle into LinkEditor', () => {
      const canvasModals = read('components/collabboard/canvas/ui/CanvasModals.tsx');
      const start = canvasModals.indexOf('<LinkEditor');
      const end = canvasModals.indexOf('/>', canvasModals.indexOf('onSave={saveLink}', start));
      const block = canvasModals.slice(start, end);
      expect(block, 'LinkEditor instance must pass accessMode={commentAccessMode}').toContain('accessMode={commentAccessMode}');
      expect(block, 'LinkEditor instance must pass real currentUserId').toContain("currentUserId={user?.id || 'anon'}");
      expect(block, 'LinkEditor instance must pass real currentUserName').toContain("currentUserName={user?.email?.split('@')[0] || 'You'}");
      expect(canvasModals).toContain('commentTitle: typeof padletToEdit.metadata.commentTitle');
      expect(canvasModals).toContain('commentTitleStyle: padletToEdit.metadata.commentTitleStyle');
    });
  });

  describe('Table -- on-canvas entry point in FreeformPadletCards.tsx (PATCH 8V)', () => {
    it('is wired with accessMode and guarded callbacks (manage-only, no COMMENT-mode branch), migrated off the local hand-rolled implementation', () => {
      const freeform = read(FREEFORM_PATH);
      const anchor = 'Table detached comments use the canonical panel; this shell only owns placement and close state (PATCH 8V';
      const block = commentPopupBlockAfter(freeform, anchor);
      expect(block).toContain('accessMode={commentAccessMode}');
      expect(block).not.toContain('guardOwnCommentMutation(');
      expect(block).not.toContain('guardCommentComposition(');
      expect(block).not.toContain('commentModeMutations');
      expectManageOnlyWiredCallSite(block, true);
    });

    it('persists through updatePadletContent (Table stores comments/badgeColor/commentTitle inside padlet.content, not padlet.metadata), never through updatePadletMetadata', () => {
      const freeform = read(FREEFORM_PATH);
      const anchor = 'Table detached comments use the canonical panel; this shell only owns placement and close state (PATCH 8V';
      const block = commentPopupBlockAfter(freeform, anchor);
      expect(block).toContain('updatePadletContent(');
      expect(block).not.toContain('updatePadletMetadata(');
    });

    it('the panel wrapper stops click/mousedown propagation so a comment-row click cannot bubble to the Table card (cell selection / row toggle / drag / canvas pan)', () => {
      const freeform = read(FREEFORM_PATH);
      const anchor = 'Table detached comments use the canonical panel; this shell only owns placement and close state (PATCH 8V';
      const anchorStart = freeform.indexOf(anchor);
      const popupStart = freeform.indexOf('<CommentPopup', anchorStart);
      const wrapperStart = freeform.lastIndexOf('<div', popupStart);
      const wrapperSlice = freeform.slice(wrapperStart, popupStart);
      expect(wrapperSlice).toContain('onClick={(e) => e.stopPropagation()}');
      expect(wrapperSlice).toContain('onMouseDown={(e) => e.stopPropagation()}');
    });

    it('the padlet.type === "table" branch no longer contains the local hand-rolled comment row/composer JSX', () => {
      const freeform = read(FREEFORM_PATH);
      const tableStart = freeform.indexOf("if (padlet.type === 'table') {");
      const tableEnd = freeform.indexOf("if (padlet.type === 'todo') {", tableStart);
      expect(tableStart).toBeGreaterThan(-1);
      expect(tableEnd).toBeGreaterThan(tableStart);
      const tableBranch = freeform.slice(tableStart, tableEnd);
      expect(tableBranch).not.toContain('Table Comments Popup - Right side');
      expect(tableBranch).not.toContain('editingCardCommentText');
      expect(tableBranch).not.toContain('No comments yet');
    });

    it('does not touch Table content fields (rows/columns/cellStyles/caption/titleStyle) -- only spreads ...tableData and overrides comments/badgeColor/commentTitle/commentTitleStyle', () => {
      const freeform = read(FREEFORM_PATH);
      const anchor = 'Table detached comments use the canonical panel; this shell only owns placement and close state (PATCH 8V';
      const block = commentPopupBlockAfter(freeform, anchor);
      for (const field of ['rows:', 'columns:', 'cellStyles:', 'caption:', 'titleStyle:']) {
        expect(block, `Table comment site must never directly set ${field}`).not.toContain(field);
      }
    });
  });

  describe('Table -- TableEditor.tsx own detached-comment CommentPopup, threaded via CanvasModals.tsx (PATCH 8V)', () => {
    it('TableEditor.tsx accepts an accessMode prop and wires its single CommentPopup with it, migrated off the local hand-rolled implementation', () => {
      const tableEditor = read('components/collabboard/editors/TableEditor.tsx');
      expect(tableEditor).toContain('import CommentPopup from "./CommentPopup";');
      expect(tableEditor).toContain('accessMode?: CommentAccessMode;');
      expect(tableEditor).toContain("accessMode = 'manage',");
      const total = (tableEditor.match(/<CommentPopup/g) ?? []).length;
      expect(total, 'TableEditor.tsx must have exactly one CommentPopup usage').toBe(1);
      const block = commentPopupBlockAfter(tableEditor, '<CommentPopup');
      expect(block).toContain('accessMode={accessMode}');
      expectManageOnlyWiredCallSite(block, true);
    });

    it('uses real currentUserId/currentUserName props, not the historical "current-user"/"You" literal', () => {
      const tableEditor = read('components/collabboard/editors/TableEditor.tsx');
      expect(tableEditor).toContain('currentUserId?: string;');
      expect(tableEditor).toContain('currentUserName?: string;');
      expect(tableEditor).toContain("currentUserId = 'anon',");
      expect(tableEditor).toContain("currentUserName = 'You',");
      const block = commentPopupBlockAfter(tableEditor, '<CommentPopup');
      expect(block).toContain('userId: currentUserId,');
      expect(block).toContain('userName: currentUserName,');
      expect(block).toContain('currentUserId={currentUserId}');
      expect(block).toContain('currentUserName={currentUserName}');
      expect(block).not.toContain('userId: "current-user"');
    });

    it('wires commentTitle/commentTitleStyle to real state, guarded, seeded from and persisted into the same content JSON blob as rows/columns/comments', () => {
      const tableEditor = read('components/collabboard/editors/TableEditor.tsx');
      const block = commentPopupBlockAfter(tableEditor, '<CommentPopup');
      expect(block).toContain('commentTitle={commentTitle}');
      expect(block).toContain('commentTitleStyle={');
      const titleChangeStart = block.indexOf('onCommentTitleChange=');
      expect(titleChangeStart).toBeGreaterThan(-1);
      const titleChangeNext = block.slice(titleChangeStart + 'onCommentTitleChange='.length).match(/^\s*\{?\s*(\S+)/);
      expect(titleChangeNext?.[1]?.startsWith('guardCommentMutation(')).toBe(true);
      // handleSaveAndClose must include commentTitle/commentTitleStyle in the
      // same JSON.stringify(...) payload as comments/rows/columns -- Table
      // has no separate metadata object, so this is the only persistence path.
      const saveStart = tableEditor.indexOf('const handleSaveAndClose');
      const saveBlock = tableEditor.slice(saveStart, saveStart + 600);
      expect(saveBlock).toContain('commentTitle,');
      expect(saveBlock).toContain('commentTitleStyle:');
    });

    it('no local hand-rolled Table comment row/composer/color-popup JSX remains in TableEditor.tsx', () => {
      const tableEditor = read('components/collabboard/editors/TableEditor.tsx');
      expect(tableEditor).not.toContain('activeCommentId');
      expect(tableEditor).not.toContain('editingCommentId');
      expect(tableEditor).not.toContain('newCommentText');
      expect(tableEditor).not.toContain('commentColorPopupId');
      expect(tableEditor).not.toContain('showBadgeColorPicker');
      expect(tableEditor).not.toContain('BADGE_COLORS');
    });

    it('the left toolbar wrapper does not conditionally disable pointer-events based on any removed comment-color-popup state (regression guard for the exact bug found in TodoEditor.tsx during PATCH 8S)', () => {
      const tableEditor = read('components/collabboard/editors/TableEditor.tsx');
      expect(tableEditor).not.toContain('opacity-0 pointer-events-none');
    });

    it('the comment panel does not read or write Table content state directly (rows/columns/cellStyles/caption/titleStyle) -- only comments/badgeColor/commentTitle/commentTitleStyle', () => {
      const tableEditor = read('components/collabboard/editors/TableEditor.tsx');
      const block = commentPopupBlockAfter(tableEditor, '<CommentPopup');
      for (const field of ['setRows(', 'setColumns(', 'setCellStyles(', 'setCaption(', 'setTitleStyle(']) {
        expect(block, `Table comment panel must never call ${field}`).not.toContain(field);
      }
    });

    it('CanvasModals.tsx threads commentAccessMode + real identity into TableEditor', () => {
      const canvasModals = read('components/collabboard/canvas/ui/CanvasModals.tsx');
      const start = canvasModals.indexOf('<TableEditor');
      const end = canvasModals.indexOf('/>', canvasModals.indexOf('onSave={saveTable}', start));
      const block = canvasModals.slice(start, end);
      expect(block, 'TableEditor instance must pass accessMode={commentAccessMode}').toContain('accessMode={commentAccessMode}');
      expect(block, 'TableEditor instance must pass real currentUserId').toContain("currentUserId={user?.id || 'anon'}");
      expect(block, 'TableEditor instance must pass real currentUserName').toContain("currentUserName={user?.email?.split('@')[0] || 'You'}");
    });
  });

  describe('Comment post -- primary-thread permission wiring (PATCH 8Z)', () => {
    // Comment post is SPECIAL / PRIMARY THREAD (PATCH 8X), not a canonical
    // CommentPopup caller -- its three live surfaces (CommentPost.tsx,
    // FreeformPadletCards.tsx's collapsed-marker block, CommentEditor.tsx)
    // are hand-rolled and stay that way (no CommentPopup migration in
    // PATCH 8Z). These checks prove the READ/MANAGE permission contract at
    // the source level, the same "every canonical caller passes an explicit
    // accessMode" spirit as every describe block above, adapted to a
    // non-CommentPopup surface.
    it('CommentPost.tsx accepts an accessMode prop and gates its composer/row-actions/title-edit on it', () => {
      const commentPost = read('components/collabboard/CommentPost.tsx');
      expect(commentPost).toContain("import { type CommentAccessMode } from '@/lib/domain/canvas/comments';");
      expect(commentPost).toContain('accessMode?: CommentAccessMode;');
      expect(commentPost).toContain("accessMode = 'manage',");
      expect(commentPost).toContain("const isReadOnly = accessMode !== 'manage';");
      expect(commentPost).toContain('{!isReadOnly && onAddComment ?');
      expect(commentPost).toContain('{!isReadOnly && (');
      expect(commentPost).toContain('if (isReadOnly) return;');
    });

    it('FreeformPadletCards.tsx passes accessMode={commentAccessMode} to the CommentPost call site and guards every mutation callback', () => {
      const freeform = read(FREEFORM_PATH);
      const start = freeform.indexOf('<CommentPost');
      expect(start).toBeGreaterThan(-1);
      const end = freeform.indexOf('/>', freeform.indexOf('onUpdateCommentColor=', start));
      const block = freeform.slice(start, end);
      expect(block, 'CommentPost instance must pass accessMode={commentAccessMode}').toContain('accessMode={commentAccessMode}');
      for (const prop of ['onTitleChange=', 'onAddComment=', 'onEditComment=', 'onToggleCommentStrikethrough=', 'onDeleteComment=', 'onUpdateCommentColor=']) {
        const propStart = block.indexOf(prop);
        expect(propStart, `${prop} not found on CommentPost call site`).toBeGreaterThan(-1);
        const nextNonSpace = block.slice(propStart + prop.length).match(/^\s*\{?\s*(\S+)/);
        expect(nextNonSpace?.[1]?.startsWith('guardCommentMutation('), `${prop} must be wrapped with guardCommentMutation(...), found: ${nextNonSpace?.[0]}`).toBe(true);
      }
    });

    it('the collapsed-marker primary-thread block in FreeformPadletCards.tsx (the LIVE surface, distinct from the dead mislabeled block) gates its badge/row-action/composer mutations on commentAccessMode', () => {
      const freeform = read(FREEFORM_PATH);
      const markerStart = freeform.indexOf('// Collapsed Marker - Pin with number inside');
      expect(markerStart, 'collapsed-marker anchor not found -- FreeformPadletCards.tsx structure changed, update this guard').toBeGreaterThan(-1);
      const markerEnd = freeform.indexOf('// Expanded Post', markerStart);
      expect(markerEnd).toBeGreaterThan(markerStart);
      const block = freeform.slice(markerStart, markerEnd);
      // Distinguishes this LIVE block from the dead "Todo Comments Popup -
      // Right side" block elsewhere in the same padlet.type === 'comment'
      // branch (PATCH 8X confirmed that one is unreachable) -- this guard
      // targets only the collapsed-marker's own comments.map(...) region.
      expect(block).toContain('collapsedActiveCommentId');
      const gateCount = (block.match(/\{commentAccessMode === 'manage' && \(/g) ?? []).length;
      expect(gateCount, 'badge color trigger, row actions column, and composer must each be gated (3 gates)').toBe(3);
      expect(block, 'composer anchor must be gated').toContain('Add comment input -- not rendered at all outside \'manage\'');
      expect(block, 'startEdit must no-op outside manage').toContain("if (commentAccessMode !== 'manage') return;");
      expect(block, 'commitEdit must no-op outside manage').toContain("if (commentAccessMode !== 'manage') return;");
      const guardedCount = (block.match(/guardCommentMutation\(commentAccessMode,/g) ?? []).length;
      expect(guardedCount, 'every badge/color/strikethrough/delete/add handler in the collapsed-marker block must be guardCommentMutation-wrapped').toBeGreaterThanOrEqual(6);
    });

    it('the dead "Todo Comments Popup - Right side" block remains classified dead (still gated only by the unreachable cardCommentPopupPadletId, not touched by PATCH 8Z)', () => {
      const freeform = read(FREEFORM_PATH);
      expect(freeform).toContain('{/* Todo Comments Popup - Right side */}');
      expect(freeform).toContain("{cardCommentPopupPadletId === padlet.id && (");
    });

    it('CommentEditor.tsx accepts an accessMode prop, gates every comment mutation, and leaves its TipTap extension set untouched', () => {
      const commentEditor = read('components/collabboard/editors/CommentEditor.tsx');
      expect(commentEditor).toContain('import { type CommentAccessMode } from "@/lib/domain/canvas/comments";');
      expect(commentEditor).toContain('accessMode?: CommentAccessMode;');
      expect(commentEditor).toContain('accessMode = "manage",');
      expect(commentEditor).toContain('const isReadOnly = accessMode !== "manage";');
      for (const handler of ['handleAddComment', 'handleEditComment', 'handleSaveEdit', 'handleRemoveComment', 'handleLink', 'handleApplyLink', 'handleTextColor', 'handleHighlight']) {
        const handlerStart = commentEditor.indexOf(`const ${handler} = `);
        expect(handlerStart, `${handler} not found`).toBeGreaterThan(-1);
        const handlerBody = commentEditor.slice(handlerStart, handlerStart + 400);
        expect(handlerBody, `${handler} must guard on isReadOnly as its own first check`).toContain('if (isReadOnly) return;');
      }
      // Extension set frozen -- same six capabilities as before this patch.
      expect(commentEditor).toContain('StarterKit.configure({ link: false, underline: false })');
      expect(commentEditor).toContain('Underline,');
      expect(commentEditor).toContain('TextStyle,');
      expect(commentEditor).toContain('Highlight.configure({ multicolor: true })');
      expect(commentEditor).toContain('TextAlign.configure({ types: ["heading", "paragraph"] })');
    });

    it('CommentEditor.tsx renders its composer, badge-color trigger, and per-row actions only outside read-only', () => {
      const commentEditor = read('components/collabboard/editors/CommentEditor.tsx');
      expect(commentEditor).toContain('{!isReadOnly && (\n            <div className="mt-3 pt-3 border-t border-gray-100">');
      expect(commentEditor).toContain('{!isReadOnly && (\n              <button\n                onClick={() => {\n                  setBadgeColorOpen');
      expect(commentEditor).toContain('{!isReadOnly && (\n                      <div className="flex flex-col gap-0.5 w-5 shrink-0">');
      expect(commentEditor).toContain('readOnly={isReadOnly}');
    });

    it('CanvasModals.tsx threads accessMode={commentAccessMode} into the CommentEditor instance', () => {
      const canvasModals = read('components/collabboard/canvas/ui/CanvasModals.tsx');
      const start = canvasModals.indexOf('<CommentEditor');
      expect(start).toBeGreaterThan(-1);
      const end = canvasModals.indexOf('/>', canvasModals.indexOf('onSave={saveComment}', start));
      const block = canvasModals.slice(start, end);
      expect(block, 'CommentEditor instance must pass accessMode={commentAccessMode}').toContain('accessMode={commentAccessMode}');
      expect(block, 'CommentEditor instance must pass real currentUserId').toContain('currentUserId={user?.id}');
    });

    it('metadata.comments remains the sole authoritative Comment-post storage field -- no detachedComments introduced anywhere in this patch\'s three surfaces', () => {
      for (const path of [
        'components/collabboard/CommentPost.tsx',
        'components/collabboard/editors/CommentEditor.tsx',
      ]) {
        const src = read(path);
        expect(src, `${path} must not reference detachedComments`).not.toContain('detachedComments');
      }
      const freeform = read(FREEFORM_PATH);
      const markerStart = freeform.indexOf('// Collapsed Marker - Pin with number inside');
      const markerEnd = freeform.indexOf('// Expanded Post', markerStart);
      const block = freeform.slice(markerStart, markerEnd);
      expect(block).not.toContain('detachedComments');
    });
  });

  describe('Document anchored/highlighted comments -- permission wiring (PATCH 8AA)', () => {
    it('DocumentEditor keeps anchored comments special, accepts accessMode, allows read-open, and guards write callbacks', () => {
      const documentEditor = read('components/collabboard/editors/DocumentEditor.tsx');
      const block = commentPopupBlockAfter(documentEditor, '<CommentPopup');

      expect(documentEditor).toContain("import { guardCommentMutation, type CommentAccessMode } from '@/lib/domain/canvas/comments';");
      expect(documentEditor).toContain('accessMode?: CommentAccessMode;');
      expect(documentEditor).toContain("const anchoredAccessMode: CommentAccessMode = accessMode === 'manage' ? 'manage' : 'read';");
      expect(documentEditor).toContain("onTextComment: canManageAnchoredComments ? handleTextComment : undefined");
      expect(documentEditor).toContain("closest?.('[data-comment-id]')");
      expect(documentEditor).toContain('openThreadFromCommentElement(commentTarget)');
      expect(documentEditor).toContain('setSavedSelection(null);');
      expect(documentEditor).toContain('if (!editor || !canManageAnchoredComments) return;');
      expect(documentEditor).toContain('if (!editor || !canManageAnchoredComments || !commentText || !activeThread || !savedSelection) return;');
      expect(block).toContain('accessMode={canManageAnchoredComments && savedSelection ? \'manage\' : \'read\'}');
      expect(block).toContain('onSubmit={guardCommentMutation(anchoredAccessMode, handleAddComment)}');
      expect(block).toContain('onCommentColor={guardCommentMutation(anchoredAccessMode, handleCommentColor)}');
      expect(documentEditor).not.toContain('detachedComments');
    });

    it('CanvasModals threads the resolved access mode into DocumentEditor without creating a normal/detached tier', () => {
      const canvasModals = read('components/collabboard/canvas/ui/CanvasModals.tsx');
      const start = canvasModals.indexOf('<DocumentEditor');
      expect(start).toBeGreaterThan(-1);
      const end = canvasModals.indexOf('/>', start);
      const block = canvasModals.slice(start, end);
      expect(block).toContain('accessMode={commentAccessMode}');
      expect(block).toContain('currentUserId={user?.id}');
    });

    it('OverlayLayer passes accessMode and guards every anchored updatePadletContent mutation path', () => {
      const overlay = read('components/collabboard/canvas/ui/OverlayLayer.tsx');
      const block = commentPopupBlockAfter(overlay, '<CommentPopup');

      expect(overlay).toContain("import { guardCommentMutation, type CommentAccessMode } from '@/lib/domain/canvas/comments';");
      expect(overlay).toContain('accessMode?: CommentAccessMode;');
      expect(overlay).toContain("import { isDocumentPost } from '@/lib/domain/canvas/documentPost';");
      expect(overlay).toContain("const requestedDocumentAccessMode: CommentAccessMode = accessMode === 'manage' ? 'manage' : 'read';");
      expect(overlay).toContain('activeCommentPadlet && (isDocumentPost(activeCommentPadlet) || isNoteAnchoredPost(activeCommentPadlet))');
      expect(block).toContain('accessMode={anchoredAccessMode}');
      for (const prop of ['onSubmit=', 'onEditComment=', 'onRemoveComment=', 'onRemoveThread=', 'onColor=', 'onToggleCommentStrikethrough=', 'onCommentColor=']) {
        const propStart = block.indexOf(prop);
        expect(propStart, `${prop} must be present`).toBeGreaterThan(-1);
        const nextNonSpace = block.slice(propStart + prop.length).match(/^\s*\{?\s*(\S+)/);
        expect(nextNonSpace?.[1]?.startsWith('guardCommentMutation('), `${prop} must be wrapped with guardCommentMutation(...), found: ${nextNonSpace?.[0]}`).toBe(true);
      }
      expect(block).toContain('onColorPickerOpenChange={canManageAnchoredComments ? setTextLinkColorPickerOpen : () => {}}');
      expect(overlay).toContain('{canManageAnchoredComments && textLinkColorPickerOpen && commentPopupOpen && textLinkColorPickerPosition && (');
      expect(overlay).toContain('onSelectHighlight={guardCommentMutation(anchoredAccessMode, async (color) => {');
      expect(overlay).not.toContain("|| 'user1'");
      expect(overlay).not.toContain("|| 'User'");
    });

    it('CanvasClient threads the resolved access mode into OverlayLayer', () => {
      const canvas = read(CANVAS_PATH);
      const start = canvas.indexOf('<OverlayLayer');
      expect(start).toBeGreaterThan(-1);
      const end = canvas.indexOf('/>', start);
      const block = canvas.slice(start, end);
      expect(block).toContain('accessMode={commentAccessMode}');
    });
  });

  describe('Note anchored/highlighted comments -- permission + identity wiring (PATCH 8AB)', () => {
    it('NoteEditor derives one shared anchoredAccessMode from the same accessMode prop as the detached panel, and every anchored handler self-guards', () => {
      const noteEditor = read('components/collabboard/editors/NoteEditor.tsx');
      expect(noteEditor).toContain("const anchoredAccessMode: CommentAccessMode = accessMode === 'manage' ? 'manage' : 'read';");
      expect(noteEditor).toContain('const canManageAnchoredComments = anchoredAccessMode === \'manage\';');
      expect(noteEditor).toContain('const handleTextComment = () => {');
      expect(noteEditor).toContain('if (!editor || !canManageAnchoredComments) return;');
      expect(noteEditor).toContain('if (!editor || !canManageAnchoredComments || !commentText || !activeThread) return;');
      expect(noteEditor).toContain('if (!editor || !canManageAnchoredComments || !newText || !activeThread) return;');
      expect(noteEditor).toContain('const handleRemoveComment = (commentId: string) => {');
      expect(noteEditor).toContain('const handleRemoveThread = () => {');
      expect(noteEditor).toContain('const handleToggleCommentStrikethrough = (commentId: string) => {');
      expect(noteEditor).toContain('const handleColorComment = (color: string) => {');
      expect(noteEditor).toContain('const handleCommentColor = (commentId: string, textColor?: string, backgroundColor?: string) => {');
      // handleRemoveComment, handleRemoveThread, handleToggleCommentStrikethrough,
      // handleColorComment, and handleCommentColor all share this exact guard
      // body -- counted rather than pinned to each own multi-line
      // (CRLF-fragile) block.
      const activeThreadGuardCount = (noteEditor.match(/if \(!editor \|\| !canManageAnchoredComments \|\| !activeThread\) return;/g) ?? []).length;
      expect(activeThreadGuardCount).toBe(5);
    });

    it('the anchored thread-creation handler uses real currentUserId/currentUserName, not the historical "user1"/"R" placeholder', () => {
      const noteEditor = read('components/collabboard/editors/NoteEditor.tsx');
      const start = noteEditor.indexOf('const handleAddComment = ');
      expect(start).toBeGreaterThan(-1);
      const end = noteEditor.indexOf('const handleEditComment = ', start);
      const block = noteEditor.slice(start, end);
      expect(block).toContain('userId: currentUserId,');
      expect(block).toContain('userName: currentUserName,');
      expect(block).not.toContain("userId: 'user1'");
      expect(block).not.toContain("userName: 'R'");
    });

    it('buildThreadFromAttrs keeps its historical-data READ fallback untouched (parsing legacy marks, not a write path)', () => {
      const noteEditor = read('components/collabboard/editors/NoteEditor.tsx');
      // Deliberately unchanged -- this only labels legacy marks that predate
      // the userId attribute when displaying them, it never persists a new
      // comment. See "HISTORICAL IDENTITY" in the PATCH 8AB spec.
      expect(noteEditor).toContain("userId: attrs.userId || 'user1',");
    });

    it('the toolbar creation affordance is omitted (not merely disabled) when the anchored system is read-only', () => {
      const noteEditor = read('components/collabboard/editors/NoteEditor.tsx');
      expect(noteEditor).toContain('onTextComment: canManageAnchoredComments ? handleTextComment : undefined,');
      const toolbar = read('components/collabboard/editors/NoteEditorToolbar.tsx');
      expect(toolbar).toContain('disabled: !hasSelection || !onTextComment,');
    });

    it('NoteEditor.tsx accepts accessMode + real currentUserId/currentUserName and forwards them to both CommentPopup usages', () => {
      const noteEditor = read('components/collabboard/editors/NoteEditor.tsx');
      expect(noteEditor).toContain('currentUserId?: string;');
      expect(noteEditor).toContain('currentUserName?: string;');
      expect(noteEditor).toContain('accessMode?: CommentAccessMode;');
      const canvasModals = read('components/collabboard/canvas/ui/CanvasModals.tsx');
      const noteEditorStart = canvasModals.indexOf('<NoteEditor');
      const noteEditorEnd = canvasModals.indexOf('/>', canvasModals.indexOf('initialTitle=', noteEditorStart));
      const noteEditorBlock = canvasModals.slice(noteEditorStart, noteEditorEnd);
      expect(noteEditorBlock).toContain('currentUserId={user?.id || \'anon\'}');
      expect(noteEditorBlock).toContain('currentUserName={user?.email?.split(\'@\')[0] || \'You\'}');
    });

    it('OverlayLayer extends the same READ/MANAGE gate to Note padlets, distinguishable from the Document branch', () => {
      const overlay = read('components/collabboard/canvas/ui/OverlayLayer.tsx');
      expect(overlay).toContain('const isNoteAnchoredPost = (post: Pick<Padlet, \'type\'>): boolean =>');
      expect(overlay).toContain("post.type === 'text' || (post.type as string) === 'note';");
      expect(overlay).toContain('activeCommentPadlet && (isDocumentPost(activeCommentPadlet) || isNoteAnchoredPost(activeCommentPadlet))');
      // Regression proof the two branches remain distinguishable rather than
      // collapsed into one always-true check: isDocumentPost and
      // isNoteAnchoredPost are two separate, independently named predicates,
      // each still individually referenced in the combined condition above.
      expect(overlay.match(/isDocumentPost\(activeCommentPadlet\)/g)?.length).toBeGreaterThanOrEqual(1);
      expect(overlay.match(/isNoteAnchoredPost\(activeCommentPadlet\)/g)?.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('ContainerEditor embedded child CommentPopup -- permission wiring (PATCH 8AC)', () => {
    it('ContainerEditor.tsx accepts accessMode and threads it into SortableChildItem', () => {
      const containerEditor = read('components/collabboard/editors/ContainerEditor.tsx');
      expect(containerEditor).toContain("import { guardCommentMutation, type CommentAccessMode } from \"@/lib/domain/canvas/comments\";");
      expect(containerEditor).toContain('accessMode?: CommentAccessMode;');
      expect(containerEditor).toContain("accessMode = 'manage',");
      const sortableCallStart = containerEditor.indexOf('<SortableChildItem');
      const sortableCallEnd = containerEditor.indexOf('/>', sortableCallStart);
      expect(containerEditor.slice(sortableCallStart, sortableCallEnd)).toContain('accessMode={accessMode}');
    });

    it('the embedded CommentPopup call site receives accessMode and every mutation callback is guarded', () => {
      const containerEditor = read('components/collabboard/editors/ContainerEditor.tsx');
      const start = containerEditor.indexOf('{child.type === "comment" && onUpdateChildComments ? (');
      const block = commentPopupBlockAfter(containerEditor, '{child.type === "comment" && onUpdateChildComments ? (');
      expect(start).toBeGreaterThan(-1);
      expect(block).toContain('accessMode={accessMode}');
      for (const prop of ['onSubmit=', 'onEditComment=', 'onRemoveComment=', 'onCommentColor=']) {
        const propStart = block.indexOf(prop);
        expect(propStart, `${prop} must be present`).toBeGreaterThan(-1);
        const nextNonSpace = block.slice(propStart + prop.length).match(/^\s*\{?\s*(\S+)/);
        expect(nextNonSpace?.[1]?.startsWith('guardCommentMutation(accessMode,'), `${prop} must be wrapped with guardCommentMutation(accessMode, ...), found: ${nextNonSpace?.[0]}`).toBe(true);
      }
    });

    it('every mutation inside the embedded block targets child.id, never a Container id or a hardcoded id', () => {
      const containerEditor = read('components/collabboard/editors/ContainerEditor.tsx');
      const block = commentPopupBlockAfter(containerEditor, '{child.type === "comment" && onUpdateChildComments ? (');
      const targetCalls = block.match(/onUpdateChildComments\(([^,]+),/g) ?? [];
      expect(targetCalls.length).toBeGreaterThanOrEqual(4);
      for (const call of targetCalls) {
        expect(call, `expected child.id as the mutation target, found: ${call}`).toContain('child.id');
      }
      expect(block).not.toContain('containerId');
    });

    it('storage ownership: only child.metadata.comments is used in the embedded block, never detachedComments', () => {
      const containerEditor = read('components/collabboard/editors/ContainerEditor.tsx');
      const block = commentPopupBlockAfter(containerEditor, '{child.type === "comment" && onUpdateChildComments ? (');
      expect(block).toContain('child.metadata?.comments');
      expect(block).not.toContain('detachedComments');
    });

    it('CanvasModals.tsx threads commentAccessMode into ContainerEditor as accessMode', () => {
      const canvasModals = read('components/collabboard/canvas/ui/CanvasModals.tsx');
      const start = canvasModals.indexOf('<ContainerEditor');
      expect(start).toBeGreaterThan(-1);
      const end = canvasModals.indexOf('/>', canvasModals.indexOf('currentUserAvatar={user?.user_metadata?.avatar_url}', start));
      const block = canvasModals.slice(start, end);
      expect(block).toContain('accessMode={commentAccessMode}');
      // Identity was already real before this patch -- unchanged, verified.
      expect(block).toContain('currentUserId={user?.id}');
    });

    it('EmbeddedCommentList.tsx / RowColumnContainerCard.tsx / PostCardContent.tsx are now wired too (PATCH 8AD) -- this describe block itself stays unchanged', () => {
      // PATCH 8AC only wired the CommentPopup-based embedded child surface;
      // the compact renderers (EmbeddedCommentList and its RowColumnContainerCard/
      // PostCardContent callers) were PATCH 8AD's scope, now closed -- see the
      // "EmbeddedCommentList permission wiring (PATCH 8AD)" describe block below.
      // This test now proves the opposite of its PATCH 8AC-era assertion: these
      // three files DO import the comment domain guard.
      const embeddedList = read('components/collabboard/EmbeddedCommentList.tsx');
      expect(embeddedList).toContain("from '@/lib/domain/canvas/comments'");
      const rowColumn = read('components/collabboard/RowColumnContainerCard.tsx');
      expect(rowColumn).toContain('guardCommentMutation');
      const postCardContent = read('components/collabboard/PostCardContent.tsx');
      expect(postCardContent).toContain('guardCommentMutation');
    });
  });

  describe('EmbeddedCommentList permission wiring (PATCH 8AD)', () => {
    it('EmbeddedCommentList.tsx accepts accessMode, defaults to manage, and gates its composer', () => {
      const src = read('components/collabboard/EmbeddedCommentList.tsx');
      expect(src).toContain("import type { CommentAccessMode } from '@/lib/domain/canvas/comments';");
      expect(src).toContain('accessMode?: CommentAccessMode;');
      expect(src).toContain("accessMode = 'manage',");
      expect(src).toContain('const canManage = accessMode === \'manage\';');
      expect(src).toContain('{showComposer && onSubmit && canManage && (');
      expect(src).toContain('accessMode={accessMode}');
    });

    it('CommentRow.tsx (EmbeddedCommentList\'s only caller) accepts accessMode and folds it into canEdit', () => {
      const src = read('components/collabboard/CommentRow.tsx');
      expect(src).toContain("import type { CommentAccessMode } from '@/lib/domain/canvas/comments';");
      expect(src).toContain('accessMode?: CommentAccessMode;');
      expect(src).toContain("accessMode = 'manage',");
      expect(src).toContain('const canManage = accessMode === \'manage\';');
      expect(src).toContain('const canEdit = canManage && comment.userId === currentUserId;');
      expect(src).toContain('{canManage && (');
    });

    it('CommentRow.tsx has exactly one caller in production code (EmbeddedCommentList.tsx)', () => {
      // Confirms the "smallest safe design" premise this patch relied on --
      // gating CommentRow directly (rather than a second indirection) is
      // safe precisely because no other component renders it. A relative
      // `./CommentRow` import can only resolve from within
      // components/collabboard/ itself (CommentRow.tsx's own directory), so
      // that single directory (non-recursive) is the complete search space.
      const dir = 'components/collabboard';
      const callers = fs.readdirSync(dir)
        .filter((name) => /\.tsx?$/.test(name) && !name.includes('.test.'))
        .filter((name) => {
          const src = fs.readFileSync(`${dir}/${name}`, 'utf8');
          return /from ['"]\.\/CommentRow['"]/.test(src);
        })
        .map((name) => `${dir}/${name}`);
      expect(callers).toEqual(['components/collabboard/EmbeddedCommentList.tsx']);
    });

    it('RowColumnContainerCard.tsx and PostCardContent.tsx both accept accessMode and default to manage', () => {
      const rowColumn = read('components/collabboard/RowColumnContainerCard.tsx');
      const postCard = read('components/collabboard/PostCardContent.tsx');
      for (const src of [rowColumn, postCard]) {
        expect(src).toContain('accessMode?: CommentAccessMode;');
        expect(src).toContain("accessMode = 'manage',");
      }
    });

    it('DrawingLayout.tsx threads commentAccessMode into AutoHeightContainer/RowColumnContainerCard and guards its own direct EmbeddedCommentList + PostCardContent calls', () => {
      const src = read('components/collabboard/canvas/layouts/DrawingLayout.tsx');
      expect(src).toContain("import { guardCommentMutation, type CommentAccessMode } from '@/lib/domain/canvas/comments';");
      expect(src).toContain('commentAccessMode?: CommentAccessMode;');
      // AutoHeightContainer -> RowColumnContainerCard.
      const autoHeightStart = src.indexOf('<RowColumnContainerCard');
      const autoHeightEnd = src.indexOf('/>', autoHeightStart);
      expect(src.slice(autoHeightStart, autoHeightEnd)).toContain('accessMode={commentAccessMode}');
      // Direct standalone-comment-post EmbeddedCommentList (the newly
      // discovered root-level surface -- Drawing layout's own comment posts
      // render through this compact renderer, not the canonical CommentPost.tsx).
      const embeddedStart = src.indexOf('<EmbeddedCommentList');
      const embeddedEnd = src.indexOf('/>', embeddedStart);
      const embeddedBlock = src.slice(embeddedStart, embeddedEnd);
      expect(embeddedBlock).toContain('accessMode={commentAccessMode}');
      for (const prop of ['onSubmit=', 'onEditComment=', 'onRemoveComment=', 'onToggleStrikethrough=', 'onColorChange=']) {
        expect(embeddedBlock, `${prop} must be present`).toContain(prop);
      }
      const guardedCount = (embeddedBlock.match(/guardCommentMutation\(commentAccessMode \?\? 'manage',/g) ?? []).length;
      expect(guardedCount).toBe(5);
      // The non-container PostCardContent fallback also forwards accessMode
      // (inert today since it never receives onUpdateChildComments, but wired
      // uniformly rather than left as a silent exception).
      expect(src).toContain('<PostCardContent padlet={padlet} onScan={fetchData} canvasContext="drawing" onOpenDocument={onOpenDocument ? () => onOpenDocument(padlet) : undefined} accessMode={commentAccessMode} />');
    });

    it('CanvasClient.tsx threads commentAccessMode into all 6 top-level layout components', () => {
      const src = read(CANVAS_PATH);
      const occurrences = (src.match(/commentAccessMode=\{commentAccessMode\}/g) ?? []).length;
      // ColumnsLayout, RowCanvasDnD, WallCanvas, DrawingLayout, ChronoTimelineCanvas,
      // FreeformPadletCards (pre-existing from PATCH 8Z) -- plus the 2 pre-existing
      // occurrences at CanvasModals.tsx's own commentAccessMode source (line 6063)
      // and the image toolbar (line 7694), which are untouched by this patch.
      expect(occurrences).toBeGreaterThanOrEqual(8);
    });

    it('WallCanvas.tsx, ColumnsLayout.tsx/ColumnsCanvasRow.tsx, RowCanvasDnD.tsx/RowLane.tsx, and ChronoTimelineCanvas.tsx each accept and forward commentAccessMode to their RowColumnContainerCard call as accessMode', () => {
      const files = [
        'components/canvas/WallCanvas.tsx',
        'components/canvas/layouts/ColumnsLayout.tsx',
        'components/canvas/layouts/ColumnsCanvasRow.tsx',
        'components/collabboard/row/RowCanvasDnD.tsx',
        'components/collabboard/row/RowLane.tsx',
        'components/canvas/ChronoTimelineCanvas.tsx',
      ];
      for (const file of files) {
        const src = read(file);
        expect(src, `${file} missing commentAccessMode?: CommentAccessMode`).toContain('commentAccessMode?: CommentAccessMode');
      }
      // The two files with a DIRECT RowColumnContainerCard/CommentAccessMode
      // forward (ColumnsLayout/RowCanvasDnD are pass-through only, one level
      // removed from RowColumnContainerCard itself).
      const wall = read('components/canvas/WallCanvas.tsx');
      const rowColumnStart = wall.indexOf('<RowColumnContainerCard');
      const rowColumnEnd = wall.indexOf('/>', rowColumnStart);
      expect(wall.slice(rowColumnStart, rowColumnEnd)).toContain('accessMode={commentAccessMode}');

      const columnsRow = read('components/canvas/layouts/ColumnsCanvasRow.tsx');
      const columnsRowStart = columnsRow.indexOf('<RowColumnContainerCard');
      const columnsRowEnd = columnsRow.indexOf('/>', columnsRowStart);
      expect(columnsRow.slice(columnsRowStart, columnsRowEnd)).toContain('accessMode={commentAccessMode}');

      const rowLane = read('components/collabboard/row/RowLane.tsx');
      const rowLaneStart = rowLane.indexOf('<RowColumnContainerCard');
      const rowLaneEnd = rowLane.indexOf('/>', rowLaneStart);
      expect(rowLane.slice(rowLaneStart, rowLaneEnd)).toContain('accessMode={commentAccessMode}');

      const chrono = read('components/canvas/ChronoTimelineCanvas.tsx');
      const chronoStart = chrono.indexOf('<RowColumnContainerCard');
      const chronoEnd = chrono.indexOf('/>', chronoStart);
      expect(chrono.slice(chronoStart, chronoEnd)).toContain('accessMode={commentAccessMode}');
    });

    it('FreeformPadletCards.tsx forwards its existing commentAccessMode prop into its own RowColumnContainerCard call', () => {
      const src = read(FREEFORM_PATH);
      const start = src.indexOf('<RowColumnContainerCard');
      const end = src.indexOf('/>', start);
      expect(src.slice(start, end)).toContain('accessMode={commentAccessMode}');
    });

    it('components/canvas/RowCanvas.tsx (the dead/orphaned EmbeddedCommentList caller) is not imported anywhere in production code and was intentionally left unwired', () => {
      const { execSync } = require('node:child_process');
      const grepOutput: string = execSync(
        `git grep -l "from '@/components/canvas/RowCanvas'" -- '*.tsx' '*.ts' || echo NONE`,
        { cwd: process.cwd() },
      ).toString().trim();
      expect(grepOutput === 'NONE' || grepOutput === '').toBe(true);
      const src = read('components/canvas/RowCanvas.tsx');
      // Its own EmbeddedCommentList call site was NOT touched by this patch.
      const start = src.indexOf('<EmbeddedCommentList');
      const end = src.indexOf('/>', start);
      expect(src.slice(start, end)).not.toContain('accessMode');
    });
  });

  describe('architecture guard -- every <CommentPopup usage in these three files is accounted for', () => {
    it('FreeformPadletCards.tsx has exactly 8 <CommentPopup usages, all 8 wired (Clipart Site B, Image x2, Note x2, Todo x1, Link x1, Table x1)', () => {
      const freeform = read(FREEFORM_PATH);
      const total = (freeform.match(/<CommentPopup/g) ?? []).length;
      expect(total).toBe(8);
      // Scoped per-usage (not a raw file-wide accessMode={commentAccessMode}
      // count) since PATCH 8Z added a 9th, legitimate occurrence of that
      // same string on the non-CommentPopup <CommentPost> call site -- a
      // whole-file count would conflate the two.
      let cursor = 0;
      let wired = 0;
      for (let i = 0; i < total; i++) {
        const block = commentPopupBlockAfter(freeform, '<CommentPopup', cursor);
        if (block.includes('accessMode={commentAccessMode}')) wired++;
        cursor = freeform.indexOf(block, cursor) + block.length;
      }
      expect(wired).toBe(8);
    });

    it('CanvasClient.tsx has exactly 1 <CommentPopup usage and it is wired', () => {
      const canvas = read(CANVAS_PATH);
      const total = (canvas.match(/<CommentPopup/g) ?? []).length;
      expect(total).toBe(1);
      const block = commentPopupBlockAfter(canvas, '<CommentPopup');
      expect(block).toContain('accessMode={commentAccessMode}');
    });

    it('ClipartCardDraftModal.tsx has exactly 1 <CommentPopup usage and it is wired', () => {
      const draft = read(DRAFT_PATH);
      const total = (draft.match(/<CommentPopup/g) ?? []).length;
      const wired = (draft.match(/accessMode=\{commentAccessMode\}/g) ?? []).length;
      expect(total).toBe(1);
      expect(wired).toBe(1);
    });
  });
});
