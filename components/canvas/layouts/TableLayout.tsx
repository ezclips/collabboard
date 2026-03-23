import React, { useMemo } from 'react';
import {
    useReactTable,
    getCoreRowModel,
    flexRender,
    createColumnHelper,
    ColumnDef
} from '@tanstack/react-table';
import { Padlet, BoardSection } from '@/types/collabboard';
import TableCanvasRow, { TextCell, AuthorCell, DateCell, SmartContentCell, AttachmentCell } from './TableCanvasRow';
import { supabase } from '@/lib/supabase';
import { DndContext, closestCenter, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus } from 'lucide-react';
import ColumnHeaderMenu from './ColumnHeaderMenu';
import { TableColumnManager } from './TableColumnManager';
import { TableInputForm } from './TableInputForm';

interface TableLayoutProps {
    padlets: Padlet[];
    sections: BoardSection[];
    isEditable: boolean;
    canvasId: string;
    onPadletUpdate: (padlet: Padlet) => void;
    onPadletDelete: (padletId: string) => void;
    onPadletEdit: (padlet: Padlet) => void;
    onAddPostBefore?: (post: Padlet) => void;
    onAddPostAfter?: (post: Padlet) => void;
}

// Debounce helper
function debounce<T extends (...args: any[]) => void>(fn: T, ms: number) {
    let t: any;
    return (...args: Parameters<T>) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
    };
}

// Sortable Header Component
interface SortableHeaderProps {
    id: string;
    header: any;
    width: number;
    columnSettings: any;
    onToggleVisibility: () => void;
    onToggleRequired: (req: boolean) => void;
    onUpdatePlaceholder: (text: string) => void;
    onGroup: (action: 'next' | 'previous' | 'ungroup') => void;
}

function SortableHeader({
    id,
    header,
    width,
    columnSettings,
    onToggleVisibility,
    onToggleRequired,
    onUpdatePlaceholder,
    onGroup
}: SortableHeaderProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        width,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <th
            ref={setNodeRef}
            style={style}
            className="p-3 border-r border-gray-100 last:border-r-0 relative group select-none"
            {...attributes}
            {...listeners}
        >
            <div className="flex items-center justify-between">
                <div className="truncate cursor-move flex-1">
                    {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                </div>

                {/* Context Menu - Stop propagation to prevent drag start */}
                <div className="ml-2" onPointerDown={e => e.stopPropagation()}>
                    <ColumnHeaderMenu
                        columnId={id}
                        title={header.column.columnDef.header as string}
                        isVisible={header.column.getIsVisible()}
                        isRequired={columnSettings?.required}
                        placeholder={columnSettings?.placeholder}
                        onToggleVisibility={onToggleVisibility}
                        onToggleRequired={onToggleRequired}
                        onUpdatePlaceholder={onUpdatePlaceholder}
                        onGroup={onGroup}
                    />
                </div>
            </div>

            {/* Resize Handle */}
            <div
                onMouseDown={header.getResizeHandler()}
                onTouchStart={header.getResizeHandler()}
                onPointerDown={(e) => e.stopPropagation()}
                className={`absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-300 opacity-0 group-hover:opacity-100 ${header.column.getIsResizing() ? 'bg-blue-500 opacity-100' : ''
                    }`}
            />
        </th>
    );
}

// Type for column grouping
type ColumnGroup = string[];

type ColumnSettings = Record<string, {
    required?: boolean;
    placeholder?: string;
    fieldType?: string;
}>;

type RowGroupState = Record<string, {
    rowIds: string[];
    name?: string;
    collapsed?: boolean;
}>;

export default function TableLayout({
    padlets,
    sections,
    isEditable,
    canvasId,
    onPadletUpdate,
    onPadletDelete,
    onPadletEdit,
    onAddPostAfter
}: TableLayoutProps) {

    // State for Table Settings
    const [columnVisibility, setColumnVisibility] = React.useState({});
    const [columnGroups, setColumnGroups] = React.useState<ColumnGroup[]>([]);
    const [columnSettings, setColumnSettings] = React.useState<ColumnSettings>({});
    const [rowGroups, setRowGroups] = React.useState<RowGroupState>({});

    // State for Input Form
    const [isInputFormOpen, setIsInputFormOpen] = React.useState(false);

    const handleFormSubmit = (data: Partial<Padlet>) => {
        if (!onAddPostAfter) return;

        const newPadlet = {
            id: crypto.randomUUID(),
            type: data.type || 'text',
            title: data.title || '',
            content: data.content || '',
            file_url: data.file_url || '',
            metadata: data.metadata || {},
            created_at: data.created_at || new Date().toISOString(),
            updated_at: data.updated_at || new Date().toISOString(),
        } as Padlet;

        onAddPostAfter(newPadlet);
    };

    // Load initial settings from board metadata
    React.useEffect(() => {
        const loadSettings = async () => {
            if (!canvasId) return;
            try {
                const { data: board } = await supabase.from('boards').select('metadata').eq('id', canvasId).single();
                if (board?.metadata?.tableSettings) {
                    const settings = board.metadata.tableSettings;

                    // Load columnGroups if available, otherwise migrate from old columnOrder
                    // Force ungroup (flatten) for standard view as requested
                    const flatColumns = settings.columnGroups ? settings.columnGroups.flat() : (settings.columnOrder || []);
                    if (flatColumns.length > 0) {
                        setColumnGroups([flatColumns]);
                    }

                    if (settings.columnVisibility) setColumnVisibility(settings.columnVisibility);
                    if (settings.columnSettings) setColumnSettings(settings.columnSettings);
                    if (settings.rowGroups) setRowGroups(settings.rowGroups);
                }
            } catch (e) {
                console.error("Failed to load table settings", e);
            }
        };
        loadSettings();

    }, [canvasId]);



    // Derive flat columnOrder for TanStack Table from columnGroups
    const columnOrder = useMemo(() => columnGroups.flat(), [columnGroups]);

    // Debounced Save
    const saveSettings = useMemo(() => debounce(async (visibility, groups, colSettings, rGroups) => {
        if (!canvasId) return;
        try {
            const { data: board } = await supabase.from('boards').select('metadata').eq('id', canvasId).single();
            if (board) {
                const newMeta = {
                    ...board.metadata,
                    tableSettings: {
                        columnVisibility: visibility,
                        columnGroups: groups,
                        columnSettings: colSettings,
                        rowGroups: rGroups
                    }
                };
                await supabase.from('boards').update({ metadata: newMeta }).eq('id', canvasId);
            }
        } catch (e) {
            console.error("Failed to save table settings", e);
        }
    }, 1000), [canvasId]);

    // Persist changes
    React.useEffect(() => {
        saveSettings(columnVisibility, columnGroups, columnSettings, rowGroups);
    }, [columnVisibility, columnGroups, columnSettings, rowGroups, saveSettings]);

    // DnD Setup
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 15,
            },
        })
    );

    // Handlers for Column Settings
    const handleToggleRequired = (colId: string, required: boolean) => {
        setColumnSettings(prev => ({
            ...prev,
            [colId]: { ...prev[colId], required }
        }));
    };

    const handleUpdatePlaceholder = (colId: string, placeholder: string) => {
        setColumnSettings(prev => ({
            ...prev,
            [colId]: { ...prev[colId], placeholder }
        }));
    };

    const handleGroupColumn = (columnId: string, action: 'next' | 'previous' | 'ungroup') => {
        // Find current group
        let currentGroupIndex = -1;
        for (let i = 0; i < columnGroups.length; i++) {
            if (columnGroups[i].includes(columnId)) {
                currentGroupIndex = i;
                break;
            }
        }

        if (currentGroupIndex === -1 && action !== 'ungroup') return;

        let newGroups = columnGroups.map(g => [...g]);

        // Remove from current group
        if (currentGroupIndex !== -1) {
            newGroups[currentGroupIndex] = newGroups[currentGroupIndex].filter(id => id !== columnId);
        }

        if (action === 'ungroup') {
            if (!newGroups[0]) newGroups[0] = [];
            newGroups[0].push(columnId);
        } else if (action === 'next') {
            if (newGroups[currentGroupIndex + 1]) {
                newGroups[currentGroupIndex + 1].push(columnId);
            } else {
                newGroups.push([columnId]);
            }
        } else if (action === 'previous') {
            if (currentGroupIndex > 0) {
                newGroups[currentGroupIndex - 1].push(columnId);
            } else {
                if (!newGroups[0]) newGroups[0] = [];
                newGroups[0].push(columnId);
            }
        }

        setColumnGroups(newGroups.filter(g => g.length > 0));
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        // Only reorder within Group 0 (first row)
        const group0 = columnGroups[0] || [];
        const oldIndex = group0.indexOf(active.id as string);
        const newIndex = group0.indexOf(over.id as string);

        if (oldIndex === -1 || newIndex === -1) return;

        const newGroup0 = [...group0];
        const [moved] = newGroup0.splice(oldIndex, 1);
        newGroup0.splice(newIndex, 0, moved);

        setColumnGroups([newGroup0, ...columnGroups.slice(1)]);
    };

    // Row Selection State
    const [selectedRowIds, setSelectedRowIds] = React.useState<string[]>([]);

    const handleToggleSelectRow = (rowId: string) => {
        setSelectedRowIds(prev =>
            prev.includes(rowId) ? prev.filter(id => id !== rowId) : [...prev, rowId]
        );
    };

    // Row Grouping Handlers
    const handleGroupRows = (ids: string[]) => {
        if (ids.length === 0) return;
        const groupId = crypto.randomUUID();
        setRowGroups(prev => ({
            ...prev,
            [groupId]: {
                rowIds: ids,
                name: 'New Group',
                collapsed: false
            }
        }));
        setSelectedRowIds([]);
    };

    const handleUngroupRows = (groupId: string) => {
        setRowGroups(prev => {
            const next = { ...prev };
            delete next[groupId];
            return next;
        });
    };

    const handleRenameGroup = (groupId: string, name: string) => {
        setRowGroups(prev => ({ ...prev, [groupId]: { ...prev[groupId], name } }));
    };

    const handleToggleCollapseGroup = (groupId: string) => {
        setRowGroups(prev => ({ ...prev, [groupId]: { ...prev[groupId], collapsed: !prev[groupId].collapsed } }));
    };

    const handleColorChangeGroup = (groupId: string, color: string) => {
        setRowGroups(prev => ({ ...prev, [groupId]: { ...prev[groupId], color } as any }));
    };

    // Memoize column definitions
    const columns = useMemo(() => {
        const columnHelper = createColumnHelper<Padlet>();

        // 1. Standard Columns
        const standardCols = [
            columnHelper.accessor('title', {
                id: 'subject',
                header: 'Subject',
                cell: TextCell,
                size: 300,
            }),
            columnHelper.accessor(row => (row.metadata as any)?.author?.name || 'Unknown', {
                id: 'author',
                header: 'Author',
                cell: AuthorCell,
                size: 150,
            }),
            columnHelper.accessor('created_at', {
                id: 'created',
                header: 'Created',
                cell: DateCell,
                size: 120,
            }),
            columnHelper.accessor('content', {
                id: 'body',
                header: 'Body/Tasks',
                cell: SmartContentCell,
                size: 300,
            }),
            columnHelper.accessor('file_url', {
                id: 'attachment',
                header: 'Attachment',
                cell: AttachmentCell,
                size: 100,
            }),
        ];

        // 2. Dynamic Columns from Sections (acting as Custom Fields)
        const dynamicCols = sections.map(section => {
            return columnHelper.accessor(row => {
                // Read value from metadata.tableValues
                const tableValues = (row.metadata as any)?.tableValues || {};
                return tableValues[section.id];
            }, {
                id: String(section.id),
                header: section.title,
                cell: TextCell,
                size: 200,
            });
        });

        // Fallback: If no sections and no standard cols? (Standard cols always exist)
        return [...standardCols, ...dynamicCols];
    }, [sections]);

    // Initialize columnGroups if empty
    React.useEffect(() => {
        if (columnGroups.length === 0 && columns.length > 0) {
            const allColumnIds = columns.map(col => col.id as string);
            setColumnGroups([allColumnIds]);
        }
    }, [columns, columnGroups.length]);

    /* eslint-disable react-hooks/exhaustive-deps */
    const table = useReactTable({
        data: padlets,
        columns,
        getCoreRowModel: getCoreRowModel(),
        state: {
            columnVisibility,
            columnOrder,
        },
        onColumnVisibilityChange: setColumnVisibility,
        meta: {
            updateData: async (padlet: Padlet, columnId: string, value: unknown) => {
                // 1. Determine update payload
                let updatePayload: any = {};

                if (columnId === 'subject') {
                    updatePayload = { title: value };
                } else {
                    // It's a dynamic column (section ID)
                    const currentMeta = padlet.metadata || {};
                    const currentTableValues = (currentMeta as any).tableValues || {};
                    updatePayload = {
                        metadata: {
                            ...currentMeta,
                            tableValues: {
                                ...currentTableValues,
                                [columnId]: value
                            }
                        }
                    };
                }

                // 2. Optimistic Update
                const updatedPadlet = { ...padlet, ...updatePayload };
                onPadletUpdate(updatedPadlet);

                // 3. Persist to Supabase
                try {
                    await supabase.from('padlets').update({
                        ...updatePayload,
                        updated_at: new Date().toISOString()
                    }).eq('id', padlet.id);
                } catch (err) {
                    console.error('Failed to update table cell', err);
                }
            },
            isEditable,
            onPadletEdit
        }
    });
    /* eslint-enable react-hooks/exhaustive-deps */

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className="w-full h-full overflow-auto bg-white/50 backdrop-blur-sm p-6">
                <div className="rounded-lg shadow-sm border border-gray-200 bg-white overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full border-separate border-spacing-y-4 text-left text-sm ml-10" style={{ width: table.getTotalSize() }}>
                            <thead className="bg-gray-50 text-gray-600 font-medium border-b border-gray-200 sticky top-0 z-10 shadow-sm">
                                {table.getHeaderGroups().map(headerGroup => {
                                    // Filter headers to only show Group 0 (first row)
                                    const group0 = columnGroups[0] || [];
                                    const group0Headers = headerGroup.headers.filter(h => group0.includes(h.column.id));

                                    return (
                                        <tr key={headerGroup.id}>
                                            <SortableContext items={group0} strategy={horizontalListSortingStrategy}>
                                                {group0Headers.map(header => (
                                                    <SortableHeader
                                                        key={header.id}
                                                        id={header.column.id}
                                                        header={header}
                                                        width={header.getSize()}
                                                        columnSettings={columnSettings?.[header.column.id]}
                                                        onToggleVisibility={() => header.column.toggleVisibility()}
                                                        onToggleRequired={(req) => handleToggleRequired(header.column.id, req)}
                                                        onUpdatePlaceholder={(text) => handleUpdatePlaceholder(header.column.id, text)}
                                                        onGroup={(action) => handleGroupColumn(header.column.id, action)}
                                                    />
                                                ))}
                                            </SortableContext>
                                            <th className="w-10 p-3 border-b border-gray-200 sticky right-0 bg-gray-50 z-20">
                                                <TableColumnManager table={table} />
                                            </th>
                                        </tr>
                                    );
                                })}
                            </thead>
                            {table.getRowModel().rows.map(row => (
                                <TableCanvasRow
                                    key={row.id}
                                    row={row}
                                    isEditable={isEditable}
                                    onUpdate={onPadletUpdate}
                                    onEdit={onPadletEdit}
                                    columnGroups={columnGroups}
                                    rowGroupsState={rowGroups}
                                    onGroupRows={handleGroupRows}
                                    onUngroupRows={handleUngroupRows}
                                    onRenameGroup={handleRenameGroup}
                                    onToggleCollapseGroup={handleToggleCollapseGroup}
                                    onColorChangeGroup={handleColorChangeGroup}
                                    selectedRowIds={selectedRowIds}
                                    onToggleSelectRow={handleToggleSelectRow}
                                />
                            ))}
                        </table>

                        {padlets.length === 0 && (
                            <div className="p-12 text-center text-gray-400">
                                <p>No posts yet.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Add Row Button */}
            <div className="mt-4 flex justify-center pb-8">
                <button
                    onClick={() => isEditable && setIsInputFormOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    <span>New Record</span>
                </button>
            </div>

            <TableInputForm
                isOpen={isInputFormOpen}
                onClose={() => setIsInputFormOpen(false)}
                onSubmit={handleFormSubmit}
                sections={sections}
            />
        </DndContext>
    );
}
