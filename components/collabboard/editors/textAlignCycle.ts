import type { Editor } from '@tiptap/react';

// The Align button (TextFormattingButtons) has no left/center/right submenu
// -- each click just cycles the current selection's alignment forward
// through this fixed order, wrapping back to the start.
const ALIGN_ORDER = ['left', 'center', 'right'] as const;
export type TextAlignValue = (typeof ALIGN_ORDER)[number];

export function nextTextAlign(current: TextAlignValue): TextAlignValue {
  return ALIGN_ORDER[(ALIGN_ORDER.indexOf(current) + 1) % ALIGN_ORDER.length];
}

export function cycleEditorTextAlign(editor: Editor): void {
  const current = ALIGN_ORDER.find((align) => editor.isActive({ textAlign: align })) ?? 'left';
  editor.chain().focus().setTextAlign(nextTextAlign(current)).run();
}
