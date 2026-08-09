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

interface CommentPostContextMenuProps {
    children: React.ReactNode;
    padlet: Padlet;
    onSelect: () => void;
    onDuplicate?: () => void;
    onDelete?: () => void;
    onCut?: () => void;
    onCopy?: () => void;
    onPaste?: () => void;
    onRename?: () => void;
    onLock?: () => void;
    onBringToFront?: () => void;
    onBringForward?: () => void;
    onSendBackward?: () => void;
    onSendToBack?: () => void;
    onAddToLibrary?: () => void;
    disabled?: boolean;
}

export function CommentPostContextMenu({
    children,
    padlet,
    onSelect,
    onDuplicate,
    onDelete,
    onCut,
    onCopy,
    onPaste,
    onRename,
    onLock,
    onBringToFront,
    onBringForward,
    onSendBackward,
    onSendToBack,
    onAddToLibrary,
    disabled = false,
}: CommentPostContextMenuProps) {
    if (disabled) {
        return <>{children}</>;
    }

    const handleAction = (id: ActionId) => {
        switch (id) {
            case 'edit.paste': onPaste?.(); break;
            case 'edit.cut': onCut?.(); break;
            case 'edit.copy': onCopy?.(); break;
            case 'edit.duplicate': onDuplicate?.(); break;
            case 'edit.delete': onDelete?.(); break;
            case 'post.rename': onRename?.(); break;
            case 'post.lockPosition': onLock?.(); break;
            case 'post.bringToFront': onBringToFront?.(); break;
            case 'post.bringForward': onBringForward?.(); break;
            case 'post.sendBackward': onSendBackward?.(); break;
            case 'post.sendToBack': onSendToBack?.(); break;
            case 'post.addToLibrary': onAddToLibrary?.(); break;
        }

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
                <ContextMenuItem onClick={() => handleAction('edit.paste')}>
                    Paste
                </ContextMenuItem>
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

                <ContextMenuItem onClick={() => handleAction('post.rename')}>
                    Rename
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
