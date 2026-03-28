"use client";

import React from 'react';
import {
    Edit2,
    Plus,
    Repeat,
    Trash2,
    ChevronRight
} from 'lucide-react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { cn } from '@/lib/utils';
import { ActionId, actionRegistry } from '@/lib/collabboard/ActionRegistry';
import { Padlet } from '@/types/collabboard';

interface ColumnPostContextMenuProps {
    children: React.ReactNode;
    padlet: Padlet;
    onSelect: () => void;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    onOpen?: () => void;
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
    onSendToBack?: () => void;
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
    onSendToBack,
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
            case 'post.sendToBack': onSendToBack?.(); break;
        }

        actionRegistry.execute(id, {
            scope: 'post',
            target: { kind: 'post', postId: padlet.id, postType: padlet.type, x: 0, y: 0 }
        });
    };

    return (
        <ContextMenu.Root
            {...{ open, onOpenChange: (nextOpen: boolean) => {
                if (nextOpen) {
                    onSelect();
                    onOpen?.();
                    window.dispatchEvent(new CustomEvent('collabboard-close-post-context-menus', { detail: menuId }));
                }
                if (!isControlled) setUncontrolledOpen(nextOpen);
                onOpenChange?.(nextOpen);
            }} as any}
        >
            <ContextMenu.Trigger asChild>
                {children}
            </ContextMenu.Trigger>

            <ContextMenu.Portal>
                <ContextMenu.Content
                    className="min-w-[240px] bg-white/95 backdrop-blur-sm rounded-md overflow-hidden p-1 shadow-[0px_10px_38px_-10px_rgba(22,_23,_24,_0.35),_0px_10px_20px_-15px_rgba(22,_23,_24,_0.2)] border border-gray-200"
                    style={{ zIndex: 9999 }}
                >
                    {addPostItems && addPostItems.length > 0 && onAddPostType ? (
                        <ContextMenu.Sub>
                            <ContextMenu.SubTrigger className="group text-[13px] leading-none text-slate-700 rounded-[3px] flex items-center h-8 px-2 relative select-none outline-none data-[disabled]:text-slate-300 data-[disabled]:pointer-events-none data-[highlighted]:bg-slate-100 data-[highlighted]:text-slate-900 cursor-pointer">
                                <span className="flex-1">{addPostLabel}</span>
                                <span className="ml-2 flex items-center"><ChevronRight size={14} /></span>
                            </ContextMenu.SubTrigger>
                            <ContextMenu.Portal>
                                <ContextMenu.SubContent className="min-w-[180px] bg-white/95 backdrop-blur-sm rounded-md overflow-hidden p-1 shadow-lg border border-gray-200" style={{ zIndex: 10000 }}>
                                    {addPostItems.map((item) => (
                                        <ContextMenuItem
                                            key={item.type}
                                            label={item.label}
                                            onClick={() => onAddPostType(item.type)}
                                            icon={<Plus size={14} />}
                                        />
                                    ))}
                                </ContextMenu.SubContent>
                            </ContextMenu.Portal>
                        </ContextMenu.Sub>
                    ) : null}
                    {/* Main actions - Edit post with pencil icon */}
                    {hasOpenTargets ? (
                        openTargets!.length === 1 ? (
                            <ContextMenuItem
                                label={`Edit ${resolveOpenTargetLabel(openTargets![0])}`}
                                icon={<Edit2 size={16} />}
                                onClick={() => onOpenTarget!(openTargets![0])}
                            />
                        ) : (
                            <ContextMenu.Sub>
                                <ContextMenu.SubTrigger className="group text-[13px] leading-none text-slate-700 rounded-[3px] flex items-center h-8 px-2 relative select-none outline-none data-[disabled]:text-slate-300 data-[disabled]:pointer-events-none data-[highlighted]:bg-slate-100 data-[highlighted]:text-slate-900 cursor-pointer">
                                    <span className="flex-1">Edit post</span>
                                    <span className="ml-2 flex items-center"><ChevronRight size={14} /></span>
                                </ContextMenu.SubTrigger>
                                <ContextMenu.Portal>
                                    <ContextMenu.SubContent className="min-w-[160px] bg-white/95 backdrop-blur-sm rounded-md overflow-hidden p-1 shadow-lg border border-gray-200" style={{ zIndex: 10000 }}>
                                        {openTargets!.map(target => (
                                            <ContextMenuItem
                                                key={target.id}
                                                label={resolveOpenTargetLabel(target)}
                                                onClick={() => onOpenTarget!(target)}
                                                icon={<Edit2 size={14} />}
                                            />
                                        ))}
                                    </ContextMenu.SubContent>
                                </ContextMenu.Portal>
                            </ContextMenu.Sub>
                        )
                    ) : (
                        onEdit && <ContextMenuItem label="Edit post" icon={<Edit2 size={16} />} onClick={onEdit} />
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
                    {onEditPosition && (
                        <ContextMenuItem
                            label={editPositionLabel}
                            icon={<Edit2 size={16} />}
                            onClick={onEditPosition}
                        />
                    )}
                    {onOpenGoogleMaps && (
                        <ContextMenuItem
                            label="Google Maps"
                            onClick={onOpenGoogleMaps}
                        />
                    )}
                    {onOpenOsm && (
                        <ContextMenuItem
                            label="OSM"
                            onClick={onOpenOsm}
                        />
                    )}
                    {enableInsertActions && onAddBefore && (
                        <ContextMenuItem
                            label="Add post before"
                            icon={<Plus size={16} />}
                            onClick={() => {
                                if (onAddContainerAt) {
                                    const currentPos = Number((padlet.metadata as any)?.sectionPosition || 0);
                                    onAddContainerAt(currentPos);
                                } else {
                                    onAddBefore();
                                }
                            }}
                        />
                    )}
                    {enableInsertActions && onAddAfter && (
                        <ContextMenuItem
                            label="Add post after"
                            icon={<Plus size={16} />}
                            onClick={() => {
                                if (onAddContainerAt) {
                                    const currentPos = Number((padlet.metadata as any)?.sectionPosition || 0);
                                    onAddContainerAt(currentPos + 1);
                                } else {
                                    onAddAfter();
                                }
                            }}
                        />
                    )}
                    {enableInsertActions && onDuplicate && (
                        <ContextMenuItem
                            label="Duplicate post"
                            icon={<Repeat size={16} />}
                            onClick={onDuplicate}
                        />
                    )}
                    {onDelete && <ContextMenuItem label={deleteLabel} icon={<Trash2 size={16} />} onClick={onDelete} className="text-red-600 focus:text-red-600 focus:bg-red-50" />}
                </ContextMenu.Content>
            </ContextMenu.Portal>
        </ContextMenu.Root>
    );
}

function ContextMenuItem({ label, icon, shortcut, onClick, className }: { label: string; icon?: React.ReactNode; shortcut?: string[]; onClick: () => void; className?: string }) {
    return (
        <ContextMenu.Item
            className={cn(
                "group text-[13px] leading-none text-slate-700 rounded-[3px] flex items-center h-8 px-2 relative select-none outline-none data-[disabled]:text-slate-300 data-[disabled]:pointer-events-none data-[highlighted]:bg-slate-100 data-[highlighted]:text-slate-900 cursor-pointer",
                className
            )}
            onSelect={onClick}
        >
            <span className="flex-1">{label}</span>
            {shortcut && (
                <div className="ml-auto pl-5 flex gap-1">
                    {shortcut.map((s, i) => (
                        <kbd key={i} className="min-w-[1.2rem] h-5 px-1 bg-slate-100 border border-slate-200 rounded text-[10px] flex items-center justify-center font-sans text-slate-500">
                            {s}
                        </kbd>
                    ))}
                </div>
            )}
            {icon && <span className="ml-2 flex items-center">{icon}</span>}
        </ContextMenu.Item>
    );
}
