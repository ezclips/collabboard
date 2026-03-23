import React, { useState, useEffect, useRef } from 'react';
import { Row, flexRender, CellContext } from '@tanstack/react-table';
import { Padlet, PendingPostDraft } from '@/types/collabboard';
import { CheckSquare, Link as LinkIcon, Image as ImageIcon, FileText } from 'lucide-react';
import Image from 'next/image';
import RowGroupMenu from './RowGroupMenu';

interface TableCanvasRowProps {
    row: Row<Padlet>;
    isEditable: boolean;
    onUpdate: (padlet: Padlet) => void;
    onEdit: (padlet: Padlet) => void;
    columnGroups: string[][];
    rowGroupsState?: Record<string, { rowIds: string[]; name?: string; collapsed?: boolean }>;
    onGroupRows?: (rowIds: string[]) => void;
    onUngroupRows?: (groupId: string, rowIds: string[]) => void;
    onRenameGroup?: (groupId: string, name: string) => void;
    onToggleCollapseGroup?: (groupId: string) => void;
    onColorChangeGroup?: (groupId: string, color: string) => void;
    selectedRowIds?: string[];
    onToggleSelectRow?: (rowId: string) => void;
}

export default function TableCanvasRow({
    row,
    isEditable,
    onUpdate,
    onEdit,
    columnGroups,
    rowGroupsState = {},
    onGroupRows,
    onUngroupRows,
    onRenameGroup,
    onToggleCollapseGroup,
    onColorChangeGroup,
    selectedRowIds = [],
    onToggleSelectRow,
}: TableCanvasRowProps) {
    // Check if this row is part of a group
    const groupId = Object.keys(rowGroupsState).find(gid => rowGroupsState[gid].rowIds.includes(row.id));
    const groupState = groupId ? rowGroupsState[groupId] : undefined;
    const isGrouped = !!groupId;
    const isFirstInGroup = groupState?.rowIds[0] === row.id;

    if (isGrouped && groupState?.collapsed && !isFirstInGroup) {
        return null;
    }

    const isSelected = selectedRowIds.includes(row.id);

    return (
        // Removed border-b and bg-blue-50 here, handled in tr
        <tbody className="relative group/row">
            {columnGroups.map((group, groupIndex) => {
                const groupCells = row.getVisibleCells().filter(cell => group.includes(cell.column.id));

                return (
                    <tr
                        key={groupIndex}
                        className={`transition-colors ${isSelected ? 'bg-blue-50' : 'bg-white shadow-sm'} rounded-lg`}
                    >
                        {groupCells.map((cell, cellIndex) => (
                            <td
                                key={cell.id}
                                className={`p-3 h-24 align-middle text-gray-700 relative first:rounded-l-lg last:rounded-r-lg ${groupIndex > 0 ? '' : 'border-t-0'}`}
                                style={{ width: cell.column.getSize() }}
                            >
                                {/* Render Menu and Checkbox only on First Row, First Column */}
                                {groupIndex === 0 && cellIndex === 0 && (
                                    /* Sidebar Pill in Gutter */
                                    <div className="absolute left-[-36px] top-0 bottom-0 py-2 w-8 flex flex-col items-center justify-center gap-1 z-10 transition-opacity">
                                        <div className="bg-slate-700/90 backdrop-blur-sm w-full rounded-2xl flex flex-col items-center py-2 gap-1 shadow-sm border border-slate-600">
                                            {/* Top: Menu */}
                                            <RowGroupMenu
                                                groupId={groupId}
                                                groupName={groupState?.name}
                                                isGrouped={isGrouped}
                                                isCollapsed={groupState?.collapsed}
                                                onGroupSelected={() => onGroupRows?.(selectedRowIds)}
                                                onUngroup={() => groupId && onUngroupRows?.(groupId, groupState?.rowIds || [])}
                                                onRename={(name) => groupId && onRenameGroup?.(groupId, name)}
                                                onToggleCollapse={() => groupId && onToggleCollapseGroup?.(groupId)}
                                                onColorChange={(color) => groupId && onColorChangeGroup?.(groupId, color)}
                                            />

                                            {/* Middle: Row Index */}
                                            <span className="text-[10px] font-bold text-white selection:bg-transparent cursor-default">
                                                {row.index + 1}
                                            </span>

                                            {/* Bottom: Checkbox (White/Custom style) */}
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => onToggleSelectRow?.(row.id)}
                                                className="h-3 w-3 rounded border-slate-400 bg-slate-600 text-blue-500 focus:ring-offset-slate-700 cursor-pointer"
                                            />
                                        </div>
                                    </div>
                                )}

                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                        ))}
                    </tr>
                );
            })}
        </tbody>
    );
}

// --- Cell Components ---

// Text Cell (Editable)
export function TextCell({
    getValue,
    row,
    column,
    table
}: CellContext<Padlet, unknown>) {
    const initialValue = (getValue() as string) || '';
    const [value, setValue] = useState(initialValue);
    const [isEditing, setIsEditing] = useState(false);
    const isEditable = (table.options.meta as any)?.isEditable;

    useEffect(() => {
        setValue(initialValue);
    }, [initialValue]);

    const onBlur = () => {
        setIsEditing(false);
        if (value !== initialValue) {
            (table.options.meta as any)?.updateData?.(row.original, column.id, value);
        }
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            (e.currentTarget as HTMLInputElement).blur();
        }
        if (e.key === 'Escape') {
            setValue(initialValue);
            setIsEditing(false);
        }
    };

    if (isEditing && isEditable) {
        return (
            <input
                value={value}
                onChange={e => setValue(e.target.value)}
                onBlur={onBlur}
                onKeyDown={onKeyDown}
                autoFocus
                className="w-full bg-white outline-indigo-500 border border-indigo-300 rounded px-1.5 py-0.5 -mx-1.5 -my-0.5 text-sm"
            />
        );
    }

    return (
        <div
            onClick={() => isEditable && setIsEditing(true)}
            className={`min-h-[24px] px-1 -mx-1 rounded truncate cursor-cell ${isEditable ? 'hover:bg-gray-100' : ''}`}
            title={value}
        >
            {value}
        </div>
    );
}

// Author Cell (Read Only)
export function AuthorCell({ getValue }: CellContext<Padlet, unknown>) {
    const authorName = (getValue() as string) || 'Unknown';
    const initial = authorName.charAt(0).toUpperCase();

    return (
        <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-600">
                {initial}
            </div>
            <span className="text-sm text-gray-600 truncate">{authorName}</span>
        </div>
    );
}

// Date Cell (Read Only)
export function DateCell({ getValue }: CellContext<Padlet, unknown>) {
    const dateStr = getValue() as string;
    if (!dateStr) return <span className="text-gray-300">-</span>;

    const date = new Date(dateStr);
    return (
        <span className="text-xs text-gray-500 whitespace-nowrap">
            {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
        </span>
    );
}

// Attachment Cell (Read Only - Click to Edit)
export function AttachmentCell({ row, table }: CellContext<Padlet, unknown>) {
    const padlet = row.original;
    const isEditable = (table.options.meta as any)?.isEditable;

    // Derive attachment from metadata/type
    let attachmentUrl = padlet.file_url || (padlet.metadata as any)?.imageUrl || (padlet.metadata as any)?.svgUrl;
    let typeLabel = 'File';
    let Icon = FileText;

    if (padlet.type === 'image') {
        typeLabel = 'Image';
        Icon = ImageIcon;
    } else if (padlet.type === 'link') {
        typeLabel = 'Link';
        Icon = LinkIcon;
        attachmentUrl = padlet.content; // For links, content is URL usually
    }

    if (!attachmentUrl) return <span className="text-gray-300 text-xs">-</span>;

    return (
        <div
            className="flex items-center gap-2 group cursor-pointer"
            onClick={() => isEditable && (table.options.meta as any)?.onPadletEdit?.(padlet)}
        >
            {padlet.type === 'image' && attachmentUrl ? (
                <div className="w-8 h-8 relative rounded overflow-hidden bg-gray-100 border border-gray-200">
                    {/* Use img for simplicity or Next Image if domain allowlisted */}
                    <img src={attachmentUrl} alt="Thumbnail" className="w-full h-full object-cover" />
                </div>
            ) : (
                <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center text-gray-500">
                    <Icon size={14} />
                </div>
            )}
            <span className="text-xs text-blue-600 truncate max-w-[150px] underline decoration-transparent group-hover:decoration-blue-600">
                {typeLabel}
            </span>
        </div>
    );
}

// Smart Content Cell (Polymorphic)
export function SmartContentCell(props: CellContext<Padlet, unknown>) {
    const { row, table } = props;
    const type = row.original.type;

    if (type === 'todo') {
        return <TodoSummaryCell {...props} />;
    }

    // For Note/Text posts: show preview and open NoteEditor on click
    if (type === 'text' || type === 'note') {
        const content = row.original.content || '';
        // Strip HTML for preview (basic)
        const plainText = content.replace(/<[^>]+>/g, ' ').trim().substring(0, 60);

        return (
            <div
                onClick={() => (table.options.meta as any)?.onPadletEdit?.(row.original)}
                className="group cursor-pointer min-h-[24px] px-1 -mx-1 rounded hover:bg-blue-50 flex items-center gap-2"
                title="Click to edit full note"
            >
                <FileText size={14} className="text-gray-400 group-hover:text-blue-500 flex-shrink-0" />
                <span className="truncate text-sm text-gray-700">
                    {plainText || <span className="text-gray-400 italic">Empty note</span>}
                </span>
            </div>
        );
    }

    // Default to TextCell for notes, comments, etc.
    // For links, content is URL, maybe we want TextCell to edit it? Yes.
    return <TextCell {...props} />;
}

// Todo Summary Cell
function TodoSummaryCell({ getValue, row, table }: CellContext<Padlet, unknown>) {
    const content = getValue() as string;
    let tasks: any[] = [];
    try {
        // Content might be JSON directly or string? 
        // Standard is array of objects in metadata.tasks usually?
        // Or stringified in 'content'? 
        // DraftToInsert puts it in content: JSON.stringify(tasks).
        tasks = JSON.parse(content || '[]');
    } catch {
        tasks = (row.original.metadata as any)?.tasks || [];
    }

    if (!Array.isArray(tasks) || tasks.length === 0) {
        return <span className="text-gray-400 text-xs text-italic">No tasks</span>;
    }

    const completed = tasks.filter(t => t.completed).length;
    const total = tasks.length;
    const percent = Math.round((completed / total) * 100);

    return (
        <div
            className="flex items-center gap-2 cursor-pointer hover:opacity-80"
            onClick={() => (row.original.metadata as any)?.isEditable !== false && (table.options.meta as any)?.onPadletEdit?.(row.original)}
        >
            <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div className="h-full bg-green-500" style={{ width: `${percent}%` }} />
            </div>
            <span className="text-xs text-gray-600">{completed}/{total}</span>
        </div>
    );
}
