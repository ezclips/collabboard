// Shared by every comment editor that authors TipTap Link marks
// (CommentPopup, CommentEditor -- CommentRow does not yet, see PATCH 8AQ):
// the Link extension config, URL normalization, and apply/unset/insert
// command logic were independently duplicated in both files. This module is
// the editor-agnostic layer PATCH 8AR extracted -- it knows nothing about
// which comment is active, which editor is "the" editor, or how a caller
// saves/restores its own selection; callers resolve all of that themselves
// and hand this module a concrete editor instance, a raw URL string, and an
// already-resolved selection range.
import type { Editor } from '@tiptap/react';
import Link from '@tiptap/extension-link';

// A factory, not a shared module-level instance: each caller's own
// `useEditor` extensions array should call this itself, matching how
// StarterKit/Color/Highlight etc. are already declared per-file today
// rather than imported as one shared configured object.
export function createCommentLinkExtension() {
  return Link.configure({
    openOnClick: false,
    HTMLAttributes: {
      class: 'text-blue-500 underline cursor-pointer',
    },
  });
}

// Bare `example.com` -> `https://example.com`. An already-explicit
// `http://` or `https://` URL passes through unchanged. Does not trim and
// does not treat an empty string specially -- callers decide their own
// trimming/emptiness policy before calling this (CommentPopup trims,
// CommentEditor historically does not; that pre-existing difference is
// preserved, not collapsed, by keeping this function a pure prefixer).
export function normalizeCommentLinkUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

// Applies, updates, or removes a Link mark on `editor`, preserving the exact
// branching both CommentPopup and CommentEditor independently implemented:
//
// - `rawUrl === ''` -> unset the Link mark (restoring `selection` first, if
//   given, so the unset targets the right range).
// - non-empty `rawUrl` with a real selected range -> apply/update the Link
//   mark on exactly that range.
// - non-empty `rawUrl` with a collapsed (or absent) selection -> `setLink`
//   on an empty range would silently produce no anchor at all, so insert
//   `rawUrl` as linked text at the cursor instead (what Docs/Notion/Slack
//   do), then clear the active mark so further typing isn't linked too.
export function applyCommentLink(
  editor: Editor,
  rawUrl: string,
  selection: { from: number; to: number } | null
): void {
  if (rawUrl === '') {
    const chain = editor.chain().focus();
    if (selection) chain.setTextSelection(selection);
    chain.unsetLink().run();
    return;
  }

  const finalUrl = normalizeCommentLinkUrl(rawUrl);

  if (selection && selection.from !== selection.to) {
    editor.chain().focus().setTextSelection(selection).setLink({ href: finalUrl }).run();
    return;
  }

  const chain = editor.chain().focus();
  if (selection) chain.setTextSelection(selection.from);
  chain
    .insertContent({ type: 'text', text: rawUrl, marks: [{ type: 'link', attrs: { href: finalUrl } }] })
    .unsetMark('link')
    .run();
}
