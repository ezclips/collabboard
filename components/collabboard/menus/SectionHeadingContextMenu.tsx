// components/collabboard/menus/SectionHeadingContextMenu.tsx
"use client";

import React from 'react';
import {
    PositionedContextMenu,
    PositionedContextMenuItem,
    PositionedContextMenuSeparator,
} from '@/components/ui/context-menu';
import { ActionId, actionRegistry } from '@/lib/collabboard/ActionRegistry';
import type { Padlet } from '@/types/collabboard';

/**
 * PATCH SECTION-H3B.4 -- the Freeform Section Heading's right-click menu.
 *
 * Built from the exact same primitives and `actionRegistry` wiring every
 * other per-post-type menu in this directory already uses (NotePostContextMenu,
 * CommentPostContextMenu, ...), just with the smaller item set this patch
 * specifies. It uses the `Positioned*` family (not the Radix `ContextMenu*`
 * family those use) because the heading reports its right-click as a plain
 * forwarded event rather than owning a Radix trigger -- see
 * SectionHeadingPost's `onContextMenu` prop and LineContextMenu, which
 * establishes this identical host-positioned pattern for canvas lines.
 *
 * Copy/Paste/Delete/Bring to Front/Send to Back all delegate to the SAME
 * generic clipboard, delete and z-order handlers every other post type uses
 * (copyPadlet/handlePaste/requestDeletePadlet/movePadletLayer) -- nothing
 * Section-Heading-specific is invented here.
 */

interface SectionHeadingContextMenuProps {
    isOpen: boolean;
    position: { x: number; y: number };
    padlet: Padlet | null;
    onClose: () => void;
    onCopy?: () => void;
    onPaste?: () => void;
    onDelete?: () => void;
    onBringToFront?: () => void;
    onSendToBack?: () => void;
}

export function SectionHeadingContextMenu({
    isOpen,
    position,
    padlet,
    onClose,
    onCopy,
    onPaste,
    onDelete,
    onBringToFront,
    onSendToBack,
}: SectionHeadingContextMenuProps) {
    if (!isOpen || !padlet) return null;

    const handleAction = (id: ActionId, handler?: () => void) => {
        handler?.();
        actionRegistry.execute(id, {
            scope: 'post',
            target: { kind: 'post', postId: padlet.id, postType: padlet.type, x: 0, y: 0 },
        });
    };

    return (
        <PositionedContextMenu
            open
            x={position.x}
            y={position.y}
            onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}
            // Same override every canvas-context menu (Note/Comment/Line) already
            // applies over the shared z-50 default, so this sits above the
            // Section Heading toolbar (fixed z-[700]) and canvas content alike.
            className="z-[9999] min-w-[180px]"
            // Portaled content bubbles through the REACT tree, not the DOM tree
            // -- without this, a click on a menu row would reach CanvasClient's
            // blank-canvas deselect handler exactly like an unstopped heading
            // click once did (SECTION-H3B.1). LineContextMenu establishes this
            // identical guard for the same reason.
            onClick={(event) => event.stopPropagation()}
        >
            <PositionedContextMenuItem onSelect={() => handleAction('edit.copy', onCopy)}>
                Copy
            </PositionedContextMenuItem>
            <PositionedContextMenuItem onSelect={() => handleAction('edit.paste', onPaste)}>
                Paste
            </PositionedContextMenuItem>
            <PositionedContextMenuItem onSelect={() => handleAction('edit.delete', onDelete)}>
                Delete
            </PositionedContextMenuItem>

            <PositionedContextMenuSeparator />

            <PositionedContextMenuItem onSelect={() => handleAction('post.bringToFront', onBringToFront)}>
                Bring to Front
            </PositionedContextMenuItem>
            <PositionedContextMenuItem onSelect={() => handleAction('post.sendToBack', onSendToBack)}>
                Send to Back
            </PositionedContextMenuItem>
        </PositionedContextMenu>
    );
}
