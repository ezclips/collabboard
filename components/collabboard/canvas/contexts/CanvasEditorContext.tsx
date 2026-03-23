'use client';

import React, { createContext, useContext } from 'react';
import type { Padlet } from '@/types/collabboard';

export type CanvasEditorState = {
  padletToEdit: Padlet | null;
  setPadletToEdit: (p: Padlet | null) => void;
  setIsNoteEditorOpen: (v: boolean) => void;
  setIsTableEditorOpen: (v: boolean) => void;
  setIsLinkEditorOpen: (v: boolean) => void;
  setIsTodoEditorOpen: (v: boolean) => void;
  setIsContainerEditorOpen: (v: boolean) => void;
  setIsCommentEditorOpen: (v: boolean) => void;
  setIsImageEditorOpen: (v: boolean) => void;
  setIsDrawingEditorOpen: (v: boolean) => void;
  setIsCardEditorOpen: (v: boolean) => void;
  setIsCardViewerOpen: (v: boolean) => void;
  setIsAIComponentEditorOpen: (v: boolean) => void;
  setIsAIContentEditModalOpen: (v: boolean) => void;
  setIsAIContentConvertModalOpen: (v: boolean) => void;
  imageToolbarPadletId: string | null;
  setImageToolbarPadletId: (v: string | null) => void;
  isImageColorPickerOpen: boolean;
  setIsImageColorPickerOpen: (v: boolean) => void;
  isImageEmojiOpen: boolean;
  setIsImageEmojiOpen: (v: boolean) => void;
  imageColorTab: string;
  setImageColorTab: (v: string) => void;
  setCropPadlet: (p: Padlet | null) => void;
  setIsCropMode: (v: boolean) => void;
  setDrawingPadlet: (p: Padlet | null) => void;
  setIsDrawingMode: (v: boolean) => void;
  editingCaption: string;
  setEditingCaption: (v: string) => void;
  captionPopupPadletId: string | null;
  setCaptionPopupPadletId: (v: string | null) => void;
  textStylePadletId: string | null;
  setTextStylePadletId: (v: string | null) => void;
  cardToolbarPadletId: string | null;
  setCardToolbarPadletId: (v: string | null) => void;
  isCardColorPickerOpen: boolean;
  setIsCardColorPickerOpen: (v: boolean) => void;
  cardColorTab: string;
  setCardColorTab: (v: string) => void;
  captionEditorPadletId: string | null;
  setCaptionEditorPadletId: (v: string | null) => void;
  setIsLibraryOpen: (v: boolean) => void;
  setIconReplaceTargetPadlet: (v: any) => void;
  cardCommentPopupPadletId: string | null;
  setCardCommentPopupPadletId: (v: string | null) => void;
  cardCommentList: any[];
  setCardCommentList: (v: any[]) => void;
  activeCardCommentId: string | null;
  setActiveCardCommentId: (v: string | null) => void;
  editingCardCommentId: string | null;
  setEditingCardCommentId: (v: string | null) => void;
  editingCardCommentText: string;
  setEditingCardCommentText: (v: string) => void;
  commentColorPopupId: string | null;
  setCommentColorPopupId: (v: string | null) => void;
  activeCardComment: any;
  noteBadgeColorPadletId: string | null;
  setNoteBadgeColorPadletId: (v: string | null) => void;
  internalBadgeColorPopupId: string | null;
  setInternalBadgeColorPopupId: (v: string | null) => void;
  internalBadgePopupPosition: { x: number; y: number; alignRight?: boolean } | null;
  setInternalBadgePopupPosition: (v: { x: number; y: number; alignRight?: boolean } | null) => void;
  setDetachedPopupPosition: (v: { x: number; y: number }) => void;
  setDetachedPopupPadletId: (v: string | null) => void;
  setDetachedBadgeColorOpen: (v: boolean) => void;
  setDetachedPopupComments: (v: any[]) => void;
  setDetachedPopupOpen: (v: boolean) => void;
  collapsedPopupPadletId: string | null;
  setCollapsedPopupPadletId: (v: string | null) => void;
  collapsedBadgeColorOpen: boolean;
  setCollapsedBadgeColorOpen: (v: boolean) => void;
  collapsedActiveCommentId: string | null;
  setCollapsedActiveCommentId: (v: string | null) => void;
  collapsedEditingCommentId: string | null;
  setCollapsedEditingCommentId: (v: string | null) => void;
  collapsedEditingText: string;
  setCollapsedEditingText: (v: string) => void;
  collapsedCommentColorPopupId: string | null;
  setCollapsedCommentColorPopupId: (v: string | null) => void;
  setReminderPopupPosition: (v: { x: number; y: number }) => void;
  setReminderPopupTasks: (v: any[]) => void;
  setReminderPopupPadletId: (v: string | null) => void;
  setReminderPopupOpen: (v: boolean) => void;
  setShowDeleteConfirm: (v: boolean) => void;
  setViewDrawingPadlet: (v: Padlet | null) => void;
  setCommentPopupPosition: (v: { x: number; y: number }) => void;
  setCommentPopupComments: (v: any[]) => void;
  setCommentPopupPadletId: (v: string | null) => void;
  setCommentPopupCommentId: (v: string | null) => void;
  setCommentPopupOpen: (v: boolean) => void;
  setCommentPopupHighlightColor: (v: string | undefined) => void;
  setTextLinkColorPickerPosition: (v: { top: number; cardLeft: number } | null) => void;
  setTextLinkColorPickerOpen: (v: boolean) => void;
  commentPopupPosition: { x: number; y: number } | null;
  commentPopupHighlightColor: string | undefined;
};

const CanvasEditorContext = createContext<CanvasEditorState | null>(null);

export function CanvasEditorProvider({
  value,
  children,
}: {
  value: CanvasEditorState;
  children: React.ReactNode;
}) {
  return (
    <CanvasEditorContext.Provider value={value}>
      {children}
    </CanvasEditorContext.Provider>
  );
}

export function useCanvasEditor(): CanvasEditorState {
  const context = useContext(CanvasEditorContext);
  if (!context) {
    throw new Error('useCanvasEditor must be used within a CanvasEditorProvider');
  }
  return context;
}
