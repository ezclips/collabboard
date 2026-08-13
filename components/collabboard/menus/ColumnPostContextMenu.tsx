"use client";

import React from 'react';
import {
    Edit2,
    Plus,
    Repeat,
    Trash2,
} from 'lucide-react';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuSub,
    ContextMenuSubContent,
    ContextMenuSubTrigger,
    ContextMenuSwatch,
    ContextMenuSwatchRow,
    ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { ActionId, actionRegistry } from '@/lib/collabboard/ActionRegistry';
import { Padlet } from '@/types/collabboard';

interface ColumnPostContextMenuProps {
    children: React.ReactNode;
    padlet: Padlet;
    onSelect: () => void;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    onOpen?: () => void;
    restrictToMenuTrigger?: boolean;
    disabled?: boolean;
    // New: openTargets for container children submenu
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
    // Container-only: toggles whether this Container's own child posts show
    // their titles when rendered on-canvas (RowColumnContainerCard). Present
    // only when this menu instance is for a Container padlet.
    onToggleChildTitles?: () => void;
    childTitlesVisible?: boolean;
    onAddContainerAt?: (position: number) => void;
    enableInsertActions?: boolean;
    onEditPosition?: () => void;
    editPositionLabel?: string;
    onOpenGoogleMaps?: () => void;
    onOpenOsm?: () => void;
    addPostItems?: Array<{ label: string; type: string }>;
    onAddPostType?: (type: string) => void;
    addPostLabel?: string;
    deleteLabel?: string;
}

export function ColumnPostContextMenu({
    children,
    padlet,
    onSelect,
    open: controlledOpen,
    onOpenChange,
    onOpen,
    restrictToMenuTrigger = false,
    disabled = false,
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
    onToggleChildTitles,
    childTitlesVisible = false,
    onAddContainerAt,
    enableInsertActions = false,
    onEditPosition,
    editPositionLabel = 'Edit pin position',
    onOpenGoogleMaps,
    onOpenOsm,
    addPostItems,
    onAddPostType,
    addPostLabel = 'Add post',
    deleteLabel = 'Delete post',
}: ColumnPostContextMenuProps) {
    const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
    const menuId = React.useId();
    const isControlled = controlledOpen !== undefined;
    const open = isControlled ? controlledOpen : uncontrolledOpen;

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
                if (!isControlled) setUncontrolledOpen(false);
                onOpenChange?.(false);
            }
        };

        window.addEventListener('collabboard-close-post-context-menus', handleCloseMenus as EventListener);
        return () => {
            window.removeEventListener('collabboard-close-post-context-menus', handleCloseMenus as EventListener);
        };
    }, [menuId]);

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

    if (disabled) {
        return <>{children}</>;
    }

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
                if (!isControlled) setUncontrolledOpen(nextOpen);
                onOpenChange?.(nextOpen);
            }} as any}
        >
            <ContextMenuTrigger asChild>
                {wrappedTrigger}
            </ContextMenuTrigger>

            <ContextMenuContent className="min-w-[240px]" style={{ zIndex: 9999 }}>
                {addPostItems && addPostItems.length > 0 && onAddPostType ? (
                    <ContextMenuSub>
                        <ContextMenuSubTrigger>{addPostLabel}</ContextMenuSubTrigger>
                        <ContextMenuSubContent className="min-w-[180px]" style={{ zIndex: 10000 }}>
                            {addPostItems.map((item) => (
                                <ContextMenuItem
                                    key={item.type}
                                    icon={<Plus size={14} />}
                                    onClick={() => onAddPostType(item.type)}
                                >
                                    {item.label}
                                </ContextMenuItem>
                            ))}
                        </ContextMenuSubContent>
                    </ContextMenuSub>
                ) : null}
                {/* Main actions - Edit post with pencil icon */}
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
                {onToggleChildTitles && (
                    <ContextMenuItem onClick={onToggleChildTitles}>
                        {childTitlesVisible ? 'Hide post titles' : 'Show post titles'}
                    </ContextMenuItem>
                )}
                {/* Color picker */}
                {onChangeColor && (
                    <ContextMenuSwatchRow>
                        {["#fff", "#f87171", "#fbbf24", "#34d399", "#60a5fa", "#a78bfa"].map((color) => (
                            <ContextMenuSwatch
                                key={color}
                                color={color}
                                label={color}
                                onSelect={(event) => {
                                    // Preserved from the hand-rolled row: picking a
                                    // color leaves the menu open so several can be
                                    // tried in a row.
                                    event.preventDefault();
                                    onChangeColor(color);
                                }}
                            />
                        ))}
                    </ContextMenuSwatchRow>
                )}
                {onEditPosition && (
                    <ContextMenuItem icon={<Edit2 size={16} />} onClick={onEditPosition}>
                        {editPositionLabel}
                    </ContextMenuItem>
                )}
                {onOpenGoogleMaps && (
                    <ContextMenuItem onClick={onOpenGoogleMaps}>
                        Google Maps
                    </ContextMenuItem>
                )}
                {onOpenOsm && (
                    <ContextMenuItem onClick={onOpenOsm}>
                        OSM
                    </ContextMenuItem>
                )}
                {enableInsertActions && onAddBefore && (
                    <ContextMenuItem
                        icon={<Plus size={16} />}
                        onClick={() => {
                            if (onAddContainerAt) {
                                const currentPos = Number((padlet.metadata as any)?.sectionPosition || 0);
                                onAddContainerAt(currentPos);
                            } else {
                                onAddBefore();
                            }
                        }}
                    >
                        Add post before
                    </ContextMenuItem>
                )}
                {enableInsertActions && onAddAfter && (
                    <ContextMenuItem
                        icon={<Plus size={16} />}
                        onClick={() => {
                            if (onAddContainerAt) {
                                const currentPos = Number((padlet.metadata as any)?.sectionPosition || 0);
                                onAddContainerAt(currentPos + 1);
                            } else {
                                onAddAfter();
                            }
                        }}
                    >
                        Add post after
                    </ContextMenuItem>
                )}
                {enableInsertActions && onDuplicate && (
                    <ContextMenuItem icon={<Repeat size={16} />} onClick={onDuplicate}>
                        Duplicate post
                    </ContextMenuItem>
                )}
                {hasLayerActions && <ContextMenuSeparator />}
                {onSendToBack && (
                    <ContextMenuItem onClick={() => handleAction('post.sendToBack')}>
                        Send to Back
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
