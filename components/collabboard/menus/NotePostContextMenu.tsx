// components/collabboard/menus/NotePostContextMenu.tsx
"use client";

import React from 'react';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { ActionId, actionRegistry } from '@/lib/collabboard/ActionRegistry';
import { Padlet } from '@/types/collabboard';
import { Lock, LockOpen, Sparkles, SquareKanban } from 'lucide-react';
import { readKanbanLink, type KanbanLink } from '@/lib/domain/canvas/noteToKanbanCard';
import { GroupIntoColumnMenuItem } from './GroupIntoColumnMenuItem';

interface NotePostContextMenuProps {
    children: React.ReactNode;
    padlet: Padlet;
    onSelect: () => void;
    // Opens the same modal/editor this post's own pencil button opens --
    // the "adding" editor reused for editing (openFreeformPadletModal).
    onEdit?: () => void;
    // Actions passed as props for easy wiring to existing state
    onDuplicate?: () => void;
    onDelete?: () => void;
    onCut?: () => void;
    onCopy?: () => void;
    onLock?: () => void;
    onBringToFront?: () => void;
    onBringForward?: () => void;
    onSendBackward?: () => void;
    onSendToBack?: () => void;
    onCreateSyncedCopy?: () => void;
    onGroupIntoColumn?: (targetContainerId?: string) => void;
    groupIntoColumnTargets?: Padlet[];
    onAddToLibrary?: () => void;
    // Only passed for types where a frameless, title-less display makes
    // sense (Drawing, Card/Clipart, AI Component) -- undefined for plain
    // Note/Text, so the menu item below never shows there.
    onToggleFullView?: () => void;
    // PATCH-223. Only Drawings pass this (their zoom moved off the canvas
    // click and into this menu). Undefined for every other type.
    onViewFullSize?: () => void;
    // PATCH-340. "Send to Kanban" (unlinked) / "Open card" + "Unlink card"
    // (linked). The link is read from the note's metadata unless the host
    // passes it. "Open card" is shown to viewers too; sending and unlinking
    // stay editors-only (the whole menu is editor-only except that one row).
    kanbanLink?: KanbanLink | null;
    onSendToKanban?: () => void;
    onOpenKanbanCard?: (link: KanbanLink) => void;
    onUnlinkKanban?: () => void;
    // PATCH-353. "AI on notes…" -- the shared Summary / Action plan dialog.
    // Passed only to board editors on Freeform, so it is undefined (hidden)
    // everywhere else.
    onAiOnNotes?: () => void;
    disabled?: boolean;
}

export function NotePostContextMenu({
    children,
    padlet,
    onSelect,
    onEdit,
    onDuplicate,
    onDelete,
    onCut,
    onCopy,
    onLock,
    onBringToFront,
    onBringForward,
    onSendBackward,
    onSendToBack,
    onCreateSyncedCopy,
    onGroupIntoColumn,
    groupIntoColumnTargets,
    onAddToLibrary,
    onToggleFullView,
    onViewFullSize,
    kanbanLink,
    onSendToKanban,
    onOpenKanbanCard,
    onUnlinkKanban,
    onAiOnNotes,
    disabled = false,
}: NotePostContextMenuProps) {
    const link = kanbanLink ?? readKanbanLink(padlet);

    if (disabled) {
        // PATCH-340. A viewer still gets to open a linked card, so a linked note
        // keeps a one-row menu even without edit rights. Everything else is
        // editor-only, exactly as before.
        if (link && onOpenKanbanCard) {
            return (
                <ContextMenu>
                    <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
                    <ContextMenuContent className="min-w-[220px]" style={{ zIndex: 9999 }}>
                        <ContextMenuItem onClick={() => onOpenKanbanCard(link)}>
                            Open card
                        </ContextMenuItem>
                    </ContextMenuContent>
                </ContextMenu>
            );
        }
        return <>{children}</>;
    }

    const handleAction = (id: ActionId) => {
        // If we have a direct prop, use it (easier integration for now)
        switch (id) {
            case 'edit.duplicate': onDuplicate?.(); break;
            case 'edit.delete': onDelete?.(); break;
            case 'edit.cut': onCut?.(); break;
            case 'edit.copy': onCopy?.(); break;
            case 'post.lockPosition': onLock?.(); break;
            case 'post.bringToFront': onBringToFront?.(); break;
            case 'post.bringForward': onBringForward?.(); break;
            case 'post.sendBackward': onSendBackward?.(); break;
            case 'post.sendToBack': onSendToBack?.(); break;
            case 'post.createSyncedCopy': onCreateSyncedCopy?.(); break;
            case 'post.groupIntoColumn': onGroupIntoColumn?.(); break;
            case 'post.addToLibrary': onAddToLibrary?.(); break;
            case 'post.toggleFullView': onToggleFullView?.(); break;
        }

        // Also trigger via registry for extensibility
        actionRegistry.execute(id, {
            scope: 'post',
            target: { kind: 'post', postId: padlet.id, postType: padlet.type, x: 0, y: 0 }
        });
    };

    const isLocked = (padlet.metadata as any)?.isLocked;
    const isFullView = (padlet.metadata as any)?.fullView === true;

    return (
        <ContextMenu onOpenChange={(open) => { if (open) onSelect(); }}>
            <ContextMenuTrigger asChild>
                {children}
            </ContextMenuTrigger>

            <ContextMenuContent className="min-w-[220px]" style={{ zIndex: 9999 }}>
                {onEdit && (
                    <>
                        <ContextMenuItem onClick={onEdit}>
                            Edit Post
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                    </>
                )}
                <ContextMenuItem onClick={() => handleAction('edit.cut')}>
                    Cut
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleAction('edit.copy')}>
                    Copy
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleAction('edit.duplicate')}>
                    Duplicate
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleAction('post.createSyncedCopy')}>
                    Create Synced Copy
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleAction('post.addToLibrary')}>
                    Add to Library
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleAction('edit.delete')}>
                    Delete
                </ContextMenuItem>

                <ContextMenuSeparator />

                <GroupIntoColumnMenuItem
                    targets={groupIntoColumnTargets ?? []}
                    onGroupIntoColumn={(targetContainerId) => {
                        if (targetContainerId) {
                            onGroupIntoColumn?.(targetContainerId);
                            return;
                        }
                        handleAction('post.groupIntoColumn');
                    }}
                />

                {((link && (onOpenKanbanCard || onUnlinkKanban)) || (!link && onSendToKanban) || onAiOnNotes) && (
                    <ContextMenuSeparator />
                )}

                {onAiOnNotes && (
                    <ContextMenuItem onClick={onAiOnNotes} icon={<Sparkles />}>
                        AI on notes…
                    </ContextMenuItem>
                )}

                {link ? (
                    <>
                        {onOpenKanbanCard && (
                            <ContextMenuItem onClick={() => onOpenKanbanCard(link)} icon={<SquareKanban />}>
                                Open card
                            </ContextMenuItem>
                        )}
                        {onUnlinkKanban && (
                            <ContextMenuItem onClick={onUnlinkKanban}>
                                Unlink card
                            </ContextMenuItem>
                        )}
                    </>
                ) : (
                    onSendToKanban && (
                        <ContextMenuItem onClick={onSendToKanban} icon={<SquareKanban />}>
                            Send to Kanban
                        </ContextMenuItem>
                    )
                )}

                {onToggleFullView && (
                    <>
                        <ContextMenuSeparator />
                        <ContextMenuItem onClick={() => handleAction('post.toggleFullView')}>
                            {isFullView
                                ? (padlet.type === 'drawing' ? 'Show post frame' : 'Show frame')
                                : (padlet.type === 'drawing' ? 'Hide post frame' : 'Hide frame')}
                        </ContextMenuItem>
                        {onViewFullSize && (
                            <ContextMenuItem onClick={() => onViewFullSize()}>
                                View full size
                            </ContextMenuItem>
                        )}
                    </>
                )}

                <ContextMenuSeparator />

                <ContextMenuItem
                    onClick={() => handleAction('post.lockPosition')}
                    icon={isLocked ? <LockOpen /> : <Lock />}
                >
                    {isLocked ? 'Unlock Position' : 'Lock Position'}
                </ContextMenuItem>

                <ContextMenuSeparator />

                <ContextMenuItem onClick={() => handleAction('post.sendToBack')}>
                    Send to Back
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleAction('post.sendBackward')}>
                    Send Backward
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleAction('post.bringForward')}>
                    Bring Forward
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleAction('post.bringToFront')}>
                    Bring to Front
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
}
