// PATCH 8O.1 -- COMMENT UI CONTRACT UNLOCK — PERMISSIONS ONLY.
//
// Source-level architecture guard: every CURRENT canonical Clipart/Image
// CommentPopup call site must pass an explicit accessMode, and every comment
// mutation callback it defines must be wrapped with guardCommentMutation
// before it reaches the caller's own optimistic-local-state-plus-persistence
// body. No canonical caller may silently omit the access contract.
//
// Source-level rather than mounted: FreeformPadletCards.tsx and
// CanvasClient.tsx are both too large to mount in this suite (established
// convention -- see freeformCommentUIContract.characterization.test.tsx),
// and the actual RESOLUTION logic (resolveCommentAccessMode) already has
// full mounted-equivalent unit coverage in lib/domain/canvas/comments.test.ts.
// This file's job is narrower and different: prove the WIRING reaches every
// site it must, and stops at every site it must not (Note).
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

const MUTATION_PROPS = [
  'onSubmit=',
  'onEditComment=',
  'onRemoveComment=',
  'onToggleCommentStrikethrough=',
  'onCommentColor=',
  'onCommentTitleChange=',
  'onCommentTitleStyleChange=',
] as const;

// Every mutation prop present in the block must be wrapped with
// guardCommentMutation( -- not merely present somewhere in the block (a
// block-wide substring check would pass even if only ONE prop were wrapped).
function expectAllMutationPropsGuarded(block: string, expectedBadgeColor: boolean) {
  for (const prop of MUTATION_PROPS) {
    const propStart = block.indexOf(prop);
    expect(propStart, `${prop} must be present in this canonical caller block`).toBeGreaterThan(-1);
    const assignmentStart = propStart + prop.length;
    // The prop is immediately assigned the guardCommentMutation(...) call --
    // allow only whitespace between `=` and the call.
    // JSX curly braces mean the assigned value starts with `{`, e.g.
    // `onSubmit={guardCommentMutation(mode, ...)}` -- match past an optional
    // leading `{`.
    const nextNonSpace = block.slice(assignmentStart).match(/^\s*\{?\s*(\S+)/);
    expect(nextNonSpace?.[1]?.startsWith('guardCommentMutation('), `${prop} must be wrapped with guardCommentMutation(...) at its assignment, found: ${nextNonSpace?.[0]}`).toBe(true);
  }
  if (expectedBadgeColor) {
    const propStart = block.indexOf('onBadgeColorChange=');
    expect(propStart, 'onBadgeColorChange= must be present').toBeGreaterThan(-1);
    const nextNonSpace = block.slice(propStart + 'onBadgeColorChange='.length).match(/^\s*\{?\s*(\S+)/);
    expect(nextNonSpace?.[1]?.startsWith('guardCommentMutation(')).toBe(true);
  }
}

describe('PATCH 8O.1 -- canonical comment permission wiring', () => {
  describe('CommentPopup.tsx exposes the access contract', () => {
    it('accepts an accessMode prop sourced from the shared CommentAccessMode type', () => {
      const popup = read('components/collabboard/editors/CommentPopup.tsx');
      expect(popup).toContain("import type { CommentAccessMode } from '@/lib/domain/canvas/comments';");
      expect(popup).toContain('accessMode?: CommentAccessMode;');
      expect(popup).toContain("const isReadOnly = accessMode === 'read';");
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
        'const startTitleEditing = () => {',
        'const commitTitle = () => {',
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

    // Complements the internal-function guards above: these are the JSX
    // render-condition gates that actually keep mutation UI out of the DOM
    // (not disabled -- absent, so not keyboard/tab reachable). Verified
    // directly that each is independently load-bearing: with the matching
    // internal function guard still in place, removing any ONE of these
    // outer gates alone produces zero mounted-test failures (the inner guard
    // masks it) -- so this structural check is the only thing that catches a
    // regression to this specific layer.
    it('every mutation-affording render condition includes an explicit isReadOnly/!isReadOnly check', () => {
      const popup = read('components/collabboard/editors/CommentPopup.tsx');
      const requiredGateSnippets = [
        // Title editing entry point (the h4's onClick).
        'onClick={!isReadOnly && onCommentTitleChange ? startTitleEditing : undefined}',
        // The titleEditing input itself never renders in read mode even if
        // titleEditing state were somehow true.
        '{!isReadOnly && titleEditing ? (',
        // Title style button.
        '{!isReadOnly && titleEditing && onCommentTitleStyleChange && (',
        // Badge Color button.
        '{!isReadOnly && onBadgeColorChange && (',
        // Badge Color palette popup.
        '{!isReadOnly && badgeColorPickerOpen && onBadgeColorChange && (',
        // Per-comment color popover portal render gate.
        '{!isReadOnly && commentColorPopupId && onCommentColor && (() => {',
        // Per-comment link popover portal render gate.
        '{!isReadOnly && linkPopoverCommentId && createPortal(',
        // Title style popup portal.
        "const titleStylePortal = !isReadOnly && titleStyleOpen && onCommentTitleStyleChange",
        // Whole per-row actions rail (Edit/Color/Link/Strikethrough/Delete).
        '{!isReadOnly && (',
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
  });

  describe('lib/domain/canvas/comments.ts exports the access contract', () => {
    it('exports CommentAccessMode, resolveCommentAccessMode, and guardCommentMutation', () => {
      const domain = read(COMMENTS_DOMAIN_PATH);
      expect(domain).toContain("export type CommentAccessMode = 'read' | 'manage';");
      expect(domain).toContain('export function resolveCommentAccessMode(');
      expect(domain).toContain('export function guardCommentMutation<');
    });
  });

  describe('Clipart -- editor modal (Path A)', () => {
    it('ClipartCardDraftModal.tsx accepts commentAccessMode and forwards it as accessMode', () => {
      const draft = read(DRAFT_PATH);
      expect(draft).toContain("import { guardCommentMutation, type CommentAccessMode } from '@/lib/domain/canvas/comments';");
      expect(draft).toContain('commentAccessMode?: CommentAccessMode;');
      expect(draft).toContain("commentAccessMode = 'manage',");
      const block = commentPopupBlockAfter(draft, '<CommentPopup');
      expect(block).toContain('accessMode={commentAccessMode}');
      expectAllMutationPropsGuarded(block, false);
    });
  });

  describe('Clipart -- saved Site B (on-canvas)', () => {
    it('is wired with accessMode and every mutation callback guarded', () => {
      const freeform = read(FREEFORM_PATH);
      const block = commentPopupBlockAfter(freeform, 'cardCommentPopupPadletId === padlet.id && !cardToolbarPadletId');
      expect(block).toContain('accessMode={commentAccessMode}');
      expectAllMutationPropsGuarded(block, false);
    });
  });

  describe('Image -- three live canonical entry points', () => {
    it('Freeform on-canvas badge popup is wired with accessMode and guarded callbacks (incl. Badge Color)', () => {
      const freeform = read(FREEFORM_PATH);
      const block = commentPopupBlockAfter(freeform, 'cardCommentPopupPadletId === padlet.id && !imageToolbarPadletId');
      expect(block).toContain('accessMode={commentAccessMode}');
      expectAllMutationPropsGuarded(block, true);
    });

    it('Freeform image-toolbar popup is wired with accessMode and guarded callbacks (incl. Badge Color)', () => {
      const freeform = read(FREEFORM_PATH);
      const block = commentPopupBlockAfter(freeform, 'activeImageToolbarPadlet && cardCommentPopupPadletId === activeImageToolbarPadlet.id');
      expect(block).toContain('accessMode={commentAccessMode}');
      expectAllMutationPropsGuarded(block, true);
    });

    it('non-Freeform (Drawing layout) image-toolbar popup in CanvasClient.tsx is wired with accessMode and guarded callbacks', () => {
      const canvas = read(CANVAS_PATH);
      const block = commentPopupBlockAfter(canvas, 'Drawing image toolbar');
      expect(block).toContain('accessMode={commentAccessMode}');
      expectAllMutationPropsGuarded(block, true);
    });
  });

  describe('FreeformPadletCards.tsx receives and threads the resolved access mode', () => {
    it('accepts commentAccessMode on its props interface, defaulted to manage', () => {
      const freeform = read(FREEFORM_PATH);
      expect(freeform).toContain("import { guardCommentMutation, type CommentAccessMode } from '@/lib/domain/canvas/comments';");
      expect(freeform).toContain('commentAccessMode?: CommentAccessMode;');
      expect(freeform).toContain("commentAccessMode = 'manage',");
    });
  });

  describe('CanvasClient.tsx is the controller boundary -- resolves the mode once and threads it down', () => {
    it('computes commentAccessMode via resolveCommentAccessMode(currentWorkspaceRole)', () => {
      const canvas = read(CANVAS_PATH);
      expect(canvas).toContain("import { resolveCommentAccessMode, guardCommentMutation } from '@/lib/domain/canvas/comments';");
      expect(canvas).toContain('resolveCommentAccessMode(currentWorkspaceRole)');
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

  describe('Note detached comments are explicitly NOT wired by this patch (scope boundary)', () => {
    it('both Note CommentPopup call sites in FreeformPadletCards.tsx have no accessMode and no guardCommentMutation', () => {
      const freeform = read(FREEFORM_PATH);
      const firstNoteAnchor = 'Note detached comments use the canonical panel; this shell only owns placement and close state.';
      const secondNoteAnchor = 'Note detached comments use the canonical panel; this toolbar shell owns placement only.';
      const firstBlock = commentPopupBlockAfter(freeform, firstNoteAnchor);
      const secondBlock = commentPopupBlockAfter(freeform, secondNoteAnchor);
      for (const block of [firstBlock, secondBlock]) {
        expect(block).not.toContain('accessMode=');
        expect(block).not.toContain('guardCommentMutation(');
      }
    });

    it('overall guardCommentMutation usage count in FreeformPadletCards.tsx matches exactly the 3 in-scope sites (8 + 7 + 8 callbacks), proving Note was not touched', () => {
      const freeform = read(FREEFORM_PATH);
      const count = (freeform.match(/guardCommentMutation\(/g) ?? []).length;
      // Image on-canvas (8: title, titleStyle, badge, submit, edit, remove,
      // toggle, color) + Clipart Site B (7: same set minus badge) + Image
      // toolbar (8) = 23.
      expect(count).toBe(23);
    });
  });

  describe('architecture guard -- every <CommentPopup usage in these three files is accounted for', () => {
    it('FreeformPadletCards.tsx has exactly 5 <CommentPopup usages: 3 wired (Clipart Site B, Image x2), 2 unwired (Note x2)', () => {
      const freeform = read(FREEFORM_PATH);
      const total = (freeform.match(/<CommentPopup/g) ?? []).length;
      const wired = (freeform.match(/accessMode=\{commentAccessMode\}/g) ?? []).length;
      expect(total).toBe(5);
      expect(wired).toBe(3);
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
