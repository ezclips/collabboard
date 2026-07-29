'use client';

import React, { useMemo, useState } from 'react';
import type { Padlet } from '@/types/collabboard';
import CardPreview from '@/components/collabboard/CardPreview';
import CardEditor from '@/components/collabboard/CardEditor';
import CardActionsToolbar from '@/components/collabboard/editors/CardActionsToolbar';
import { CardColorPanel } from '@/components/collabboard/editors/CardColorPanel';
import EmojiReactionPicker from '@/components/collabboard/editors/EmojiReactionPicker';
import CommentPopup from '@/components/collabboard/editors/CommentPopup';
import InlineCaption from '@/components/collabboard/editors/InlineCaption';

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
}

export default function ClipartCardDraftModal({
  isOpen,
  padlet,
  onClose,
  onDiscard,
  onChange,
  onReplaceIcon,
}: ClipartCardDraftModalProps) {
  const [isColorPanelOpen, setIsColorPanelOpen] = useState(false);
  const [isCardViewOpen, setIsCardViewOpen] = useState(false);
  const [isReactionPickerOpen, setIsReactionPickerOpen] = useState(false);
  const [isCommentPanelOpen, setIsCommentPanelOpen] = useState(false);
  const [isBadgeColorPaletteOpen, setIsBadgeColorPaletteOpen] = useState(false);
  const [isCaptionEditing, setIsCaptionEditing] = useState(false);

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
  const draftCommentUserId = 'anon';
  const draftCommentUserName = 'You';
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
    setIsCaptionEditing(false);
  };

  const openCommentPanel = () => {
    setIsCommentPanelOpen(true);
    setIsReactionPickerOpen(false);
    setIsColorPanelOpen(false);
    setIsCaptionEditing(false);
  };

  const toggleCaptionEditing = () => {
    setIsCaptionEditing((editing) => !editing);
    setIsColorPanelOpen(false);
    setIsReactionPickerOpen(false);
    setIsCommentPanelOpen(false);
    setIsBadgeColorPaletteOpen(false);
  };

  return (
    <div className="fixed inset-0 z-[160] flex items-start justify-center overflow-auto p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Save clipart card"
      />

      <div
        data-testid="clipart-composition-row"
        className="relative m-auto flex max-w-[calc(100vw-80px)] items-start gap-6"
      >
        <div data-testid="clipart-toolbar-wrapper">
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
              setIsCaptionEditing(false);
            }}
            onReplaceIcon={onReplaceIcon}
            onCaption={toggleCaptionEditing}
            isCaptionActive={isCaptionEditing}
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

        <div
          data-testid="clipart-main-panel"
          className="flex w-[220px] flex-col items-stretch"
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
              <CardPreview padlet={previewPadlet} isSelected={false} />
              <div data-testid="clipart-inline-caption">
                <InlineCaption
                  value={previewPadlet.title || ''}
                  isEditing={isCaptionEditing}
                  onChange={(nextTitle) => onChange({ ...previewPadlet, title: nextTitle })}
                  onCommit={() => setIsCaptionEditing(false)}
                />
              </div>
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

          {reactions.length > 0 ? (
            <div
              aria-label="Draft reactions"
              className="mt-3 flex flex-wrap justify-center gap-1.5"
            >
              {reactions.map((reaction) => (
                <span
                  key={reaction}
                  className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-sm"
                >
                  {reaction}
                </span>
              ))}
            </div>
          ) : null}

        </div>

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
            />
          </div>
        ) : null}

        {isReactionPickerOpen ? (
          <div
            data-testid="clipart-reaction-panel-wrapper"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <EmojiReactionPicker
              isOpen={isReactionPickerOpen}
              onOpenChange={setIsReactionPickerOpen}
              onSelectEmoji={(emoji) => {
                if (reactions.includes(emoji)) return;
                updateMetadata({ reactions: [...reactions, emoji] });
              }}
              inline
            />
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
            <div className="absolute right-10 top-8 z-10">
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
              onSubmit={(commentText) => {
                const newComment: CommentData = {
                  id: `comment-${Date.now()}`,
                  text: commentText,
                  userId: draftCommentUserId,
                  userName: draftCommentUserName,
                  timestamp: Date.now(),
                };
                updateMetadata({ detachedComments: [...detachedComments, newComment] });
              }}
              comments={detachedComments}
              currentUserId={draftCommentUserId}
              currentUserName={draftCommentUserName}
            />
          </div>
        ) : null}

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
    </div>
  );
}
