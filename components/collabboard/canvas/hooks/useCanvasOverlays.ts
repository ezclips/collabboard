"use client";

import { useState } from 'react';
import type { ChronoMode, Padlet, PendingPostDraft } from '@/types/collabboard';

export function useCanvasOverlays() {
  const [chronoMode, setChronoMode] = useState<ChronoMode | null>(null);
  const [showChronoModeModal, setShowChronoModeModal] = useState(false);
  const [imageColorTab, setImageColorTab] = useState<'background' | 'topstrip'>('background');
  const [cardToolbarPadletId, setCardToolbarPadletId] = useState<string | null>(null);

  const [commentPopupOpen, setCommentPopupOpen] = useState(false);
  const [commentPopupPosition, setCommentPopupPosition] = useState({ x: 0, y: 0 });
  const [commentPopupComments, setCommentPopupComments] = useState<Array<{
    id: string;
    text: string;
    userId: string;
    userName: string;
    timestamp: number;
    isStrikethrough?: boolean;
  }>>([]);
  const [commentPopupPadletId, setCommentPopupPadletId] = useState<string | null>(null);
  const [commentPopupCommentId, setCommentPopupCommentId] = useState<string | null>(null);
  const [textLinkColorPickerOpen, setTextLinkColorPickerOpen] = useState(false);
  const [textLinkColorPickerPosition, setTextLinkColorPickerPosition] = useState<{ cardLeft: number; top: number } | null>(null);
  const [commentPopupHighlightColor, setCommentPopupHighlightColor] = useState<string | undefined>(undefined);

  const [wallPlacementPromptOpen, setWallPlacementPromptOpen] = useState(false);
  const [wallPendingPostDraft, setWallPendingPostDraft] = useState<PendingPostDraft | null>(null);
  const [wallPlacementMode, setWallPlacementMode] = useState<'idle' | 'pickExistingContainer'>('idle');
  const [wallActiveContainerTargetId, setWallActiveContainerTargetId] = useState<string | null>(null);
  const [wallContextMenuState, setWallContextMenuState] = useState<{
    padletId: string;
    x: number;
    y: number;
  } | null>(null);

  const [containerCreationPromptOpen, setContainerCreationPromptOpen] = useState(false);
  const [containerCreationLocation, setContainerCreationLocation] = useState<{ sectionId: number, position: number } | null>(null);

  const [detachedPopupOpen, setDetachedPopupOpen] = useState(false);
  const [detachedPopupPosition, setDetachedPopupPosition] = useState({ x: 0, y: 0 });
  const [detachedPopupPadletId, setDetachedPopupPadletId] = useState<string | null>(null);
  const [detachedBadgeColorOpen, setDetachedBadgeColorOpen] = useState(false);
  const [detachedPopupComments, setDetachedPopupComments] = useState<Array<{
    id: string;
    text: string;
    userId: string;
    userName: string;
    timestamp: number;
  }>>([]);

  const [cardCommentPopupPadletId, setCardCommentPopupPadletId] = useState<string | null>(null);
  const [cardCommentList, setCardCommentList] = useState<Array<{
    id: string;
    text: string;
    userId: string;
    userName: string;
    timestamp: number;
    isStrikethrough?: boolean;
    textColor?: string;
    backgroundColor?: string;
  }>>([]);
  const [activeCardCommentId, setActiveCardCommentId] = useState<string | null>(null);
  const [editingCardCommentId, setEditingCardCommentId] = useState<string | null>(null);
  const [editingCardCommentText, setEditingCardCommentText] = useState('');
  const [commentColorPopupId, setCommentColorPopupId] = useState<string | null>(null);
  const [noteBadgeColorPadletId, setNoteBadgeColorPadletId] = useState<string | null>(null);
  const [internalBadgeColorPopupId, setInternalBadgeColorPopupId] = useState<string | null>(null);
  const [internalBadgePopupPosition, setInternalBadgePopupPosition] = useState<{ x: number; y: number; alignRight: boolean } | null>(null);

  const [isLibraryOpen, setIsLibraryOpen] = useState(false);

  const [reminderPopupOpen, setReminderPopupOpen] = useState(false);
  const [reminderPopupPosition, setReminderPopupPosition] = useState({ x: 0, y: 0 });
  const [reminderPopupTasks, setReminderPopupTasks] = useState<Array<{
    id: string;
    text: string;
    dueDate: string;
    dueTime?: string;
    isOverdue: boolean;
  }>>([]);
  const [reminderPopupPadletId, setReminderPopupPadletId] = useState<string | null>(null);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [collapsedPopupPadletId, setCollapsedPopupPadletId] = useState<string | null>(null);
  const [collapsedBadgeColorOpen, setCollapsedBadgeColorOpen] = useState(false);
  const [collapsedActiveCommentId, setCollapsedActiveCommentId] = useState<string | null>(null);
  const [collapsedEditingCommentId, setCollapsedEditingCommentId] = useState<string | null>(null);
  const [collapsedEditingText, setCollapsedEditingText] = useState('');
  const [collapsedCommentColorPopupId, setCollapsedCommentColorPopupId] = useState<string | null>(null);

  const [syncPrompt, setSyncPrompt] = useState<{ sourceId: string; duplicateId: string } | null>(null);
  const [imageToolbarPadletId, setImageToolbarPadletId] = useState<string | null>(null);

  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [drawingPadlet, setDrawingPadlet] = useState<Padlet | null>(null);
  const [isCaptionMode, setIsCaptionMode] = useState(false);
  const [editingCaption, setEditingCaption] = useState('');
  const [isImageEmojiOpen, setIsImageEmojiOpen] = useState(false);
  const [imageEditorTab, setImageEditorTab] = useState<'search' | 'upload'>('search');
  const [isCropMode, setIsCropMode] = useState(false);
  const [cropPadlet, setCropPadlet] = useState<Padlet | null>(null);
  const [captionPopupPadletId, setCaptionPopupPadletId] = useState<string | null>(null);
  const [textStylePadletId, setTextStylePadletId] = useState<string | null>(null);
  const [isCardViewerOpen, setIsCardViewerOpen] = useState(false);
  const [isCardColorPickerOpen, setIsCardColorPickerOpen] = useState(false);
  const [isImageColorPickerOpen, setIsImageColorPickerOpen] = useState(false);
  const [cardColorPickerPosition, setCardColorPickerPosition] = useState({ x: 0, y: 0 });
  const [cardColorTab, setCardColorTab] = useState<'background' | 'topstrip' | 'icon'>('topstrip');
  const [captionEditorPadletId, setCaptionEditorPadletId] = useState<string | null>(null);
  const [iconReplaceTargetPadlet, setIconReplaceTargetPadlet] = useState<Padlet | null>(null);

  return {
    chronoMode,
    setChronoMode,
    showChronoModeModal,
    setShowChronoModeModal,
    imageColorTab,
    setImageColorTab,
    cardToolbarPadletId,
    setCardToolbarPadletId,
    commentPopupOpen,
    setCommentPopupOpen,
    commentPopupPosition,
    setCommentPopupPosition,
    commentPopupComments,
    setCommentPopupComments,
    commentPopupPadletId,
    setCommentPopupPadletId,
    commentPopupCommentId,
    setCommentPopupCommentId,
    textLinkColorPickerOpen,
    setTextLinkColorPickerOpen,
    textLinkColorPickerPosition,
    setTextLinkColorPickerPosition,
    commentPopupHighlightColor,
    setCommentPopupHighlightColor,
    wallPlacementPromptOpen,
    setWallPlacementPromptOpen,
    wallPendingPostDraft,
    setWallPendingPostDraft,
    wallPlacementMode,
    setWallPlacementMode,
    wallActiveContainerTargetId,
    setWallActiveContainerTargetId,
    wallContextMenuState,
    setWallContextMenuState,
    containerCreationPromptOpen,
    setContainerCreationPromptOpen,
    containerCreationLocation,
    setContainerCreationLocation,
    detachedPopupOpen,
    setDetachedPopupOpen,
    detachedPopupPosition,
    setDetachedPopupPosition,
    detachedPopupPadletId,
    setDetachedPopupPadletId,
    detachedBadgeColorOpen,
    setDetachedBadgeColorOpen,
    detachedPopupComments,
    setDetachedPopupComments,
    cardCommentPopupPadletId,
    setCardCommentPopupPadletId,
    cardCommentList,
    setCardCommentList,
    activeCardCommentId,
    setActiveCardCommentId,
    editingCardCommentId,
    setEditingCardCommentId,
    editingCardCommentText,
    setEditingCardCommentText,
    commentColorPopupId,
    setCommentColorPopupId,
    noteBadgeColorPadletId,
    setNoteBadgeColorPadletId,
    internalBadgeColorPopupId,
    setInternalBadgeColorPopupId,
    internalBadgePopupPosition,
    setInternalBadgePopupPosition,
    isLibraryOpen,
    setIsLibraryOpen,
    reminderPopupOpen,
    setReminderPopupOpen,
    reminderPopupPosition,
    setReminderPopupPosition,
    reminderPopupTasks,
    setReminderPopupTasks,
    reminderPopupPadletId,
    setReminderPopupPadletId,
    showDeleteConfirm,
    setShowDeleteConfirm,
    collapsedPopupPadletId,
    setCollapsedPopupPadletId,
    collapsedBadgeColorOpen,
    setCollapsedBadgeColorOpen,
    collapsedActiveCommentId,
    setCollapsedActiveCommentId,
    collapsedEditingCommentId,
    setCollapsedEditingCommentId,
    collapsedEditingText,
    setCollapsedEditingText,
    collapsedCommentColorPopupId,
    setCollapsedCommentColorPopupId,
    syncPrompt,
    setSyncPrompt,
    imageToolbarPadletId,
    setImageToolbarPadletId,
    isDrawingMode,
    setIsDrawingMode,
    drawingPadlet,
    setDrawingPadlet,
    isCaptionMode,
    setIsCaptionMode,
    editingCaption,
    setEditingCaption,
    isImageEmojiOpen,
    setIsImageEmojiOpen,
    imageEditorTab,
    setImageEditorTab,
    isCropMode,
    setIsCropMode,
    cropPadlet,
    setCropPadlet,
    captionPopupPadletId,
    setCaptionPopupPadletId,
    textStylePadletId,
    setTextStylePadletId,
    isCardViewerOpen,
    setIsCardViewerOpen,
    isCardColorPickerOpen,
    setIsCardColorPickerOpen,
    isImageColorPickerOpen,
    setIsImageColorPickerOpen,
    cardColorPickerPosition,
    setCardColorPickerPosition,
    cardColorTab,
    setCardColorTab,
    captionEditorPadletId,
    setCaptionEditorPadletId,
    iconReplaceTargetPadlet,
    setIconReplaceTargetPadlet,
  };
}
