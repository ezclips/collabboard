'use client';

import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { Padlet } from '@/types/collabboard';
import CardPreview from '@/components/collabboard/CardPreview';
import CardEditor from '@/components/collabboard/CardEditor';
import CardActionsToolbar from '@/components/collabboard/editors/CardActionsToolbar';
import { CardColorPanel } from '@/components/collabboard/editors/CardColorPanel';
import CommentPopup from '@/components/collabboard/editors/CommentPopup';
import TextStylePopup from '@/components/collabboard/editors/TextStylePopup';
import InlineCaption from '@/components/collabboard/editors/InlineCaption';
import { CAPTION_STYLE_PRESETS, resolveCaptionStyle, type CaptionHeading } from '@/lib/domain/canvas/captionStyle';
import { nextTextAlign, type TextAlignValue } from '@/components/collabboard/editors/textAlignCycle';
import EmojiReactionPicker from '@/components/collabboard/editors/EmojiReactionPicker';
import { getMeaningfulTitle } from '@/lib/infra/collabboard/postTitle';
import { guardCommentMutation, guardCommentComposition, guardOwnCommentMutation, type CommentAccessMode } from '@/lib/domain/canvas/comments';

const BADGE_COLORS = [
  '#fef9c3', '#fef08a', '#fde047', '#facc15', '#eab308', '#ca8a04',
  '#f3f4f6', '#e5e7eb', '#d1d5db', '#9ca3af', '#6b7280', '#4b5563',
  '#ffedd5', '#fed7aa', '#fdba74', '#fb923c', '#f97316', '#ea580c',
  '#fce7f3', '#fbcfe8', '#f9a8d4', '#f472b6', '#ec4899', '#db2777',
  '#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb',
  '#dcfce7', '#bbf7d0', '#86efac', '#4ade80', '#22c55e', '#16a34a',
  '#f3e8ff', '#e9d5ff', '#d8b4fe', '#c084fc', '#a855f7', '#9333ea',
  '#ccfbf1', '#99f6e4', '#5eead4', '#2dd4bf', '#14b8a6', '#0d9488',
];

// Badge-colour palette geometry (PATCH-121). The palette is absolutely
// positioned inside the 28px swatch button wrapper, so it must state its own
// width: shrink-to-fit would otherwise resolve against that 28px containing
// block and compress the six columns. Fixed tracks keep swatches from
// shrinking. Mirrors the working Note/Table/Image palette (20px swatches,
// 6px gap, p-2).
const BADGE_PALETTE_COLUMNS = 6;
const BADGE_SWATCH_SIZE_PX = 20;
const BADGE_SWATCH_GAP_PX = 6;
const BADGE_PALETTE_PADDING_PX = 8;
const BADGE_PALETTE_WIDTH_PX =
  BADGE_PALETTE_COLUMNS * BADGE_SWATCH_SIZE_PX
  + (BADGE_PALETTE_COLUMNS - 1) * BADGE_SWATCH_GAP_PX
  + BADGE_PALETTE_PADDING_PX * 2;

interface ClipartCardDraftModalProps {
  isOpen: boolean;
  padlet: Padlet | null;
  onClose: () => void;
  onDiscard: () => void;
  onChange: (nextPadlet: Padlet) => void;
  onReplaceIcon: () => void;
  // PATCH 8O.1 -- explicit comment access contract, resolved by the caller
  // (CanvasClient.tsx) from the effective workspace/board permission. Defaults
  // to 'manage' so this modal's writable behavior is unchanged for every
  // caller that has not yet been updated to pass it.
  commentAccessMode?: CommentAccessMode;
  // PATCH 8O.2 -- real authenticated identity, needed so a 'comment'-mode
  // user's own newly-added comment is attributable to THEM (not the
  // pre-8O.2 hardcoded 'anon' every comment added through this modal used
  // to get -- see the removed draftCommentUserId literal below). Optional/
  // defaulted so any caller that hasn't been updated keeps today's exact
  // ('anon'/'You') behavior; 'manage' mode's visible UI is unaffected either
  // way -- only the userId/userName stored on a NEW comment changes.
  currentUserId?: string;
  currentUserName?: string;
}

export default function ClipartCardDraftModal({
  isOpen,
  padlet,
  onClose,
  onDiscard,
  onChange,
  onReplaceIcon,
  commentAccessMode = 'manage',
  currentUserId = 'anon',
  currentUserName = 'You',
}: ClipartCardDraftModalProps) {
  const [isColorPanelOpen, setIsColorPanelOpen] = useState(false);
  const [isCardViewOpen, setIsCardViewOpen] = useState(false);
  const [isReactionPickerOpen, setIsReactionPickerOpen] = useState(false);
  const [isCommentPanelOpen, setIsCommentPanelOpen] = useState(false);
  const [isBadgeColorPaletteOpen, setIsBadgeColorPaletteOpen] = useState(false);
  // Which of title/caption the shared Text style panel currently targets --
  // null means the panel is closed. Two separate toolbar buttons (Text
  // style, Caption) each open it aimed at their own field, same pattern as
  // DrawingEditor's activeStyleTarget.
  const [activeStyleTarget, setActiveStyleTarget] = useState<'title' | 'caption' | null>(null);

  const previewPadlet = useMemo(() => {
    if (!padlet) return null;
    return {
      ...padlet,
      metadata: {
        ...(padlet.metadata || {}),
        counterType: padlet.metadata?.counterType || 'words',
      },
    };
  }, [padlet]);

  if (!isOpen || !previewPadlet) return null;

  const updateMetadata = (updates: Record<string, unknown>) => {
    onChange({
      ...previewPadlet,
      metadata: {
        ...(previewPadlet.metadata || {}),
        ...updates,
      },
    });
  };

  const reactions = Array.isArray(previewPadlet.metadata?.reactions)
    ? previewPadlet.metadata.reactions.filter((reaction): reaction is string => typeof reaction === 'string')
    : [];
  type CommentData = NonNullable<React.ComponentProps<typeof CommentPopup>['comments']>[number];
  const detachedComments = Array.isArray(previewPadlet.metadata?.detachedComments)
    ? previewPadlet.metadata.detachedComments.filter((comment): comment is CommentData => {
        const candidate = comment as Partial<CommentData> | null;
        return !!candidate &&
          typeof candidate.id === 'string' &&
          typeof candidate.text === 'string' &&
          typeof candidate.userId === 'string' &&
          typeof candidate.userName === 'string' &&
          typeof candidate.timestamp === 'number';
      })
    : [];
  const draftCommentUserId = currentUserId;
  const draftCommentUserName = currentUserName;
  const commentCountSource = Array.isArray(previewPadlet.metadata?.detachedComments)
    ? previewPadlet.metadata.detachedComments
    : Array.isArray(previewPadlet.metadata?.comments)
      ? previewPadlet.metadata.comments
      : [];
  const commentCount = commentCountSource.length;
  const commentBadgeColor = typeof previewPadlet.metadata?.badgeColor === 'string' && previewPadlet.metadata.badgeColor.trim()
    ? previewPadlet.metadata.badgeColor
    : '#facc15';

  const openReactionPicker = () => {
    setIsReactionPickerOpen(true);
    setIsCommentPanelOpen(false);
    setIsColorPanelOpen(false);
    setIsBadgeColorPaletteOpen(false);
    setActiveStyleTarget(null);
  };

  const openCommentPanel = () => {
    setIsCommentPanelOpen(true);
    setIsReactionPickerOpen(false);
    setIsColorPanelOpen(false);
    setIsBadgeColorPaletteOpen(false);
    setActiveStyleTarget(null);
  };

  const openStylePanel = (target: 'title' | 'caption') => {
    setActiveStyleTarget(target);
    setIsColorPanelOpen(false);
    setIsReactionPickerOpen(false);
    setIsCommentPanelOpen(false);
    setIsBadgeColorPaletteOpen(false);
  };

  const keepToolbarClickFromBlurringCaption = (e: React.MouseEvent<HTMLDivElement>) => {
    if (activeStyleTarget !== 'caption') return;
    const target = e.target as { closest?: (selector: string) => Element | null };
    if (typeof target.closest === 'function' && target.closest('button')) {
      e.preventDefault();
    }
  };

  const writeTitleStyle = (nextTitleStyle: Record<string, unknown>) => {
    updateMetadata({ titleStyle: nextTitleStyle });
  };

  const writeCaptionStyle = (nextCaptionStyle: Record<string, unknown>) => {
    updateMetadata({ captionStyle: nextCaptionStyle });
  };

  const applyPreset = (writer: (style: Record<string, unknown>) => void, baseStyle: Record<string, unknown>) => (level: CaptionHeading) => {
    const selectedPreset = level === 'callout' && baseStyle.backgroundColor
      ? { ...CAPTION_STYLE_PRESETS.callout, backgroundColor: baseStyle.backgroundColor }
      : CAPTION_STYLE_PRESETS[level];

    writer({ ...baseStyle, ...selectedPreset });
  };

  // Title and caption each get their own style, stored under their own
  // metadata key (metadata.titleStyle / metadata.captionStyle) so changing
  // one's color/heading/weight never affects the other -- previously both
  // read and wrote the single metadata.captionStyle field (a legacy quirk
  // from before the caption field existed, when this same field styled the
  // title), which coupled their colors. Same split DrawingEditor.tsx already
  // uses. Bold/Italic/Underline/Strikethrough (TextFormattingButtons, shared
  // across every Text style panel) toggle on top of whichever heading preset
  // is active, same layering as a TipTap mark over a paragraph.
  const titleStyle = (previewPadlet.metadata?.titleStyle as Record<string, unknown>) || {};
  const titleInputStyle = resolveCaptionStyle(titleStyle, previewPadlet.metadata?.textColor);
  const applyTitlePreset = applyPreset(writeTitleStyle, titleStyle);
  const isTitleBold = titleStyle.fontWeight === '700' || titleStyle.fontWeight === 'bold';
  const isTitleItalic = titleStyle.fontStyle === 'italic';
  const toggleTitleBold = () => writeTitleStyle({ ...titleStyle, fontWeight: isTitleBold ? '400' : '700' });
  const toggleTitleItalic = () => writeTitleStyle({ ...titleStyle, fontStyle: isTitleItalic ? 'normal' : 'italic' });
  const toggleTitleUnderline = () => writeTitleStyle({ ...titleStyle, underline: !titleStyle.underline });
  const toggleTitleStrikethrough = () => writeTitleStyle({ ...titleStyle, strikethrough: !titleStyle.strikethrough });
  const cycleTitleAlign = () => writeTitleStyle({ ...titleStyle, textAlign: nextTextAlign((titleStyle.textAlign as TextAlignValue) || 'left') });

  const captionStyle = (previewPadlet.metadata?.captionStyle as Record<string, unknown>) || {};
  const captionInputStyle = resolveCaptionStyle(captionStyle, previewPadlet.metadata?.textColor);
  const caption = typeof previewPadlet.metadata?.caption === 'string' ? previewPadlet.metadata.caption : '';
  const applyCaptionPreset = applyPreset(writeCaptionStyle, captionStyle);
  const isCaptionBold = captionStyle.fontWeight === '700' || captionStyle.fontWeight === 'bold';
  const isCaptionItalic = captionStyle.fontStyle === 'italic';
  const toggleCaptionBold = () => writeCaptionStyle({ ...captionStyle, fontWeight: isCaptionBold ? '400' : '700' });
  const toggleCaptionItalic = () => writeCaptionStyle({ ...captionStyle, fontStyle: isCaptionItalic ? 'normal' : 'italic' });
  const toggleCaptionUnderline = () => writeCaptionStyle({ ...captionStyle, underline: !captionStyle.underline });
  const toggleCaptionStrikethrough = () => writeCaptionStyle({ ...captionStyle, strikethrough: !captionStyle.strikethrough });
  const cycleCaptionAlign = () => writeCaptionStyle({ ...captionStyle, textAlign: nextTextAlign((captionStyle.textAlign as TextAlignValue) || 'left') });

  // Whichever field the Text style panel currently targets -- resolved once
  // so the popup's props below stay a simple pass-through, same pattern as
  // DrawingEditor's textStylePopupProps.
  const textStylePopupProps = activeStyleTarget === 'title'
    ? {
        onSelectHeading: applyTitlePreset,
        onSelectColor: (color: string) => writeTitleStyle({ ...titleStyle, color }),
        onSelectHighlight: (color: string) => writeTitleStyle({ ...titleStyle, backgroundColor: color }),
        currentHeading: (titleStyle.heading as string) || 'normal',
        currentColor: titleStyle.color as string | undefined,
        currentHighlight: titleStyle.backgroundColor as string | undefined,
        onBold: toggleTitleBold,
        onItalic: toggleTitleItalic,
        onUnderline: toggleTitleUnderline,
        onStrikethrough: toggleTitleStrikethrough,
        onAlign: cycleTitleAlign,
        isBold: isTitleBold,
        isItalic: isTitleItalic,
        isUnderline: !!titleStyle.underline,
        isStrikethrough: !!titleStyle.strikethrough,
      }
    : {
        onSelectHeading: applyCaptionPreset,
        onSelectColor: (color: string) => writeCaptionStyle({ ...captionStyle, color }),
        onSelectHighlight: (color: string) => writeCaptionStyle({ ...captionStyle, backgroundColor: color }),
        currentHeading: (captionStyle.heading as string) || 'normal',
        currentColor: captionStyle.color as string | undefined,
        currentHighlight: captionStyle.backgroundColor as string | undefined,
        onBold: toggleCaptionBold,
        onItalic: toggleCaptionItalic,
        onUnderline: toggleCaptionUnderline,
        onStrikethrough: toggleCaptionStrikethrough,
        onAlign: cycleCaptionAlign,
        isBold: isCaptionBold,
        isItalic: isCaptionItalic,
        isUnderline: !!captionStyle.underline,
        isStrikethrough: !!captionStyle.strikethrough,
      };

  return (
    <div className="fixed inset-0 z-[160] flex items-start justify-center overflow-auto p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Save clipart card"
      />

      {/* Three-column grid, not a centered flex row (see PostEditorShell.tsx
          for the same fix and rationale): the two flanking columns are both
          `1fr`, always equal width to each other regardless of what (or
          whether anything) is open in them, so the card's on-screen position
          never shifts when a side panel opens/closes/changes width. Width is
          fixed at the original max-w bound (rather than shrink-to-content)
          because the flanking `1fr` columns need a definite container width
          to distribute against. Grid tracks are pointer-events: none (pure
          layout, often wider than their visible content) with pointer
          events re-enabled only on the actual toolbar/card/panel boxes, so
          empty grid space still counts as a genuine backdrop click. */}
      <div
        data-testid="clipart-composition-row"
        className="relative m-auto grid items-start gap-6"
        style={{ gridTemplateColumns: '1fr auto 1fr', width: 'calc(100vw - 80px)', pointerEvents: 'none' }}
      >
        <div className="flex items-start justify-end" style={{ pointerEvents: 'none' }}>
        <div
          data-testid="clipart-toolbar-wrapper"
          onMouseDownCapture={keepToolbarClickFromBlurringCaption}
          style={{ pointerEvents: 'auto' }}
          onClick={(e) => e.stopPropagation()}
        >
          <CardActionsToolbar
            padlet={previewPadlet}
            isColorPickerOpen={isColorPanelOpen}
            isCardView={!!previewPadlet.metadata?.showCardView}
            commentCount={commentCount}
            commentBadgeColor={commentBadgeColor}
            onColorClick={(e) => {
              e.stopPropagation();
              setIsColorPanelOpen((prev) => !prev);
              setIsReactionPickerOpen(false);
              setIsCommentPanelOpen(false);
              setIsBadgeColorPaletteOpen(false);
              setActiveStyleTarget(null);
            }}
            onReplaceIcon={onReplaceIcon}
            onTextStyle={() => openStylePanel('title')}
            isTextStyleActive={activeStyleTarget === 'title'}
            onCaption={() => openStylePanel('caption')}
            isCaptionActive={activeStyleTarget === 'caption'}
            onToggleCardView={() => {
              setIsCardViewOpen(true);
            }}
            onAddReaction={(e) => {
              e.stopPropagation();
              openReactionPicker();
            }}
            onComment={openCommentPanel}
            onDelete={onDiscard}
          />
        </div>
        </div>

        <div
          data-testid="clipart-main-panel"
          className="flex w-[220px] flex-col items-stretch"
          style={{ pointerEvents: 'auto' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            data-testid="clipart-card-preview-anchor"
            className="relative w-[220px] overflow-visible"
          >
            <div
              data-testid="clipart-card-preview-wrapper"
              className="flex flex-col overflow-hidden border border-gray-200 shadow-2xl"
              style={{
                width: '220px',
                minHeight: '200px',
                backgroundColor: typeof previewPadlet.metadata?.backgroundColor === 'string'
                  ? previewPadlet.metadata.backgroundColor
                  : '#ffffff',
              }}
            >
              <CardPreview
                padlet={previewPadlet}
                isSelected={false}
                titleEditor={
                  <input
                    type="text"
                    data-testid="clipart-post-name-input"
                    value={getMeaningfulTitle(previewPadlet.title, 'card')}
                    onChange={(e) => onChange({ ...previewPadlet, title: e.target.value })}
                    placeholder="Post name"
                    className="w-full min-w-0 truncate bg-transparent text-center text-xs font-semibold outline-none placeholder:opacity-40"
                    style={titleInputStyle}
                    onMouseDown={(e) => e.stopPropagation()}
                    onSelect={(e) => {
                      const el = e.currentTarget;
                      if (el.selectionStart !== el.selectionEnd) openStylePanel('title');
                    }}
                  />
                }
                reactions={reactions}
                onAddReaction={openReactionPicker}
                onReactionClick={(emoji) => {
                  const indexToRemove = reactions.indexOf(emoji);
                  if (indexToRemove === -1) return;
                  updateMetadata({
                    reactions: [
                      ...reactions.slice(0, indexToRemove),
                      ...reactions.slice(indexToRemove + 1),
                    ],
                  });
                }}
                captionEditor={
                  <InlineCaption
                    value={caption}
                    isEditing={activeStyleTarget === 'caption'}
                    onChange={(next) => updateMetadata({ caption: next })}
                    onTextSelect={() => openStylePanel('caption')}
                    placeholder="Add a caption..."
                    color={captionInputStyle.color}
                    textStyle={captionInputStyle}
                  />
                }
              />
            </div>
            {commentCount > 0 ? (
              <button
                type="button"
                data-testid="clipart-main-comment-badge"
                className="absolute -right-2 -top-2 z-[1200] flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-gray-800 shadow-md"
                style={{ backgroundColor: commentBadgeColor }}
                aria-label={`Open comments, ${commentCount} comments`}
                onClick={(e) => {
                  e.stopPropagation();
                  openCommentPanel();
                }}
              >
                {commentCount}
              </button>
            ) : null}
          </div>

        </div>

        {/* Right-side grid column (same architecture as Note/Document's
            sharedPanel slot in PostEditorShell.tsx): this column is `1fr`,
            always equal width to the toolbar's `1fr` column regardless of
            which panel (if any) is open, so opening one no longer drags the
            card sideways. */}
        <div className="flex items-start justify-start" style={{ pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto' }} onClick={(e) => e.stopPropagation()}>
        {activeStyleTarget ? (
          <div className="relative">
            <button
              onClick={() => setActiveStyleTarget(null)}
              className="absolute -right-3 -top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-md transition-all hover:text-gray-600"
              title="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <div
              data-testid="clipart-caption-style-panel"
              className="bg-white rounded-lg shadow-xl border border-gray-200 p-3 min-w-[240px] max-h-[calc(100vh-2rem)] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
            <TextStylePopup
              isOpen
              onOpenChange={(open) => { if (!open) setActiveStyleTarget(null); }}
              hideCloseButton
              {...textStylePopupProps}
            />
            </div>
          </div>
        ) : null}

        {isColorPanelOpen ? (
          <div data-testid="clipart-color-panel-wrapper" onClick={(e) => e.stopPropagation()}>
            <CardColorPanel
              iconColor={previewPadlet.metadata?.iconBgColor}
              bgColor={previewPadlet.metadata?.backgroundColor}
              topStrip={previewPadlet.metadata?.topStripColor}
              onChangeTarget={(target, value) => {
                if (target === 'icon') updateMetadata({ iconBgColor: value });
                if (target === 'bg') updateMetadata({ backgroundColor: value });
                if (target === 'ts') updateMetadata({ topStripColor: value });
              }}
              onClose={() => setIsColorPanelOpen(false)}
            />
          </div>
        ) : null}

        {isReactionPickerOpen ? (
          <div
            data-testid="clipart-reaction-panel-wrapper"
            className="animate-in fade-in zoom-in duration-200"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div>
              <EmojiReactionPicker
                isOpen={isReactionPickerOpen}
                onOpenChange={setIsReactionPickerOpen}
                onSelectEmoji={(emoji) => {
                  updateMetadata({ reactions: [...reactions, emoji] });
                  setIsReactionPickerOpen(false);
                }}
                inline
              />
            </div>
          </div>
        ) : null}

        {isCommentPanelOpen ? (
          <div
            data-testid="clipart-comments-panel"
            className="relative"
            style={{ minWidth: '320px' }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="absolute right-4 top-3 z-10">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsBadgeColorPaletteOpen((open) => !open);
                }}
                className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100"
                title="Badge Color"
              >
                <span
                  className="w-4 h-4 rounded border border-gray-300"
                  style={{ backgroundColor: commentBadgeColor }}
                />
              </button>
              {isBadgeColorPaletteOpen ? (
                <div
                  data-testid="clipart-badge-color-palette"
                  className="absolute right-0 top-9 z-20 bg-white rounded-lg shadow-lg border border-gray-200 p-2"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  style={{ width: `${BADGE_PALETTE_WIDTH_PX}px` }}
                >
                  <div
                    data-testid="clipart-badge-color-grid"
                    className="grid gap-1.5"
                    style={{ gridTemplateColumns: `repeat(${BADGE_PALETTE_COLUMNS}, ${BADGE_SWATCH_SIZE_PX}px)` }}
                  >
                    {BADGE_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateMetadata({ badgeColor: color });
                          setIsBadgeColorPaletteOpen(false);
                        }}
                        data-badge-color-swatch={color}
                        className={`shrink-0 rounded transition-colors ${commentBadgeColor === color ? 'ring-2 ring-blue-500' : ''}`}
                        style={{
                          width: `${BADGE_SWATCH_SIZE_PX}px`,
                          height: `${BADGE_SWATCH_SIZE_PX}px`,
                          backgroundColor: color,
                          border: ['#f3f4f6', '#e5e7eb', '#fef9c3', '#fef08a'].includes(color) ? '1px solid #d1d5db' : 'none',
                        }}
                        title={color}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <CommentPopup
              isOpen={isCommentPanelOpen}
              onOpenChange={(open) => {
                setIsCommentPanelOpen(open);
                if (!open) setIsBadgeColorPaletteOpen(false);
              }}
              commentTitle={typeof previewPadlet.metadata?.commentTitle === 'string' ? previewPadlet.metadata.commentTitle : undefined}
              commentTitleStyle={previewPadlet.metadata?.commentTitleStyle}
              onCommentTitleChange={guardCommentMutation(commentAccessMode, (title) => updateMetadata({ commentTitle: title === 'Comments' ? undefined : title }))}
              onCommentTitleStyleChange={guardCommentMutation(commentAccessMode, (style) => updateMetadata({ commentTitleStyle: style }))}
              onSubmit={guardCommentComposition(commentAccessMode, (commentText) => {
                const newComment: CommentData = {
                  id: `comment-${Date.now()}`,
                  text: commentText,
                  userId: draftCommentUserId,
                  userName: draftCommentUserName,
                  timestamp: Date.now(),
                };
                updateMetadata({ detachedComments: [...detachedComments, newComment] });
              })}
              onEditComment={guardOwnCommentMutation(commentAccessMode, currentUserId, (id) => detachedComments.find((c) => c.id === id), (commentId, newText) => {
                const updated = detachedComments.map((comment) =>
                  comment.id === commentId ? { ...comment, text: newText } : comment
                );
                updateMetadata({ detachedComments: updated });
              })}
              onRemoveComment={guardOwnCommentMutation(commentAccessMode, currentUserId, (id) => detachedComments.find((c) => c.id === id), (commentId) => {
                const updated = detachedComments.filter((comment) => comment.id !== commentId);
                updateMetadata({ detachedComments: updated });
              })}
              onToggleCommentStrikethrough={guardOwnCommentMutation(commentAccessMode, currentUserId, (id) => detachedComments.find((c) => c.id === id), (commentId) => {
                const updated = detachedComments.map((comment) =>
                  comment.id === commentId ? { ...comment, isStrikethrough: !comment.isStrikethrough } : comment
                );
                updateMetadata({ detachedComments: updated });
              })}
              onCommentColor={guardOwnCommentMutation(commentAccessMode, currentUserId, (id) => detachedComments.find((c) => c.id === id), (commentId, textColor, backgroundColor) => {
                const updated = detachedComments.map((comment) =>
                  comment.id === commentId ? { ...comment, textColor, backgroundColor } : comment
                );
                updateMetadata({ detachedComments: updated });
              })}
              enableCanonicalSelectionStyling
              accessMode={commentAccessMode}
              comments={detachedComments}
              currentUserId={draftCommentUserId}
              currentUserName={draftCommentUserName}
            />
          </div>
        ) : null}
        </div>
        </div>
      </div>

      {/* Not part of the composition row's grid: CardEditor renders its own
          independent fixed-position overlay when open (and nothing at all
          when closed), so it never needs to participate in the row's
          column layout. */}
      <CardEditor
        isOpen={isCardViewOpen}
        onClose={() => setIsCardViewOpen(false)}
        title={previewPadlet.title || ''}
        initialContent={previewPadlet.content || ''}
        initialMetadata={previewPadlet.metadata || {}}
        onSave={(data) => {
          onChange({
            ...previewPadlet,
            title: data.title,
            content: data.content,
            metadata: data.metadata,
          });
          setIsCardViewOpen(false);
        }}
        readOnly={false}
      />
    </div>
  );
}
