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
import { Check, Lock, LockOpen } from 'lucide-react';

interface ImagePostContextMenuProps {
    children: React.ReactNode;
    padlet: Padlet;
    onSelect: () => void;
    // Opens the same modal/editor this post's own pencil button opens --
    // the "adding" editor reused for editing (openFreeformPadletModal).
    onEdit?: () => void;
    // Standard Actions
    onDuplicate?: () => void;
    onDelete?: () => void;
    onCut?: () => void;
    onCopy?: () => void;
    onLock?: () => void;
    onBringToFront?: () => void;
    onBringForward?: () => void;
    onSendBackward?: () => void;
    onSendToBack?: () => void;
    onGroupIntoColumn?: () => void;
    // Image-specific actions
    onReplaceImage?: () => void;
    onDownloadImage?: () => void;
    onToggleCropToGrid?: () => void;
    onToggleFullView?: () => void;
    onAddToLibrary?: () => void;
    disabled?: boolean;
}

export function ImagePostContextMenu({
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
    onReplaceImage,
    onDownloadImage,
    onToggleCropToGrid,
    onToggleFullView,
    onAddToLibrary,
    disabled = false,
}: ImagePostContextMenuProps) {
    if (disabled) {
        return <>{children}</>;
    }

    const handleAction = (id: ActionId) => {
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
            case 'image.replace': onReplaceImage?.(); break;
            case 'image.download': onDownloadImage?.(); break;
            case 'image.cropToGrid': onToggleCropToGrid?.(); break;
            case 'post.toggleFullView': onToggleFullView?.(); break;
            case 'post.addToLibrary': onAddToLibrary?.(); break;
        }

        actionRegistry.execute(id, {
            scope: 'post',
            target: { kind: 'post', postId: padlet.id, postType: padlet.type, x: 0, y: 0 }
        });
    };

    const isCropToGrid = (padlet.metadata as any)?.cropToGrid === true;
    const isFullView = (padlet.metadata as any)?.fullView === true;
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

                <ContextMenuItem onClick={() => handleAction('image.replace')}>
                    Replace Image
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleAction('image.download')}>
                    Download Original Image
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleAction('image.cropToGrid')}>
                    Crop Image to Fit Dot Grid
                    {isCropToGrid && (
                        <span className="ml-auto pl-4 flex items-center">
                            <Check className="text-gray-500" />
                        </span>
                    )}
                </ContextMenuItem>
                <ContextMenuItem onClick={() => handleAction('post.toggleFullView')}>
                    Full View
                    {isFullView && (
                        <span className="ml-auto pl-4 flex items-center">
                            <Check className="text-gray-500" />
                        </span>
                    )}
                </ContextMenuItem>

                <ContextMenuSeparator />

                <ContextMenuItem onClick={() => handleAction('post.groupIntoColumn')}>
                    Group into Column
                </ContextMenuItem>

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
