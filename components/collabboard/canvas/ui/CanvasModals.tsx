"use client";

import React from 'react';
import type { AuthUser } from '@/lib/domain/auth/user';
import type { Padlet } from '@/types/collabboard';

// Stable empty array to avoid creating a new [] reference on every render
// (which would cause infinite useEffect loops in child editors)
const EMPTY_COMMENTS: any[] = [];
import NoteEditor from '@/components/collabboard/editors/NoteEditor';
import LinkEditor from '@/components/collabboard/editors/LinkEditor';
import TableEditor from '@/components/collabboard/editors/TableEditor';
import TodoEditor from '@/components/collabboard/editors/TodoEditor';
import ContainerEditor from '@/components/collabboard/editors/ContainerEditor';
import CommentEditor from '@/components/collabboard/editors/CommentEditor';
import ImageEditor from '@/components/collabboard/editors/ImageEditor';
import DrawingEditor from '@/components/collabboard/editors/DrawingEditor';
import AIComponentEditor from '@/components/collabboard/editors/AIComponentEditor';
import AIContentEditModal from '@/components/ai/editors/AIContentEditModal';
import AIContentConvertModal from '@/components/ai/editors/AIContentConvertModal';
import type { DiagramData, StoredAIContent } from '@/lib/ai/contracts';
import { SaveAIComponentData } from '@/hooks/canvas/usePadletSave';
import {
  extractAIContentFromPadletMetadata,
  normalizeAIContent,
} from '@/lib/ai/normalize-ai-content';
import { toast } from 'sonner';

// ── Props ─────────────────────────────────────────────────────────────────────
export interface CanvasModalsProps {
  // Editor open/close
  isNoteEditorOpen: boolean;
  setIsNoteEditorOpen: (v: boolean) => void;
  isLinkEditorOpen: boolean;
  setIsLinkEditorOpen: (v: boolean) => void;
  isTableEditorOpen: boolean;
  setIsTableEditorOpen: (v: boolean) => void;
  isTodoEditorOpen: boolean;
  setIsTodoEditorOpen: (v: boolean) => void;
  isContainerEditorOpen: boolean;
  setIsContainerEditorOpen: (v: boolean) => void;
  isCommentEditorOpen: boolean;
  setIsCommentEditorOpen: (v: boolean) => void;
  isImageEditorOpen: boolean;
  setIsImageEditorOpen: (v: boolean) => void;
  isDrawingEditorOpen: boolean;
  setIsDrawingEditorOpen: (v: boolean) => void;
  isAIComponentEditorOpen: boolean;
  setIsAIComponentEditorOpen: (v: boolean) => void;
  isAIContentEditModalOpen: boolean;
  setIsAIContentEditModalOpen: (v: boolean) => void;
  isAIContentConvertModalOpen: boolean;
  setIsAIContentConvertModalOpen: (v: boolean) => void;

  // Data
  padletToEdit: Padlet | null;
  setPadletToEdit: (p: Padlet | null) => void;
  padlets: Padlet[];
  setPadlets: React.Dispatch<React.SetStateAction<Padlet[]>>;
  selectedPadletId: string | null;
  viewDrawingPadlet: Padlet | null;
  setViewDrawingPadlet: (p: Padlet | null) => void;
  imageEditorTab: string;
  user: AuthUser | null;
  canvasLayout: string | undefined;
  canvasId: string | undefined;

  // Save callbacks (signatures determined by editor components)
  saveNote: (...args: any[]) => any;
  saveLink: (...args: any[]) => any;
  saveTable: (...args: any[]) => any;
  saveTodo: (...args: any[]) => any;
  saveContainer: (...args: any[]) => any;
  saveComment: (...args: any[]) => any;
  saveImage: (...args: any[]) => any;
  saveDrawing: (...args: any[]) => any;
  saveAIComponent: (data: SaveAIComponentData) => void;

  // Container-specific callbacks
  closeAllToolbars: (except?: Record<string, boolean>) => void;
  openPadletInTypeEditor: (padlet: Padlet) => void;
  handleDetachChildFromFreeformContainer: (childId: string, containerId: string) => void;
  handleDeleteChildFromContainer: (childId: string, containerId: string) => void;
  fetchData: () => void;
  updatePadletById: (id: string, updates: any) => Promise<any>;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function CanvasModals({
  isNoteEditorOpen, setIsNoteEditorOpen,
  isLinkEditorOpen, setIsLinkEditorOpen,
  isTableEditorOpen, setIsTableEditorOpen,
  isTodoEditorOpen, setIsTodoEditorOpen,
  isContainerEditorOpen, setIsContainerEditorOpen,
  isCommentEditorOpen, setIsCommentEditorOpen,
  isImageEditorOpen, setIsImageEditorOpen,
  isDrawingEditorOpen, setIsDrawingEditorOpen,
  isAIComponentEditorOpen, setIsAIComponentEditorOpen,
  isAIContentEditModalOpen, setIsAIContentEditModalOpen,
  isAIContentConvertModalOpen, setIsAIContentConvertModalOpen,
  padletToEdit, setPadletToEdit,
  padlets, setPadlets,
  selectedPadletId,
  viewDrawingPadlet, setViewDrawingPadlet,
  imageEditorTab,
  user,
  canvasLayout, canvasId,
  saveNote, saveLink, saveTable, saveTodo, saveContainer,
  saveComment, saveImage, saveDrawing,
  saveAIComponent,
  closeAllToolbars,
  openPadletInTypeEditor,
  handleDetachChildFromFreeformContainer,
  handleDeleteChildFromContainer,
  fetchData, updatePadletById,
}: CanvasModalsProps) {
  // Derive locked mode/subtype for regeneration — only lock when an existing
  // structured envelope is present (i.e. editing an existing AI card, not new).
  const existingAIContent = extractAIContentFromPadletMetadata(padletToEdit?.metadata);
  const normalizedExisting = normalizeAIContent(existingAIContent);
  const lockedEnvelope: StoredAIContent | undefined =
    normalizedExisting.kind === 'structured' && normalizedExisting.envelope
      ? normalizedExisting.envelope
      : undefined;
  const lockedMode = lockedEnvelope?.mode;
  const lockedSubtype = lockedEnvelope
    ? ((lockedEnvelope.meta?.subtype as DiagramData['subtype'] | undefined) ??
        (lockedEnvelope.data?.type === 'diagram'
          ? (lockedEnvelope.data as DiagramData).subtype
          : undefined))
    : undefined;

  return (
    <div onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
      {/* Note Editor Modal */}
      <div key={isNoteEditorOpen ? `note-${padletToEdit?.id === 'new' ? 'new' : padletToEdit?.id || 'new'}` : 'note-closed'}>
        <NoteEditor
          isOpen={isNoteEditorOpen}
          onClose={() => {
            setIsNoteEditorOpen(false);
            setPadletToEdit(null);
          }}
          initialContent={padletToEdit?.content || ''}
          initialDetachedComments={padletToEdit?.metadata?.detachedComments || EMPTY_COMMENTS}
          initialBadgeColor={padletToEdit?.metadata?.badgeColor || '#facc15'}
          initialTextColor={padletToEdit?.metadata?.textColor}
          onSave={saveNote}
        />
      </div>

      {/* Link Editor Modal */}
      <div key={isLinkEditorOpen ? `link-${padletToEdit?.id === 'new' ? 'new' : padletToEdit?.id || 'new'}` : 'link-closed'}>
        <LinkEditor
          isOpen={isLinkEditorOpen}
          onClose={() => {
            setIsLinkEditorOpen(false);
            setPadletToEdit(null);
          }}
          initialData={padletToEdit?.metadata ? {
            linkUrl: padletToEdit.metadata.linkUrl,
            linkTitle: padletToEdit.metadata.linkTitle,
            linkDescription: padletToEdit.metadata.linkDescription,
            linkImage: padletToEdit.metadata.linkImage,
            linkFavicon: padletToEdit.metadata.linkFavicon,
            linkDomain: padletToEdit.metadata.linkDomain,
            linkCaption: padletToEdit.metadata.linkCaption,
            linkCaptionColor: padletToEdit.metadata.linkCaptionColor,
            cardColor: padletToEdit.metadata.cardColor,
            topStrip: padletToEdit.metadata.topStrip,
            reactions: padletToEdit.metadata.reactions,
            displayMode: padletToEdit.metadata.displayMode,
            detachedComments: padletToEdit.metadata.detachedComments || padletToEdit.metadata.comments,
            comments: padletToEdit.metadata.comments,
            badgeColor: padletToEdit.metadata.badgeColor,
          } : undefined}
          onSave={saveLink}
        />
      </div>

      {/* Table Editor Modal */}
      <div key={isTableEditorOpen ? `table-${padletToEdit?.id === 'new' ? 'new' : padletToEdit?.id || 'new'}` : 'table-closed'}>
        <TableEditor
          isOpen={isTableEditorOpen}
          onClose={() => {
            setIsTableEditorOpen(false);
            setPadletToEdit(null);
          }}
          initialTitle={padletToEdit?.title || 'New Table'}
          initialContent={padletToEdit?.content || ''}
          onSave={saveTable}
        />
      </div>

      {/* Todo Editor Modal */}
      <div key={isTodoEditorOpen ? `todo-${padletToEdit?.id === 'new' ? 'new' : padletToEdit?.id || 'new'}` : 'todo-closed'}>
        <TodoEditor
          isOpen={isTodoEditorOpen}
          onClose={() => {
            setIsTodoEditorOpen(false);
            setPadletToEdit(null);
          }}
          initialData={padletToEdit?.metadata ? {
            todoTitle: padletToEdit.metadata.todoTitle,
            tasks: padletToEdit.metadata.tasks,
            cardColor: padletToEdit.metadata.cardColor,
            topStrip: padletToEdit.metadata.topStrip,
            reactions: padletToEdit.metadata.reactions,
            detachedComments: padletToEdit.metadata.detachedComments || padletToEdit.metadata.comments,
            comments: padletToEdit.metadata.comments,
            badgeColor: padletToEdit.metadata.badgeColor,
          } : undefined}
          onSave={saveTodo}
          padletId={padletToEdit?.id !== 'new' ? padletToEdit?.id : undefined}
          boardId={canvasId}
        />
      </div>

      {/* Container Editor Modal */}
      {(() => {
        if (!isContainerEditorOpen || !padletToEdit) return null;
        const liveContainer = padletToEdit.id !== 'new' ? padlets.find(p => p.id === padletToEdit.id) : padletToEdit;
        if (!liveContainer && padletToEdit.id !== 'new') return null;

        return (
          <ContainerEditor
            key={isContainerEditorOpen ? `container-${padletToEdit?.id === 'new' ? 'new' : padletToEdit?.id || 'new'}` : 'container-closed'}
            isOpen={isContainerEditorOpen}
            onClose={() => {
              setIsContainerEditorOpen(false);
              setPadletToEdit(null);
            }}
            initialTitle={liveContainer?.title || 'New Container'}
            initialBackgroundColor={liveContainer?.metadata?.cardColor || '#ffffff'}
            initialTopStrip={liveContainer?.metadata?.topStrip || 'transparent'}
            initialDetachedComments={liveContainer?.metadata?.detachedComments || EMPTY_COMMENTS}
            containerId={liveContainer?.id !== 'new' ? liveContainer?.id : undefined}
            childPadlets={
              liveContainer?.id !== 'new'
                ? [
                    ...((liveContainer?.metadata?.childPadletIds || []) as string[])
                      .map((id: string) => padlets.find((p) => p.id === id))
                      .filter((p): p is Padlet => p !== undefined),
                    ...padlets.filter((p) => liveContainer && p.metadata?.parentId === liveContainer.id),
                  ]
                    .filter((p, index, arr) => arr.findIndex((x) => x.id === p.id) === index)
                    .map((p) => ({
                      id: p.id,
                      title: p.title,
                      content: p.content,
                      type: p.type,
                      metadata: p.metadata,
                    }))
                : []
            }
            onSave={saveContainer}
            selectedPadletId={selectedPadletId}
            selectedPadletTitle={
              selectedPadletId
                ? (
                  padlets.find(p => p.id === selectedPadletId)?.title ||
                  padlets.find(p => p.id === selectedPadletId)?.type ||
                  'Selected post'
                )
                : undefined
            }
            onOpenChildPadlet={(childId: string) => {
              const child = padlets.find(p => p.id === childId);
              if (child) {
                setIsContainerEditorOpen(false);
                openPadletInTypeEditor(child);
              }
            }}
            onReorderChildPadlets={async (orderedIds: string[]) => {
              if (!liveContainer || liveContainer.id === 'new') return;

              // Optimistic update
              const nextMeta = { ...liveContainer.metadata, childPadletIds: orderedIds };
              setPadlets(prev => prev.map(p => p.id === liveContainer.id ? { ...p, metadata: nextMeta } : p));

              try {
                await updatePadletById(liveContainer.id, {
                  metadata: nextMeta,
                  updated_at: new Date().toISOString(),
                });
              } catch (err) {
                console.error('Failed to reorder children:', err);
                fetchData(); // Rollback on failure
              }
            }}
            onDetachChildFromFreeformContainer={canvasLayout === 'freeform' ? (childId: string) => {
              if (!padletToEdit?.id) return;
              handleDetachChildFromFreeformContainer(childId, padletToEdit.id);
            } : undefined}
            onRemoveChildPadlet={canvasLayout !== 'freeform' ? (childId: string) => {
              if (!padletToEdit?.id) return;
              handleDeleteChildFromContainer(childId, padletToEdit.id);
            } : undefined}
            onUpdateChildComments={async (childId: string, comments: any[]) => {
              // Persist the updated comments to the child padlet
              const childPadlet = padlets.find(p => p.id === childId);
              if (!childPadlet) return;

              // Optimistic update
              setPadlets(prev => prev.map(p =>
                p.id === childId
                  ? { ...p, metadata: { ...p.metadata, comments } }
                  : p
              ));

              try {
                await updatePadletById(childId, {
                  metadata: { ...childPadlet.metadata, comments },
                  updated_at: new Date().toISOString(),
                });
              } catch (err) {
                console.error('Failed to update child comments:', err);
                toast.error('Failed to update comments');
              }
            }}
            currentUserId={user?.id}
            currentUserName={user?.user_metadata?.full_name || user?.email || 'Anonymous'}
            currentUserAvatar={user?.user_metadata?.avatar_url}
          />
        );
      })()}

      {/* Comment Editor Modal */}
      <div
        key={
          isCommentEditorOpen
            ? `comment-editor-${padletToEdit?.id === 'new' ? 'new' : padletToEdit?.id || 'new'}`
            : 'comment-editor-closed'
        }
      >
        <CommentEditor
          isOpen={isCommentEditorOpen}
          onClose={() => {
            setIsCommentEditorOpen(false);
            setPadletToEdit(null);
          }}
          initialComments={padletToEdit?.metadata?.comments || []}
          initialCardColor={padletToEdit?.metadata?.cardColor || '#ffffff'}
          initialBadgeColor={padletToEdit?.metadata?.badgeColor || '#facc15'}
          initialTopStrip={padletToEdit?.metadata?.topStrip || 'transparent'}
          initialCommentTitle={padletToEdit?.metadata?.commentTitle || 'Comments'}
          onSave={saveComment}
          currentUserId={user?.id}
          currentUserName={user?.user_metadata?.name || user?.email?.split('@')[0] || 'Anonymous'}
          currentUserAvatar={user?.user_metadata?.avatar_url}
        />
      </div>

      {/* Image Editor Modal */}
      <div key={isImageEditorOpen ? `image-${padletToEdit?.id === 'new' ? 'new' : padletToEdit?.id || 'new'}` : 'image-closed'}>
        <ImageEditor
          isOpen={isImageEditorOpen}
          onClose={() => {
            setIsImageEditorOpen(false);
            setPadletToEdit(null);
          }}
          onSave={saveImage}
          defaultTab={imageEditorTab as "search" | "upload" | undefined}
          editMode={!!padletToEdit && padletToEdit.id !== 'new'}
          initialData={padletToEdit?.type === 'image' ? {
            ...padletToEdit.metadata,
            imageUrl:
              padletToEdit.metadata?.imageUrl ||
              padletToEdit.metadata?.drawing ||
              padletToEdit.file_url ||
              (typeof padletToEdit.content === 'string' && padletToEdit.content.startsWith('http')
                ? padletToEdit.content
                : undefined),
            importData: padletToEdit.metadata?.source === 'import' ? {
              provider: padletToEdit.metadata.importProvider as "google-drive" | "microsoft-onedrive",
              itemId: (padletToEdit.metadata.importItemId || '') as string,
              openUrl: (padletToEdit.metadata.importOpenUrl || '') as string,
              mimeType: (padletToEdit.metadata.importMimeType || '') as string,
              fileName: (padletToEdit.metadata.importFileName || '') as string,
              kind: (padletToEdit.metadata.importKind || 'image') as "image" | "document",
              sizeBytes: padletToEdit.metadata.importSizeBytes,
            } : undefined,
          } : undefined}
        />
      </div>

      {/* Drawing Editor Modal */}
      <div key={isDrawingEditorOpen ? `drawing-${padletToEdit?.id === 'new' ? 'new' : padletToEdit?.id || 'new'}` : 'drawing-closed'}>
        <DrawingEditor
          isOpen={isDrawingEditorOpen}
          onClose={() => {
            setIsDrawingEditorOpen(false);
            setPadletToEdit(null);
          }}
          onSave={saveDrawing}
          initialData={
            padletToEdit?.type === 'drawing'
              ? {
                drawingData: padletToEdit.metadata?.drawingData,
                drawingAppState: padletToEdit.metadata?.drawingAppState,
                drawingFiles: padletToEdit.metadata?.drawingFiles,
              }
              : undefined
          }
          readOnly={false}
        />
      </div>

      {/* Read-only Drawing Viewer (Lightbox) */}
      <DrawingEditor
        isOpen={!!viewDrawingPadlet}
        onClose={() => setViewDrawingPadlet(null)}
        onSave={() => { }} // No-op in read-only mode
        initialData={
          viewDrawingPadlet?.type === 'drawing'
            ? {
              drawingData: viewDrawingPadlet.metadata?.drawingData,
              drawingAppState: viewDrawingPadlet.metadata?.drawingAppState,
              drawingFiles: viewDrawingPadlet.metadata?.drawingFiles,
            }
            : undefined
        }
        readOnly={true}
      />

      {/* AI Component Generator / Regenerate Modal */}
      <div key={isAIComponentEditorOpen ? `ai-${padletToEdit?.id === 'new' ? 'new' : padletToEdit?.id || 'new'}` : 'ai-closed'}>
        <AIComponentEditor
          isOpen={isAIComponentEditorOpen}
          onClose={() => {
            setIsAIComponentEditorOpen(false);
            setPadletToEdit(null);
          }}
          onSave={saveAIComponent}
          initialPrompt={padletToEdit?.metadata?.aiPrompt || ''}
          initialContent={extractAIContentFromPadletMetadata(padletToEdit?.metadata)}
          lockedMode={lockedMode}
          lockedSubtype={lockedSubtype}
        />
      </div>

      {/* AI Content Field Editor Modal */}
      {lockedEnvelope && (
        <div key={isAIContentEditModalOpen ? `ai-edit-${padletToEdit?.id || 'open'}` : 'ai-edit-closed'}>
          <AIContentEditModal
            isOpen={isAIContentEditModalOpen}
            onClose={() => {
              setIsAIContentEditModalOpen(false);
              setPadletToEdit(null);
            }}
            envelope={lockedEnvelope}
            initialPrompt={padletToEdit?.metadata?.aiPrompt || ''}
            onSave={saveAIComponent}
          />
        </div>
      )}

      {/* AI Content Convert Modal */}
      {lockedEnvelope && (
        <div key={isAIContentConvertModalOpen ? `ai-convert-${padletToEdit?.id || 'open'}` : 'ai-convert-closed'}>
          <AIContentConvertModal
            isOpen={isAIContentConvertModalOpen}
            onClose={() => {
              setIsAIContentConvertModalOpen(false);
              setPadletToEdit(null);
            }}
            envelope={lockedEnvelope}
            initialPrompt={padletToEdit?.metadata?.aiPrompt || ''}
            onSave={saveAIComponent}
          />
        </div>
      )}
    </div>
  );
}
