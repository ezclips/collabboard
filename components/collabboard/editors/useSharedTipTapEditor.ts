"use client";

import { useEffect } from 'react';
import { useEditor, type Editor, type EditorOptions } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Underline } from '@tiptap/extension-underline';
import { Link } from '@tiptap/extension-link';
import { Highlight } from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Placeholder from '@tiptap/extension-placeholder';
import { FontSize } from './extensions/FontSize';
import { Comment } from './extensions/Comment';

export { EditorContent } from '@tiptap/react';

// Module-level constant -- stable reference, never recreated on render.
// The single shared TipTap extension registry (PATCH-149B1a). A future
// custom node (e.g. a PDF-reference node) registers here, never in a
// second registry.
export const SHARED_TIPTAP_EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [1, 2] },
    link: false,
    underline: false,
  }),
  Underline,
  Link.configure({ openOnClick: false }),
  Highlight.configure({ multicolor: true }),
  TextStyle,
  Color,
  FontSize,
  Comment,
  Placeholder.configure({ placeholder: 'Start typing...' }),
];

type SharedEditorProps = Partial<EditorOptions['editorProps']>;

interface UseSharedTipTapEditorOptions {
  initialContent?: string;
  editable?: boolean;
  onUpdate?: (html: string) => void;
  editorProps?: SharedEditorProps;
}

export function useSharedTipTapEditor({
  initialContent = '',
  editable = true,
  onUpdate,
  editorProps,
}: UseSharedTipTapEditorOptions): Editor | null {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: SHARED_TIPTAP_EXTENSIONS,
    content: initialContent,
    editable,
    editorProps,
    ...(onUpdate ? { onUpdate: ({ editor }) => onUpdate(editor.getHTML()) } : {}),
  }, []);

  useEffect(() => {
    if (editor && initialContent !== editor.getHTML()) {
      editor.commands.setContent(initialContent);
    }
  }, [initialContent, editor]);

  // PATCH-149 §20.15 (F1): emitUpdate=false — setEditable defaults to true and
  // fires a content-less "update" on every mount/toggle otherwise.
  useEffect(() => {
    if (editor) editor.setEditable(editable, false);
  }, [editable, editor]);

  return editor;
}
