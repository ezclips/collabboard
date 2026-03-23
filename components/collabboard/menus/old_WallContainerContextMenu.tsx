import React, { useEffect, useRef } from 'react';
import { Trash2, Edit2, Palette } from 'lucide-react';
import { Padlet } from '@/types/collabboard';

type WallContainerContextMenuProps = {
    isOpen: boolean;
    position: { x: number; y: number };
    padlet: Padlet | null;
    onClose: () => void;
    onDelete?: () => void;
    onRename?: () => void;
    onColorChange?: () => void;
};

export default function WallContainerContextMenu({
    isOpen,
    position,
    padlet,
    onClose,
    onDelete,
    onRename,
    onColorChange
}: WallContainerContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen, onClose]);

    if (!isOpen || !padlet) return null;

    return (
        <div
            ref={menuRef}
            className="fixed z-[1000] bg-white rounded-lg shadow-xl border border-gray-200 py-1 w-56 animate-in fade-in zoom-in-95 duration-100"
            style={{
                top: Math.min(position.y, window.innerHeight - 200), // Prevent overflow bottom
                left: Math.min(position.x, window.innerWidth - 250), // Prevent overflow right
            }}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="px-3 py-2 border-b border-gray-100">
                <p className="text-xs font-medium text-gray-500 truncate">{padlet.title || 'Container'}</p>
            </div>

            <button
                onClick={() => { onRename?.(); onClose(); }}
                className="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
            >
                <Edit2 className="w-4 h-4" />
                <span>Rename</span>
            </button>

            <button
                onClick={() => { onColorChange?.(); onClose(); }}
                className="w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center gap-3 text-sm text-gray-700"
            >
                <Palette className="w-4 h-4" />
                <span>Change Color</span>
            </button>

            <div className="border-t border-gray-100 my-1" />

            <button
                onClick={() => { onDelete?.(); onClose(); }}
                className="w-full text-left px-4 py-2 hover:bg-red-50 flex items-center gap-3 text-sm text-red-600"
            >
                <Trash2 className="w-4 h-4" />
                <span>Delete Container</span>
            </button>
        </div>
    );
}
