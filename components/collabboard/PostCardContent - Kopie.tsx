"use client";

import React from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Link as LinkIcon, CheckSquare, Image as ImageIcon, Table as TableIcon } from 'lucide-react';
import { Padlet } from '@/types/collabboard';

type CellStyle = {
    bg?: string;
    align?: 'left' | 'center' | 'right';
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
};

interface PostCardContentProps {
    padlet: Padlet;
    allPadlets?: Padlet[];
    onScan?: () => void;
    onView?: () => void;
}

export default function PostCardContent({ padlet, allPadlets = [], onScan, onView }: PostCardContentProps) {
    const supabase = createClientComponentClient();

    // --- LINK TYPE ---
    if (padlet.type === 'link' && padlet.metadata?.linkUrl) {
        return (
            <div className="space-y-2 select-none">
                {/* Link Image - hide if info-only mode */}
                {padlet.metadata.linkImage && padlet.metadata.displayMode !== 'info-only' && (
                    <div className="-mx-3 -mt-3 mb-2">
                        <img
                            src={padlet.metadata.linkImage}
                            alt=""
                            className="w-full h-24 object-cover"
                            onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                            }}
                        />
                    </div>
                )}
                {/* Domain with favicon - hide if image-only mode */}
                {padlet.metadata.displayMode !== 'image-only' && (
                    <div className="flex items-center gap-1.5">
                        {padlet.metadata.linkFavicon && (
                            <img
                                src={padlet.metadata.linkFavicon}
                                alt=""
                                className="w-3 h-3"
                                onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                }}
                            />
                        )}
                        <span className="text-[10px] text-gray-500 truncate">
                            {padlet.metadata.linkDomain || padlet.metadata.linkUrl}
                        </span>
                    </div>
                )}
                {/* Title - hide if image-only mode */}
                {padlet.metadata.displayMode !== 'image-only' && (
                    <h4 className="text-xs font-semibold text-blue-600 leading-tight line-clamp-2">
                        {padlet.metadata.linkTitle || 'Untitled Link'}
                    </h4>
                )}
                {/* Description - hide if image-only mode */}
                {padlet.metadata.linkDescription && padlet.metadata.displayMode !== 'image-only' && (
                    <p className="text-[10px] text-gray-600 line-clamp-2">
                        {padlet.metadata.linkDescription}
                    </p>
                )}
                {/* Caption */}
                {padlet.metadata.linkCaption && (
                    <p
                        className="text-[10px] italic border-t border-gray-100 pt-2 mt-1"
                        style={{ color: padlet.metadata.linkCaptionColor || '#6B7280' }}
                    >
                        {padlet.metadata.linkCaption}
                    </p>
                )}
            </div>
        );
    }

    // --- TODO TYPE ---
    if (padlet.type === 'todo' && padlet.metadata?.tasks) {
        return (
            <div className="space-y-1 select-none">
                {/* Todo Title */}
                {padlet.metadata.todoTitle && (
                    <h4 className="text-xs font-semibold text-gray-800 mb-1">
                        {padlet.metadata.todoTitle}
                    </h4>
                )}
                {/* Task list preview (show first 4) */}
                {padlet.metadata.tasks.slice(0, 4).map((task: { id: string; text: string; completed: boolean; dueDate?: string; assignee?: string }) => (
                    <div key={task.id} className="flex items-start gap-1.5">
                        <input
                            type="checkbox"
                            checked={task.completed}
                            onChange={async (e) => {
                                e.preventDefault();
                                e.stopPropagation(); // Stop propagation to prevent drag/click issues

                                // Toggle task completion
                                const updatedTasks = padlet.metadata?.tasks?.map((t: { id: string; completed: boolean }) =>
                                    t.id === task.id ? { ...t, completed: !t.completed } : t
                                ) || [];
                                const updatedMetadata = { ...padlet.metadata, tasks: updatedTasks };

                                try {
                                    const { error } = await supabase
                                        .from('padlets')
                                        .update({
                                            content: JSON.stringify(updatedTasks),
                                            metadata: updatedMetadata,
                                            updated_at: new Date().toISOString(),
                                        })
                                        .eq('id', padlet.id);
                                    if (error) throw error;
                                    if (onScan) onScan();
                                } catch (err) {
                                    console.error('Failed to toggle task:', err);
                                }
                            }}
                            className="w-3 h-3 mt-0.5 accent-green-500 cursor-pointer"
                        />
                        <span className={`text-[10px] ${task.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                            {task.text}
                        </span>
                    </div>
                ))}
                {/* Show more indicator */}
                {padlet.metadata.tasks.length > 4 && (
                    <p className="text-[9px] text-gray-400">
                        +{padlet.metadata.tasks.length - 4} more tasks
                    </p>
                )}
                {/* Progress indicator */}
                <div className="pt-1 border-t border-gray-100 mt-1">
                    <div className="flex items-center gap-1">
                        <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-green-500 rounded-full"
                                style={{
                                    width: `${padlet.metadata.tasks.length > 0
                                        ? (padlet.metadata.tasks.filter((t: { completed: boolean }) => t.completed).length / padlet.metadata.tasks.length) * 100
                                        : 0}%`
                                }}
                            />
                        </div>
                        <span className="text-[9px] text-gray-500">
                            {padlet.metadata.tasks.filter((t: { completed: boolean }) => t.completed).length}/{padlet.metadata.tasks.length}
                        </span>
                    </div>
                </div>
            </div>
        );
    }

    // --- TABLE TYPE ---
    if (padlet.type === 'table') {
        let tableData: { rows?: string[][]; columns?: string[]; caption?: string; cellStyles?: Record<string, CellStyle> } = {};
        try {
            tableData = JSON.parse(padlet.content || '{}');
        } catch {
            tableData = {};
        }
        const rows = tableData.rows || [];
        const columns = tableData.columns || ['A', 'B', 'C'];
        const cellStyles = tableData.cellStyles || {};
        const displayRows = rows.slice(0, 3); // Show first 3 rows
        const displayCols = columns.slice(0, 3); // Show first 3 columns

        // Helper to get cell style
        const getCellStyle = (rowIndex: number, colIndex: number): CellStyle => {
            const key = `${rowIndex}-${colIndex}`;
            return cellStyles[key] || {};
        };

        return (
            <div className="space-y-1 select-none">
                {/* Table Title */}
                <h4 className="text-xs font-semibold text-gray-800 mb-1">
                    {padlet.title || 'Table'}
                </h4>
                {/* Mini table preview */}
                <div className="overflow-x-auto rounded border border-gray-200 bg-white">
                    <table className="w-full text-[9px]">
                        <thead>
                            <tr className="bg-gray-100">
                                {displayCols.map((col, i) => (
                                    <th key={i} className="px-1 py-0.5 border-r border-gray-200 font-medium text-gray-600">
                                        {col}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {displayRows.length > 0 ? displayRows.map((row, ri) => (
                                <tr key={ri} className="border-t border-gray-200">
                                    {row.slice(0, 3).map((cell, ci) => {
                                        const style = getCellStyle(ri, ci);
                                        return (
                                            <td
                                                key={ci}
                                                className="px-1 py-0.5 border-r border-gray-200 truncate max-w-[50px]"
                                                style={{
                                                    backgroundColor: style.bg || undefined,
                                                    textAlign: style.align || 'left',
                                                    fontWeight: style.bold ? 'bold' : undefined,
                                                    fontStyle: style.italic ? 'italic' : undefined,
                                                    textDecoration: style.underline ? 'underline' : undefined,
                                                }}
                                            >
                                                {cell || '-'}
                                            </td>
                                        );
                                    })}
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={3} className="px-1 py-2 text-center text-gray-400">
                                        Empty table
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                {/* Show more indicator */}
                {(rows.length > 3 || columns.length > 3) && (
                    <p className="text-[9px] text-gray-400">
                        {rows.length} rows × {columns.length} columns
                    </p>
                )}
                {/* Caption */}
                {tableData.caption && (
                    <p className="text-[9px] text-gray-500 italic border-t border-gray-100 pt-1 mt-1">
                        {tableData.caption}
                    </p>
                )}
            </div>
        );
    }

    // --- COMMENT TYPE ---
    if (padlet.type === 'comment') {
        const comments = padlet.metadata?.comments || (() => {
            try {
                return JSON.parse(padlet.content || '[]');
            } catch {
                return [];
            }
        })();

        if (!comments.length) {
            return <div className="text-gray-400 italic text-xs">No comments</div>;
        }

        const last = comments[comments.length - 1];

        return (
            <div className="text-xs text-gray-800 line-clamp-3">
                {last.text || last.content || 'Comment'}
                <div className="mt-1 text-[10px] text-gray-400">
                    {comments.length} comment{comments.length > 1 ? 's' : ''}
                </div>
            </div>
        );
    }

    // --- IMAGE TYPE ---
    const imageSrc =
        padlet.file_url ||
        padlet.metadata?.imageUrl ||
        padlet.metadata?.fileUrl ||
        (typeof padlet.content === "string" && padlet.content.startsWith("http")
            ? padlet.content
            : null);

    if (imageSrc) {
        return (
            <div className="flex flex-col gap-2 pointer-events-none">
                <img
                    src={imageSrc}
                    className="w-full object-contain rounded bg-gray-50"
                    style={{ maxHeight: '200px' }}
                    alt="preview"
                    onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                    }}
                />
                {padlet.title && padlet.title !== 'Image' && (
                    <p className="text-xs font-medium text-center text-gray-600">{padlet.title}</p>
                )}
            </div>
        );
    }

    // --- DRAWING TYPE ---
    if (padlet.type === 'drawing') {
        const previewUrl = padlet.metadata?.previewUrl;

        return (
            <div
                className="flex flex-col items-center justify-center gap-2 text-red-600 bg-red-50/50 rounded-lg border border-red-100 border-dashed overflow-hidden min-h-[100px] cursor-zoom-in group/drawing-preview"
                onClick={(e) => {
                    e.stopPropagation();
                    onView?.();
                }}
                title="Click to view full size"
            >
                {previewUrl ? (
                    <img
                        src={previewUrl}
                        alt="Drawing preview"
                        className="w-full h-auto object-contain max-h-[300px]"
                    />
                ) : (
                    <>
                        <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center mt-4">
                            <svg
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <path d="M12 19l7-7 3 3-7 7-3-3z"></path>
                                <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path>
                                <path d="M2 2l7.5 1.5"></path>
                                <path d="M7 11l5-5"></path>
                            </svg>
                        </div>
                        <span className="text-[10px] font-medium text-red-700">Drawing</span>
                        <span className="text-[9px] text-red-500 italic mb-4">Click to view or edit</span>
                    </>
                )}
            </div>
        );
    }

    // --- CONTAINER TYPE ---
    if (padlet.type === 'container') {
        const childIds = padlet.metadata?.childPadletIds || [];
        const children = allPadlets.filter(p => childIds.includes(p.id));

        return (
            <div className="space-y-3 pointer-events-none select-none">
                <div className="flex items-center gap-2 mb-1">
                    <div className="w-5 h-5 rounded bg-indigo-100 flex items-center justify-center text-indigo-600">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <rect width="18" height="18" x="3" y="3" rx="2" />
                            <path d="M9 3v18" />
                        </svg>
                    </div>
                    <h4 className="text-xs font-bold text-gray-800">
                        {padlet.title || 'Container'}
                    </h4>
                </div>

                {padlet.content && (
                    <p className="text-[10px] text-gray-500 line-clamp-2">{padlet.content}</p>
                )}

                {/* Nested Children Rendering */}
                <div className="space-y-2 border-l-2 border-indigo-100 pl-3 mt-2">
                    {children.length > 0 ? (
                        children.map(child => (
                            <div key={child.id} className="bg-white/50 backdrop-blur-sm rounded border border-gray-100 p-2 shadow-sm">
                                <PostCardContent
                                    padlet={child}
                                    allPadlets={allPadlets}
                                    onScan={onScan}
                                    onView={onView}
                                />
                            </div>
                        ))
                    ) : (
                        <p className="text-[9px] text-gray-400 italic">Empty container</p>
                    )}
                </div>

                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-50">
                    <span className="text-[9px] font-medium bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">
                        {children.length} {children.length === 1 ? 'item' : 'items'}
                    </span>
                    {/* Visual stack indicator */}
                    {children.length > 0 && (
                        <div className="flex -space-x-1">
                            {[...Array(Math.min(children.length, 3))].map((_, i) => (
                                <div key={i} className="w-3 h-3 rounded-full bg-gray-200 border border-white" />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // --- TEXT / DEFAULT TYPE ---
    return (
        <div className="select-none pointer-events-none">
            <div
                className="text-xs prose prose-sm break-words tiptap"
                style={{
                    wordWrap: 'break-word',
                    overflowWrap: 'break-word',
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 12, // Limit height
                    WebkitBoxOrient: 'vertical',
                    color: padlet.metadata?.textColor || '#1F2937'
                }}
                dangerouslySetInnerHTML={{ __html: padlet.content || '' }}
            />
        </div>
    );
}
