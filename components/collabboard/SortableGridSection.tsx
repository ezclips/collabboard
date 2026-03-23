"use client";

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

interface SortableGridSectionProps {
    sectionId: string;
    children: React.ReactNode;
}

export function SortableGridSection({ sectionId, children }: SortableGridSectionProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
        isOver,
    } = useSortable({ id: sectionId });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 50 : 1,
    };

    return (
        <div ref={setNodeRef} style={style} className="relative w-full group/section">
            {/* Drag Handle - Positioned at the left edge of the section header */}
            <div
                {...attributes}
                {...listeners}
                className="absolute -left-8 top-2 p-1.5 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 hover:bg-black/5 rounded opacity-0 group-hover/section:opacity-100 transition-opacity z-10"
                title="Drag to reorder section"
            >
                <GripVertical size={18} />
            </div>

            {/* Content */}
            <div className="w-full">
                {children}
            </div>

            {/* Drop Indicator - Purple line at bottom when hovering */}
            {isOver && !isDragging && (
                <div className="absolute -bottom-3 left-0 right-0 h-1 bg-purple-600 rounded-full shadow-[0_2px_8px_rgba(147,51,234,0.6)] z-20" />
            )}
        </div>
    );
}
