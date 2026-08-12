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
      // COMMENT stays dormant for Note) = 16. 23 + 16 = 39.
      expect((freeform.match(/guardCommentMutation\(/g) ?? []).length).toBe(39);
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

    it('the OTHER CommentPopup in NoteEditor.tsx (selected-text/anchored-thread popup) is untouched -- no accessMode, no guards, still the historical hardcoded identity', () => {
      const noteEditor = read('components/collabboard/editors/NoteEditor.tsx');
      const block = commentPopupBlockAfter(noteEditor, '{panels.open.comment && (');
      expect(block).not.toContain('accessMode=');
      expect(block).not.toContain('guardCommentMutation(');
      expect(block).toContain('onRemoveThread');
      expect(block).toContain('highlightColor={activeThread?.color}');
      expect(block).toContain('currentUserId="user1"');
      expect(block).toContain('currentUserName="R"');
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

  describe('architecture guard -- every <CommentPopup usage in these three files is accounted for', () => {
    it('FreeformPadletCards.tsx has exactly 5 <CommentPopup usages, all 5 wired (Clipart Site B, Image x2, Note x2)', () => {
      const freeform = read(FREEFORM_PATH);
      const total = (freeform.match(/<CommentPopup/g) ?? []).length;
      const wired = (freeform.match(/accessMode=\{commentAccessMode\}/g) ?? []).length;
      expect(total).toBe(5);
      expect(wired).toBe(5);
    });

    it('CanvasClient.tsx has exactly 1 <CommentPopup usage and it is wired', () => {
      const canvas = read(CANVAS_PATH);
      const total = (canvas.match(/<CommentPopup/g) ?? []).length;
      const wired = (canvas.match(/accessMode=\{commentAccessMode\}/g) ?? []).length;
      expect(total).toBe(1);
      expect(wired).toBe(1);
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
