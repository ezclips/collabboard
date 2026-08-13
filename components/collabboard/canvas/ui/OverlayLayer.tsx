"use client";

import React from 'react';
import type { AuthUser } from '@/lib/domain/auth/user';
import type { Padlet, CanvasLine } from '@/types/collabboard';
import CommentPopup from '@/components/collabboard/editors/CommentPopup';
import TextStylePopup from '@/components/collabboard/editors/TextStylePopup';
import { LineContextMenu } from '@/components/collabboard/menus/LineContextMenu';
import { guardCommentMutation, type CommentAccessMode } from '@/lib/domain/canvas/comments';
import { isDocumentPost } from '@/lib/domain/canvas/documentPost';

// ── Props ─────────────────────────────────────────────────────────────────────
export interface OverlayLayerProps {
  // Comment popup state
  commentPopupOpen: boolean;
  setCommentPopupOpen: (v: boolean) => void;
  commentPopupComments: any[];
  setCommentPopupComments: (v: any[]) => void;
  commentPopupPadletId: string | null;
  setCommentPopupPadletId: (v: string | null) => void;
  commentPopupCommentId: string | null;
  setCommentPopupCommentId: (v: string | null) => void;
  commentPopupPosition: { x: number; y: number } | null;
  commentPopupHighlightColor: string | undefined;
  setCommentPopupHighlightColor: (v: string | undefined) => void;

  // Text color picker state
  textLinkColorPickerOpen: boolean;
  setTextLinkColorPickerOpen: (v: boolean) => void;
  textLinkColorPickerPosition: { top: number; cardLeft: number } | null;
  setTextLinkColorPickerPosition: (v: { top: number; cardLeft: number } | null) => void;

  // Line context menu state
  lineContextMenuState: { x: number; y: number; lineId: string } | null;
  setLineContextMenuState: (v: { x: number; y: number; lineId: string } | null) => void;

  // Data
  padlets: Padlet[];
  lines: CanvasLine[];
  user: AuthUser | null;
  accessMode?: CommentAccessMode;

  // Callbacks
  updatePadletContent: (id: string, content: string) => Promise<any>;
  duplicateLine: (id: string) => void;
  deleteLine: (id: string) => void;
  updateLine: (id: string, updates: any) => void;
  handleChangeLineLayer: (id: string, direction: 'front' | 'back') => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function OverlayLayer({
  commentPopupOpen, setCommentPopupOpen,
  commentPopupComments, setCommentPopupComments,
  commentPopupPadletId, setCommentPopupPadletId,
  commentPopupCommentId, setCommentPopupCommentId,
  commentPopupPosition,
  commentPopupHighlightColor, setCommentPopupHighlightColor,
  textLinkColorPickerOpen, setTextLinkColorPickerOpen,
  textLinkColorPickerPosition, setTextLinkColorPickerPosition,
  lineContextMenuState, setLineContextMenuState,
  padlets, lines, user,
  accessMode = 'manage',
  updatePadletContent, duplicateLine, deleteLine, updateLine, handleChangeLineLayer,
}: OverlayLayerProps) {
  // PATCH 8AA -- this anchored/highlighted comment-thread display controller
  // uses only the live READ/MANAGE model. COMMENT remains dormant for this
  // surface. Originally scoped to Document padlets only (isDocumentPost);
  // PATCH 8AB extends the same gate to Note padlets below (isNoteAnchoredPost)
  // -- the other live consumer of this shared popup, reached when a
  // highlighted comment mark is clicked directly on the canvas card rather
  // than inside NoteEditor's own modal (see FreeformPadletCards.tsx's
  // "Generic / Note Display" click handler). Any other padlet type that
  // might reach this popup keeps the pre-existing 'manage' behavior, same as
  // before PATCH 8AA.
  const requestedDocumentAccessMode: CommentAccessMode = accessMode === 'manage' ? 'manage' : 'read';
  const activeCommentPadlet = commentPopupPadletId ? padlets.find((p) => p.id === commentPopupPadletId) : null;
  // Matches the established `padlet.type === 'text' || (padlet.type as
  // string) === 'note'` check used at FreeformPadletCards.tsx:3070 -- 'text'
  // and 'note' are aliases for the same Note family (see PATCH 8AB
  // inventory), kept local here since no other Note-vs-other-type
  // discriminator is needed outside this comment-permission gate.
  const isNoteAnchoredPost = (post: Pick<Padlet, 'type'>): boolean =>
    post.type === 'text' || (post.type as string) === 'note';
  const anchoredAccessMode: CommentAccessMode = activeCommentPadlet && (isDocumentPost(activeCommentPadlet) || isNoteAnchoredPost(activeCommentPadlet))
    ? requestedDocumentAccessMode
    : 'manage';
  const canManageAnchoredComments = anchoredAccessMode === 'manage';

  return (
    <>
      <CommentPopup
        isOpen={commentPopupOpen}
        onOpenChange={(open) => {
          setCommentPopupOpen(open);
          if (!open) {
            setCommentPopupComments([]);
            setCommentPopupPadletId(null);
            setCommentPopupCommentId(null);
            setTextLinkColorPickerOpen(false);
            setTextLinkColorPickerPosition(null);
            setCommentPopupHighlightColor(undefined);
          }
        }}
        onSubmit={guardCommentMutation(anchoredAccessMode, async (commentText) => {
          if (!commentPopupPadletId || !commentPopupCommentId) return;
          const padlet = padlets.find((p) => p.id === commentPopupPadletId);
          if (!padlet) return;
          const newComment = {
            id: `comment-${Date.now()}`,
            text: commentText,
            userId: user?.id || '',
            userName: user?.email?.split('@')[0] || 'Anonymous',
            timestamp: Date.now(),
            isStrikethrough: false,
          };
          const nextComments = [...commentPopupComments, newComment];
          const parser = new DOMParser();
          const doc = parser.parseFromString(padlet.content || '', 'text/html');
          const target = doc.querySelector(`[data-comment-id="${commentPopupCommentId}"]`);
          if (target) {
            target.setAttribute('data-comment-thread', JSON.stringify(nextComments));
            target.setAttribute('data-comment-text', newComment.text);
            target.setAttribute('data-user-id', newComment.userId);
            target.setAttribute('data-user-name', newComment.userName);
            target.setAttribute('data-timestamp', newComment.timestamp.toString());
            await updatePadletContent(commentPopupPadletId, doc.body.innerHTML);
            setCommentPopupComments(nextComments);
          }
        })}
        onEditComment={guardCommentMutation(anchoredAccessMode, async (commentId, commentText) => {
          if (!commentPopupPadletId || !commentPopupCommentId) return;
          const padlet = padlets.find((p) => p.id === commentPopupPadletId);
          if (!padlet) return;
          const nextComments = commentPopupComments.map((comment) =>
            comment.id === commentId ? { ...comment, text: commentText } : comment
          );
          const parser = new DOMParser();
          const doc = parser.parseFromString(padlet.content || '', 'text/html');
          const target = doc.querySelector(`[data-comment-id="${commentPopupCommentId}"]`);
          if (target) {
            const last = nextComments[nextComments.length - 1];
            target.setAttribute('data-comment-thread', JSON.stringify(nextComments));
            target.setAttribute('data-comment-text', last?.text || '');
            target.setAttribute('data-user-id', last?.userId || '');
            target.setAttribute('data-user-name', last?.userName || 'Anonymous');
            target.setAttribute('data-timestamp', (last?.timestamp || Date.now()).toString());
            await updatePadletContent(commentPopupPadletId, doc.body.innerHTML);
            setCommentPopupComments(nextComments);
          }
        })}
        onRemoveComment={guardCommentMutation(anchoredAccessMode, async (commentId) => {
          if (!commentPopupPadletId || !commentPopupCommentId) return;
          const padlet = padlets.find((p) => p.id === commentPopupPadletId);
          if (!padlet) return;
          const nextComments = commentPopupComments.filter((comment) => comment.id !== commentId);
          const parser = new DOMParser();
          const doc = parser.parseFromString(padlet.content || '', 'text/html');
          const target = doc.querySelector(`[data-comment-id="${commentPopupCommentId}"]`);
          if (target) {
            if (nextComments.length === 0) {
              target.setAttribute('data-comment-thread', JSON.stringify([]));
              target.setAttribute('data-comment-text', '');
              target.removeAttribute('data-user-id');
              target.removeAttribute('data-user-name');
              target.removeAttribute('data-timestamp');
            } else {
              const last = nextComments[nextComments.length - 1];
              target.setAttribute('data-comment-thread', JSON.stringify(nextComments));
              target.setAttribute('data-comment-text', last?.text || '');
              target.setAttribute('data-user-id', last?.userId || '');
              target.setAttribute('data-user-name', last?.userName || 'Anonymous');
              target.setAttribute('data-timestamp', (last?.timestamp || Date.now()).toString());
            }
            await updatePadletContent(commentPopupPadletId, doc.body.innerHTML);
            setCommentPopupComments(nextComments);
          }
        })}
        onRemoveThread={guardCommentMutation(anchoredAccessMode, async () => {
          if (!commentPopupPadletId || !commentPopupCommentId) return;
          const padlet = padlets.find((p) => p.id === commentPopupPadletId);
          if (!padlet) return;
          const parser = new DOMParser();
          const doc = parser.parseFromString(padlet.content || '', 'text/html');
          const target = doc.querySelector(`[data-comment-id="${commentPopupCommentId}"]`);
          if (target) {
            target.removeAttribute('data-comment-thread');
            target.removeAttribute('data-comment-text');
            target.removeAttribute('data-user-id');
            target.removeAttribute('data-user-name');
            target.removeAttribute('data-timestamp');
            target.removeAttribute('data-color');
            await updatePadletContent(commentPopupPadletId, doc.body.innerHTML);
            setCommentPopupComments([]);
          }
        })}
        onColor={guardCommentMutation(anchoredAccessMode, async (color) => {
          if (!commentPopupPadletId || !commentPopupCommentId) return;
          const padlet = padlets.find((p) => p.id === commentPopupPadletId);
          if (!padlet) return;
          const parser = new DOMParser();
          const doc = parser.parseFromString(padlet.content || '', 'text/html');
          const target = doc.querySelector(`[data-comment-id="${commentPopupCommentId}"]`);
          if (target) {
            if (color) {
              target.setAttribute('data-color', color);
            } else {
              target.removeAttribute('data-color');
            }
            await updatePadletContent(commentPopupPadletId, doc.body.innerHTML);
          }
        })}
        onToggleCommentStrikethrough={guardCommentMutation(anchoredAccessMode, async (commentId) => {
          if (!commentPopupPadletId || !commentPopupCommentId) return;
          const padlet = padlets.find((p) => p.id === commentPopupPadletId);
          if (!padlet) return;
          const nextComments = commentPopupComments.map((comment) =>
            comment.id === commentId
              ? { ...comment, isStrikethrough: !comment.isStrikethrough }
              : comment
          );
          const parser = new DOMParser();
          const doc = parser.parseFromString(padlet.content || '', 'text/html');
          const target = doc.querySelector(`[data-comment-id="${commentPopupCommentId}"]`);
          if (target) {
            const last = nextComments[nextComments.length - 1];
            target.setAttribute('data-comment-thread', JSON.stringify(nextComments));
            target.setAttribute('data-comment-text', last?.text || '');
            target.setAttribute('data-user-id', last?.userId || '');
            target.setAttribute('data-user-name', last?.userName || 'Anonymous');
            target.setAttribute('data-timestamp', (last?.timestamp || Date.now()).toString());
            await updatePadletContent(commentPopupPadletId, doc.body.innerHTML);
            setCommentPopupComments(nextComments);
          }
        })}
        onCommentColor={guardCommentMutation(anchoredAccessMode, async (commentId, textColor, backgroundColor) => {
          // Per-comment text/highlight color -- distinct from the onColor
          // handler above, which colors the highlighted document text span
          // the whole thread is anchored to (the `data-color` attribute).
          if (!commentPopupPadletId || !commentPopupCommentId) return;
          const padlet = padlets.find((p) => p.id === commentPopupPadletId);
          if (!padlet) return;
          const nextComments = commentPopupComments.map((comment) =>
            comment.id === commentId ? { ...comment, textColor, backgroundColor } : comment
          );
          const parser = new DOMParser();
          const doc = parser.parseFromString(padlet.content || '', 'text/html');
          const target = doc.querySelector(`[data-comment-id="${commentPopupCommentId}"]`);
          if (target) {
            const last = nextComments[nextComments.length - 1];
            target.setAttribute('data-comment-thread', JSON.stringify(nextComments));
            target.setAttribute('data-comment-text', last?.text || '');
            target.setAttribute('data-user-id', last?.userId || '');
            target.setAttribute('data-user-name', last?.userName || 'Anonymous');
            target.setAttribute('data-timestamp', (last?.timestamp || Date.now()).toString());
            await updatePadletContent(commentPopupPadletId, doc.body.innerHTML);
            setCommentPopupComments(nextComments);
          }
        })}
        comments={commentPopupComments}
        highlightColor={commentPopupHighlightColor}
        currentUserId={user?.id}
        currentUserName={user?.email?.split('@')[0] || 'Anonymous'}
        position={commentPopupPosition}
        onColorPickerOpenChange={canManageAnchoredComments ? setTextLinkColorPickerOpen : () => {}}
        accessMode={anchoredAccessMode}
      />

      {/* Text Link Comment Color Picker - positioned on LEFT of the card */}
      {canManageAnchoredComments && textLinkColorPickerOpen && commentPopupOpen && textLinkColorPickerPosition && (
        <div
          className="fixed z-[9999] bg-white rounded-lg shadow-xl border border-gray-200 p-3 min-w-[240px]"
          style={{
            left: textLinkColorPickerPosition.cardLeft - 252,
            top: textLinkColorPickerPosition.top,
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <TextStylePopup
            isOpen={true}
            onOpenChange={(open) => {
              if (!open) setTextLinkColorPickerOpen(false);
            }}
            onSelectHeading={() => { }}
            hideHeadingSelect={true}
            onSelectColor={() => {
              // Text color changes are handled by the CommentPopup's internal editor
            }}
            onSelectHighlight={guardCommentMutation(anchoredAccessMode, async (color) => {
              // Update the highlight color on the comment mark
              if (!commentPopupPadletId || !commentPopupCommentId) return;
              const padlet = padlets.find((p) => p.id === commentPopupPadletId);
              if (!padlet) return;
              const parser = new DOMParser();
              const doc = parser.parseFromString(padlet.content || '', 'text/html');
              const target = doc.querySelector(`[data-comment-id="${commentPopupCommentId}"]`);
              if (target) {
                if (color && color !== 'transparent') {
                  target.setAttribute('data-color', color);
                } else {
                  target.removeAttribute('data-color');
                }
                await updatePadletContent(commentPopupPadletId, doc.body.innerHTML);
                setCommentPopupHighlightColor(color === 'transparent' ? undefined : color);
              }
            })}
            currentHeading="normal"
            currentColor={undefined}
            currentHighlight={commentPopupHighlightColor}
          />
        </div>
      )}

      {/* Line Context Menu */}
      <LineContextMenu
        isOpen={lineContextMenuState !== null}
        position={lineContextMenuState ? { x: lineContextMenuState.x, y: lineContextMenuState.y } : { x: 0, y: 0 }}
        line={lineContextMenuState ? lines.find(l => l.id === lineContextMenuState.lineId) || null : null}
        onClose={() => setLineContextMenuState(null)}
        onDuplicate={() => {
          if (lineContextMenuState) duplicateLine(lineContextMenuState.lineId);
        }}
        onDelete={() => {
          if (lineContextMenuState) deleteLine(lineContextMenuState.lineId);
        }}
        onCut={() => {
          // TODO: Implement line cut (copy + delete)
          if (lineContextMenuState) deleteLine(lineContextMenuState.lineId);
        }}
        onCopy={() => {
          // TODO: Implement line copy
        }}
        onLock={() => {
          // TODO: Implement line lock
        }}
        onBringToFront={() => {
          if (lineContextMenuState) handleChangeLineLayer(lineContextMenuState.lineId, 'front');
        }}
        onSendToBack={() => {
          if (lineContextMenuState) handleChangeLineLayer(lineContextMenuState.lineId, 'back');
        }}
        onToggleStartArrow={() => {
          if (!lineContextMenuState) return;
          const line = lines.find((l) => l.id === lineContextMenuState.lineId);
          if (!line) return;
          updateLine(lineContextMenuState.lineId, { start_arrow: !line.start_arrow });
        }}
        onToggleEndArrow={() => {
          if (!lineContextMenuState) return;
          const line = lines.find((l) => l.id === lineContextMenuState.lineId);
          if (!line) return;
          updateLine(lineContextMenuState.lineId, { end_arrow: !line.end_arrow });
        }}
        onColorChange={(color) => {
          if (lineContextMenuState) updateLine(lineContextMenuState.lineId, { color });
        }}
      />
    </>
  );
}
