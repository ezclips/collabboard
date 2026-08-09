"use client";

import React from 'react';
import {
    Edit2,
    Trash2,
} from 'lucide-react';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuShortcut,
    ContextMenuSub,
    ContextMenuSubContent,
    ContextMenuSubTrigger,
    ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { ActionId, actionRegistry } from '@/lib/collabboard/ActionRegistry';
import { Padlet } from '@/types/collabboard';

interface WallContainerContextMenuProps {
    children: React.ReactNode;
    padlet: Padlet;
    onSelect: () => void;
    restrictToMenuTrigger?: boolean;
    onOpen?: () => void;
    openTargets?: Padlet[];
    onOpenTarget?: (padlet: Padlet) => void;
    getOpenTargetLabel?: (padlet: Padlet) => string;
    onOpenInNewTab?: () => void;
    onCopyLink?: () => void;
    onStartSlideshow?: () => void;
    onDownloadAttachment?: () => void;
    onCopyAttachmentLink?: () => void;
    onChangeColor?: (color: string) => void;
    onEdit?: () => void;
    onAddBefore?: () => void;
    onAddAfter?: () => void;
    onDuplicate?: () => void;
    onCopyToAnotherPadlet?: () => void;
    onTransferToAnotherPadlet?: () => void;
    onSetAsPadletCover?: () => void;
    onPin?: () => void;
    onReport?: () => void;
    onDelete?: () => void;
    deleteLabel?: string;
    // legacy/optional
    onCut?: () => void;
    onCopy?: () => void;
    onPaste?: () => void;
    onRename?: () => void;
    onLock?: () => void;
    onBringToFront?: () => void;
    onBringForward?: () => void;
    onSendBackward?: () => void;
    onSendToBack?: () => void;
    onAddContainerAt?: (position: number) => void;
    customActions?: Array<{
        label: string;
        onClick: () => void;
        icon?: React.ReactNode;
        className?: string;
    }>;
}

export function WallContainerContextMenu({
    children,
    padlet,
    onSelect,
    restrictToMenuTrigger = false,
    onOpen,
    openTargets,
    onOpenTarget,
    getOpenTargetLabel,
    onOpenInNewTab,
    onCopyLink,
    onStartSlideshow,
    onDownloadAttachment,
    onCopyAttachmentLink,
    onChangeColor,
    onEdit,
    onAddBefore,
    onAddAfter,
    onDuplicate,
    onCopyToAnotherPadlet,
    onTransferToAnotherPadlet,
    onSetAsPadletCover,
    onPin,
    onReport,
    onDelete,
    deleteLabel = 'Delete post',
    // legacy/optional
    onCut,
    onCopy,
    onPaste,
    onRename,
    onLock,
    onBringToFront,
    onBringForward,
    onSendBackward,
    onSendToBack,
    onAddContainerAt,
    customActions
}: WallContainerContextMenuProps) {
    const [open, setOpen] = React.useState(false);
    const menuId = React.useId();

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
        }

        actionRegistry.execute(id, {
            scope: 'post',
            target: { kind: 'post', postId: padlet.id, postType: padlet.type, x: 0, y: 0 }
        });
    };

    const hasOpenTargets = Boolean(openTargets && openTargets.length > 0 && onOpenTarget);
    const resolveOpenTargetLabel = (target: Padlet) => {
        if (getOpenTargetLabel) return getOpenTargetLabel(target);
        const rawType = target.type || (target.metadata as any)?.kind || 'post';
        return String(rawType).replace(/_/g, ' ');
    };

    React.useEffect(() => {
        const handleCloseMenus = (event: Event) => {
            const detail = (event as CustomEvent<string>).detail;
            if (detail !== menuId) {
                setOpen(false);
            }
        };

        window.addEventListener('collabboard-close-post-context-menus', handleCloseMenus as EventListener);
        return () => {
            window.removeEventListener('collabboard-close-post-context-menus', handleCloseMenus as EventListener);
        };
    }, [menuId]);

    const wrappedTrigger = restrictToMenuTrigger ? (
        <div
            onContextMenuCapture={(event) => {
                const target = event.target as HTMLElement | null;
                if (!target?.closest?.('[data-post-menu-trigger="true"]')) {
                    event.stopPropagation();
                }
            }}
        >
            {children}
        </div>
    ) : children;

    const hasLayerActions = Boolean(onBringToFront || onBringForward || onSendBackward || onSendToBack);

    return (
        <ContextMenu
            {...{ open, onOpenChange: (nextOpen: boolean) => {
                if (nextOpen) {
                    onSelect();
                    window.dispatchEvent(new CustomEvent('collabboard-close-post-context-menus', { detail: menuId }));
                }
                setOpen(nextOpen);
            }} as any}
        >
            <ContextMenuTrigger asChild>
                {wrappedTrigger}
            </ContextMenuTrigger>

            <ContextMenuContent className="min-w-[240px]" style={{ zIndex: 9999 }}>
                {/* Main actions */}
                {hasOpenTargets ? (
                    openTargets!.length === 1 ? (
                        <ContextMenuItem
                            icon={<Edit2 size={16} />}
                            onClick={() => onOpenTarget!(openTargets![0])}
                        >
                            {`Edit ${resolveOpenTargetLabel(openTargets![0])}`}
                        </ContextMenuItem>
                    ) : (
                        <ContextMenuSub>
                            <ContextMenuSubTrigger>Edit post</ContextMenuSubTrigger>
                            <ContextMenuSubContent className="min-w-[160px]" style={{ zIndex: 10000 }}>
                                {openTargets!.map(target => (
                                    <ContextMenuItem
                                        key={target.id}
                                        icon={<Edit2 size={14} />}
                                        onClick={() => onOpenTarget!(target)}
                                    >
                                        {resolveOpenTargetLabel(target)}
                                    </ContextMenuItem>
                                ))}
                            </ContextMenuSubContent>
                        </ContextMenuSub>
                    )
                ) : (
                    onEdit && (
                        <ContextMenuItem icon={<Edit2 size={16} />} onClick={onEdit}>
                            Edit post
                        </ContextMenuItem>
                    )
                )}
                {/* Color picker */}
                {onChangeColor && (
                    <div className="flex items-center gap-1 px-2 py-1">
                        {["#fff", "#f87171", "#fbbf24", "#34d399", "#60a5fa", "#a78bfa"].map((color) => (
                            <button
                                key={color}
                                className="w-5 h-5 rounded-full border-2 border-white shadow-sm hover:scale-110 transition-transform"
                                style={{ backgroundColor: color }}
                                onClick={() => onChangeColor(color)}
                                title={color}
                            />
                        ))}
                    </div>
                )}
                {hasLayerActions && <ContextMenuSeparator />}
                {onSendToBack && (
                    <ContextMenuItem onClick={() => handleAction('post.sendToBack')}>
                        Send to Back
                        <ContextMenuShortcut>Ctrl+Shift+[</ContextMenuShortcut>
                    </ContextMenuItem>
                )}
                {onSendBackward && (
                    <ContextMenuItem onClick={() => handleAction('post.sendBackward')}>
                        Send Backward
                    </ContextMenuItem>
                )}
                {onBringForward && (
                    <ContextMenuItem onClick={() => handleAction('post.bringForward')}>
                        Bring Forward
                    </ContextMenuItem>
                )}
                {onBringToFront && (
                    <ContextMenuItem onClick={() => handleAction('post.bringToFront')}>
                        Bring to Front
                        <ContextMenuShortcut>Ctrl+Shift+]</ContextMenuShortcut>
                    </ContextMenuItem>
                )}
                {onDelete && (
                    <ContextMenuItem icon={<Trash2 size={16} />} onClick={onDelete} variant="destructive">
                        {deleteLabel}
                    </ContextMenuItem>
                )}
            </ContextMenuContent>
        </ContextMenu>
    );
}
