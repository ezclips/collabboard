"use client";

import React from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
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
                    className="min-w-[220px] bg-white rounded-md overflow-hidden p-1 shadow-[0px_10px_38px_-10px_rgba(22,_23,_24,_0.35),_0px_10px_20px_-15px_rgba(22,_23,_24,_0.2)]"
                    style={{ zIndex: 9999 }}
                >
                    <ContextMenuItem label="Paste" shortcut={["Ctrl", "V"]} onClick={() => handleAction('edit.paste')} />
                    <ContextMenuItem label="Cut" shortcut={["Ctrl", "X"]} onClick={() => handleAction('edit.cut')} />
                    <ContextMenuItem label="Copy" shortcut={["Ctrl", "C"]} onClick={() => handleAction('edit.copy')} />
                    <ContextMenuItem label="Duplicate" shortcut={["Ctrl", "D"]} onClick={() => handleAction('edit.duplicate')} />
                    <ContextMenuItem label="Delete" shortcut={["Backspace"]} onClick={() => handleAction('edit.delete')} />

                    <ContextMenu.Separator className="h-[1px] bg-gray-100 m-1" />

                    <ContextMenuItem label="Rename" shortcut={["Return"]} onClick={() => handleAction('post.rename')} />

                    <ContextMenu.Separator className="h-[1px] bg-gray-100 m-1" />

                    <ContextMenuItem
                        label={(padlet.metadata as any)?.isLocked ? "Unlock Position" : "Lock Position"}
                        onClick={() => handleAction('post.lockPosition')}
                        icon={(padlet.metadata as any)?.isLocked ? (
                            <div className="min-w-[1.2rem] h-5 px-1 bg-slate-100 border border-slate-200 rounded flex items-center justify-center text-slate-500">
                                <LockOpen className="w-3.5 h-3.5" />
                            </div>
                        ) : (
                            <div className="min-w-[1.2rem] h-5 px-1 bg-slate-100 border border-slate-200 rounded flex items-center justify-center text-slate-500">
                                <Lock className="w-3.5 h-3.5" />
                            </div>
                        )}
                    />


                    <ContextMenu.Separator className="h-[1px] bg-gray-100 m-1" />

                    <ContextMenuItem label="Bring to Front" shortcut={["Ctrl", "Shift", "]"]} onClick={() => handleAction('post.bringToFront')} />
                    <ContextMenuItem label="Send to Back" shortcut={["Ctrl", "Shift", "["]} onClick={() => handleAction('post.sendToBack')} />
                </ContextMenu.Content>
            </ContextMenu.Portal>
        </ContextMenu.Root>
    );
}

function ContextMenuItem({ label, shortcut, onClick, icon }: { label: string; shortcut?: string[]; onClick: () => void; icon?: React.ReactNode }) {
    return (
        <ContextMenu.Item
            className="group text-[13px] leading-none text-slate-700 rounded-[3px] flex items-center h-8 px-2 relative select-none outline-none data-[disabled]:text-slate-300 data-[disabled]:pointer-events-none data-[highlighted]:bg-slate-100 data-[highlighted]:text-slate-900 cursor-pointer"
            onClick={onClick}
        >
            {label}
            <div className="ml-auto pl-5 flex gap-1 items-center">
                {icon && <span className="mr-1">{icon}</span>}
                {shortcut && shortcut.map((s, i) => (
                    <kbd key={i} className="min-w-[1.2rem] h-5 px-1 bg-slate-100 border border-slate-200 rounded text-[10px] flex items-center justify-center font-sans text-slate-500">
                        {s}
                    </kbd>
                ))}
            </div>
        </ContextMenu.Item>
    );
}
