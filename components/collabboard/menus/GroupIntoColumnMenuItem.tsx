"use client";

import React from 'react';
import {
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuSub,
    ContextMenuSubContent,
    ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import type { Padlet } from '@/types/collabboard';

interface GroupIntoColumnMenuItemProps {
    // Existing root containers this post could join. Empty when the canvas
    // has no eligible Column yet -- in that case the item acts immediately
    // (same single-click behavior as before this patch) instead of opening
    // a submenu with nothing to choose between.
    targets: Padlet[];
    // Called with a container id to join an existing Column, or with no
    // argument to create a new one.
    onGroupIntoColumn: (targetContainerId?: string) => void;
}

function columnLabel(container: Padlet): string {
    return container.title?.trim() || 'Container';
}

/**
 * The "Group into Column" context-menu row, shared by every post-type menu
 * that offers it (Note/Link/Todo/Image today). Reuses the same
 * ContextMenuSub destination-list pattern ColumnPostContextMenu already
 * uses for its "Edit post" submenu, rather than a new modal.
 */
export function GroupIntoColumnMenuItem({ targets, onGroupIntoColumn }: GroupIntoColumnMenuItemProps) {
    if (targets.length === 0) {
        return (
            <ContextMenuItem onClick={() => onGroupIntoColumn()}>
                Group into Column
            </ContextMenuItem>
        );
    }

    return (
        <ContextMenuSub>
            <ContextMenuSubTrigger>Group into Column</ContextMenuSubTrigger>
            <ContextMenuSubContent className="min-w-[180px]" style={{ zIndex: 10000 }}>
                <ContextMenuItem onClick={() => onGroupIntoColumn()}>
                    New Column
                </ContextMenuItem>
                <ContextMenuSeparator />
                {targets.map((target) => (
                    <ContextMenuItem key={target.id} onClick={() => onGroupIntoColumn(target.id)}>
                        {columnLabel(target)}
                    </ContextMenuItem>
                ))}
            </ContextMenuSubContent>
        </ContextMenuSub>
    );
}
