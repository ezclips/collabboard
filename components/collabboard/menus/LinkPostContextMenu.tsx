// components/collabboard/menus/LinkPostContextMenu.tsx
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
import { Lock, LockOpen } from 'lucide-react';
import { GroupIntoColumnMenuItem } from './GroupIntoColumnMenuItem';

interface LinkPostContextMenuProps {
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
    onGroupIntoColumn?: (targetContainerId?: string) => void;
    groupIntoColumnTargets?: Padlet[];
    // Link-specific actions
    onAddImage?: () => void;
    onCopyLinkAddress?: () => void;
    onAddToLibrary?: () => void;
    disabled?: boolean;
}

export function LinkPostContextMenu({
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
    onGroupIntoColumn,
    groupIntoColumnTargets,
    onAddImage,
    onCopyLinkAddress,
    onAddToLibrary,
    disabled = false,
}: LinkPostContextMenuProps) {
    if (disabled) {
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
            case 'post.groupIntoColumn': onGroupIntoColumn?.(); break;
            case 'post.addImage': onAddImage?.(); break;
            case 'post.copyLinkAddress': onCopyLinkAddress?.(); break;
            case 'post.addToLibrary': onAddToLibrary?.(); break;
        }

        // Also trigger via registry for extensibility
        actionRegistry.execute(id, {
            scope: 'post',
            target: { kind: 'post', postId: padlet.id, postType: padlet.type, x: 0, y: 0 }
        });
    };

    const isLocked = (padlet.metadata as any)?.isLocked;

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
                <ContextMenuItem onClick={() => handleAction('post.addToLibrary')}>
                    Add to Library
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleAction('edit.delete')}>
                    Delete
                </ContextMenuItem>

                <ContextMenuSeparator />

                <ContextMenuItem onClick={() => handleAction('post.addImage')}>
                    Add Image
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleAction('post.copyLinkAddress')}>
                    Copy link address
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

                <ContextMenuSeparator />

                <ContextMenuItem
                    onClick={() => handleAction('post.lockPosition')}
                    icon={isLocked ? <LockOpen /> : <Lock />}
                >
                    {isLocked ? 'Unlock Position' : 'Lock Position'}
                </ContextMenuItem>

                <ContextMenuSeparator />

                <ContextMenuItem onClick={() => handleAction('post.bringToFront')}>
                    Bring to Front
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleAction('post.sendToBack')}>
                    Send to Back
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
}
