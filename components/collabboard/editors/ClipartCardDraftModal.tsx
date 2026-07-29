'use client';

import React, { useMemo, useState } from 'react';
import type { Padlet } from '@/types/collabboard';
import CardPreview from '@/components/collabboard/CardPreview';
import CardEditor from '@/components/collabboard/CardEditor';
import CardActionsToolbar from '@/components/collabboard/editors/CardActionsToolbar';
import { CardColorPanel } from '@/components/collabboard/editors/CardColorPanel';
import EmojiReactionPicker from '@/components/collabboard/editors/EmojiReactionPicker';
import CommentPopup from '@/components/collabboard/editors/CommentPopup';

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
  };

  const openCommentPanel = () => {
    setIsCommentPanelOpen(true);
    setIsReactionPickerOpen(false);
    setIsColorPanelOpen(false);
  };

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Save clipart card"
      />

      <div className="relative flex max-w-5xl items-start gap-4">
        <div className="pt-6">
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
            }}
            onReplaceIcon={onReplaceIcon}
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

        <div className="relative w-[320px] rounded-[28px] bg-white p-5 shadow-2xl">
          <div>
            <div className="text-sm font-semibold text-gray-900">Clipart Card</div>
            <div className="mt-1 text-xs text-gray-500">
              Adjust the icon styling here, then place it on the canvas.
            </div>
          </div>

          <div className="mt-5">
            <div className="mx-auto w-[160px]">
              <CardPreview padlet={previewPadlet} isSelected={true} />
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

          <div className="mt-5">
            <label className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-gray-500">
              Caption
            </label>
            <input
              value={previewPadlet.title || ''}
              onChange={(e) => onChange({ ...previewPadlet, title: e.target.value })}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500"
              placeholder="Optional caption"
            />
          </div>
        </div>

        {isColorPanelOpen ? (
          <div className="pt-6" onClick={(e) => e.stopPropagation()}>
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
            className="pt-6"
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
            className="relative pt-6 min-w-[320px]"
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
                  className="absolute right-0 top-9 z-20 bg-white rounded-lg shadow-lg border border-gray-200 p-2"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div className="grid grid-cols-6 gap-3">
                    {BADGE_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateMetadata({ badgeColor: color });
                          setIsBadgeColorPaletteOpen(false);
                        }}
                        className={`rounded transition-colors ${commentBadgeColor === color ? 'ring-2 ring-blue-500' : ''}`}
                        style={{
                          width: '20px',
                          height: '20px',
                          minWidth: '22px',
                          minHeight: '22px',
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
