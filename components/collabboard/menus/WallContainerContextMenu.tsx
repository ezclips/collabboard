"use client";

import React from 'react';
import {
    Edit2,
    Trash2
} from 'lucide-react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { cn } from '@/lib/utils';
import { ActionId, actionRegistry } from '@/lib/collabboard/ActionRegistry';
import { Padlet } from '@/types/collabboard';

interface WallContainerContextMenuProps {
    children: React.ReactNode;
    padlet: Padlet;
    onSelect: () => void;
    onOpen?: () => void;
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
    onAddContainerAt?: (position: number) => void;
}

export function WallContainerContextMenu({
    children,
    padlet,
    onSelect,
    onOpen,
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
    onAddContainerAt
}: WallContainerContextMenuProps) {

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

    return (
        <ContextMenu.Root onOpenChange={(open) => { if (open) onSelect(); }}>
            <ContextMenu.Trigger asChild>
                {children}
            </ContextMenu.Trigger>

            <ContextMenu.Portal>
                <ContextMenu.Content
                    className="min-w-[240px] bg-white/95 backdrop-blur-sm rounded-md overflow-hidden p-1 shadow-[0px_10px_38px_-10px_rgba(22,_23,_24,_0.35),_0px_10px_20px_-15px_rgba(22,_23,_24,_0.2)] border border-gray-200"
                    style={{ zIndex: 9999 }}
                >
                    {/* Main actions */}
                    {onEdit && <ContextMenuItem label="Edit post" icon={<Edit2 size={16} />} onClick={onEdit} />}
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
                    {(onBringToFront || onBringForward || onSendBackward || onSendToBack) && (
                        <ContextMenu.Separator className="h-[1px] bg-gray-100 m-1" />
                    )}
                    {onSendToBack && <ContextMenuItem label="Send to Back" shortcut={["Ctrl", "Shift", "["]} onClick={() => handleAction('post.sendToBack')} />}
                    {onSendBackward && <ContextMenuItem label="Send Backward" onClick={() => handleAction('post.sendBackward')} />}
                    {onBringForward && <ContextMenuItem label="Bring Forward" onClick={() => handleAction('post.bringForward')} />}
                    {onBringToFront && <ContextMenuItem label="Bring to Front" shortcut={["Ctrl", "Shift", "]"]} onClick={() => handleAction('post.bringToFront')} />}
                    {onDelete && <ContextMenuItem label="Delete post" icon={<Trash2 size={16} />} onClick={onDelete} className="text-red-600 focus:text-red-600 focus:bg-red-50" />}
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
