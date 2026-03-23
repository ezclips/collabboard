// lib/collabboard/layouts/ColumnsLayout.tsx

import React, { useState, useEffect } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MoreVertical,
  Edit2,
  Plus,
  Trash2,
  MoveLeft,
  MoveRight,
  ArrowLeft,
  ArrowRight
} from "lucide-react";
import PostPreviewCard from "@/components/collabboard/PostPreviewCard";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface PadletPosition {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface ColumnsConfig {
  // Current settings
  newPostsAtTop: boolean;

  // Future columns-specific settings
  columnWidth: 'auto' | 'fixed' | 'fluid';
  fixedColumnWidth: number;
  minColumnWidth: number;
  maxColumnWidth: number;
  columnSpacing: 'tight' | 'normal' | 'loose';
  columnAlignment: 'left' | 'center' | 'right';

  // Drag and drop settings
  enableDragDrop: boolean;
  dragDropAnimation: boolean;
  dragDropGhost: boolean;
  crossColumnDrop: boolean;
  reorderColumns: boolean;

  // Visual settings
  columnBackground: string;
  columnBorder: boolean;
  columnShadow: boolean;
  columnRadius: 'none' | 'small' | 'medium' | 'large';
  headerStyle: 'simple' | 'bold' | 'colored' | 'custom';

  // Content settings
  showItemCount: boolean;
  showColumnMenu: boolean;
  allowEmptyColumns: boolean;
  autoCollapseEmpty: boolean;
  maxItemsPerColumn: number;
  itemSorting: 'manual' | 'date' | 'alphabetical' | 'priority';

  // Collaboration settings
  realTimeUpdates: boolean;
  showUserAvatars: boolean;
  columnOwnership: boolean;
  lockColumns: boolean;

  // Performance settings
  virtualScrolling: boolean;
  lazyLoading: boolean;
  itemPagination: number;

  // Access control
  viewPermissions: 'public' | 'restricted' | 'private';
  editPermissions: 'owner' | 'collaborators' | 'anyone';
  columnPermissions: { [columnId: string]: 'read' | 'write' | 'admin' };
}

export interface Padlet {
  id: string;
  title: string;
  content: string;
  board_id?: string;
  created_at?: string;
  author_id?: string;
  column_id?: string;
  position?: number;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  tags?: string[];
  attachments?: any[];
}

export interface ColumnData {
  id: string;
  title: string;
  items: Padlet[];
  description?: string;
  color?: string;
  icon?: string;
  collapsed?: boolean;
  locked?: boolean;
  owner_id?: string;
  max_items?: number;
  sort_order?: number;
}

export interface ColumnProps {
  id: string;
  title: string;
  items: Padlet[];
  config?: Partial<ColumnsConfig>;
  onRename: (id: string, newTitle: string) => void;
  onDelete: (id: string) => void;
  onAddPost: (columnId: string) => void;
  onMove: (columnId: string, direction: 'left' | 'right') => void;
  onAddSection: (direction: 'left' | 'right') => void;
  onEditItem: (item: Padlet) => void;
  onDeleteItem?: (itemId: string, columnId: string) => void;
  onMoveItem?: (itemId: string, fromColumn: string, toColumn: string, newIndex: number) => void;
}

export interface ColumnsPreviewProps {
  columns: ColumnData[];
  config: Partial<ColumnsConfig>;
  onEditItem: (padlet: Padlet, columnId?: string) => void;
  onAddPost: (columnId: string) => void;
  onRenameColumn: (columnId: string, newTitle: string) => void;
  onDeleteColumn: (columnId: string) => void;
  onMoveColumn: (columnId: string, direction: 'left' | 'right') => void;
  onAddColumn: (baseColumnId?: string, direction?: 'left' | 'right') => void;
  onDeleteItem?: (itemId: string, columnId: string) => void;
}

export interface ColumnsLiveCanvasProps extends ColumnsPreviewProps {
  canvasId: string;
  isEditable: boolean;
  collaborators?: any[];
  onSave?: (columns: ColumnData[]) => void;
  onDragEnd?: (result: any) => void;
}

export interface ColumnsSettingsProps {
  config: ColumnsConfig;
  onChange: (config: Partial<ColumnsConfig>) => void;
  onSave: () => void;
}

// ============================================================================
// POSITIONING CALCULATION FUNCTION
// ============================================================================

/**
 * Columns Layout - Arranges padlets in vertical columns
 * For columns layout, we return empty positions since columns are handled 
 * differently in the UI (using the Column components directly)
 */
export function calculateColumnsPositions(
  count: number,
  canvasWidth: number,
  canvasHeight?: number
): PadletPosition[] {
  // Columns layout is handled by the Column components in the UI
  // This function exists for consistency but returns empty positions
  // since column layout uses a different rendering approach
  return [];
}

// ============================================================================
// COLUMN COMPONENT (Individual Column)
// ============================================================================

export const Column: React.FC<ColumnProps> = ({
  id,
  title,
  items,
  config = {},
  onRename,
  onDelete,
  onAddPost,
  onMove,
  onAddSection,
  onEditItem,
  onDeleteItem,
  onMoveItem
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editingTitle, setEditingTitle] = useState(title);

  const {
    columnWidth = 'auto',
    fixedColumnWidth = 320,
    showItemCount = true,
    showColumnMenu = true,
    columnBackground = 'bg-slate-200/80',
    columnRadius = 'medium'
  } = config;

  const handleTitleSave = () => {
    if (editingTitle.trim() && editingTitle.trim() !== title) {
      onRename(id, editingTitle.trim());
    } else {
      setEditingTitle(title);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleTitleSave();
    } else if (e.key === 'Escape') {
      setEditingTitle(title);
      setIsEditing(false);
    }
  };

  useEffect(() => {
    setEditingTitle(title);
  }, [title]);

  const handleDeleteSection = () => {
    const itemCount = items.length;
    const message = itemCount > 0
      ? `Are you sure you want to delete "${title}" and its ${itemCount} item(s)?`
      : `Are you sure you want to delete "${title}"?`;

    if (window.confirm(message)) {
      onDelete(id);
    }
  };

  const getColumnWidthStyle = () => {
    switch (columnWidth) {
      case 'fixed':
        return { width: `${fixedColumnWidth}px` };
      case 'fluid':
        return { flex: 1, minWidth: '280px' };
      default:
        return { width: '320px' };
    }
  };

  const getRadiusClass = () => {
    switch (columnRadius) {
      case 'none': return 'rounded-none';
      case 'small': return 'rounded';
      case 'large': return 'rounded-xl';
      default: return 'rounded-lg';
    }
  };

  return (
    <div
      className={`flex flex-col ${columnBackground} ${getRadiusClass()} p-1 mx-2 flex-shrink-0 relative`}
      style={getColumnWidthStyle()}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between p-2 text-slate-800">
        <div className="flex-1 flex items-center gap-2">
          {isEditing ? (
            <Input
              type="text"
              value={editingTitle}
              onChange={(e) => setEditingTitle(e.target.value)}
              onBlur={handleTitleSave}
              onKeyDown={handleKeyDown}
              className="font-bold bg-white border-blue-500 h-8 text-sm"
              autoFocus
            />
          ) : (
            <h3
              className="font-bold text-sm p-1 cursor-pointer hover:text-blue-600 flex-1"
              onClick={() => setIsEditing(true)}
            >
              {title}
            </h3>
          )}

          {showItemCount && (
            <span className="text-xs text-slate-600 bg-slate-300/50 px-2 py-1 rounded-full">
              {items.length}
            </span>
          )}
        </div>

        {showColumnMenu && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-slate-300/50"
              >
                <MoreVertical size={18} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-white border border-gray-200 shadow-lg">
              <DropdownMenuItem onClick={() => onAddPost(id)}>
                <Plus className="mr-2 h-4 w-4" />
                Add post
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsEditing(true)}>
                <Edit2 className="mr-2 h-4 w-4" />
                Rename section
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onAddSection('left')}>
                <MoveLeft className="mr-2 h-4 w-4" />
                New section left
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAddSection('right')}>
                <MoveRight className="mr-2 h-4 w-4" />
                New section right
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={() => onMove(id, 'left')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Move section left
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onMove(id, 'right')}>
                <ArrowRight className="mr-2 h-4 w-4" />
                Move section right
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onClick={handleDeleteSection}
                className="text-red-600 focus:text-red-600 focus:bg-red-50"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete section
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Column Content */}
      <div className="flex-grow min-h-[100px] space-y-2 px-1 overflow-y-auto">
        {items.map((item, index) => (
          <div
            key={item.id}
            className="bg-white p-3 rounded-lg shadow-sm cursor-pointer hover:shadow-md transition-shadow relative group"
            onClick={() => onEditItem(item)}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h4 className="font-medium text-sm mb-1">{item.title}</h4>
                <PostPreviewCard
                  padlet={item as any}
                  className="mt-1"
                />
              </div>

              {/* Item Actions */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreVertical size={12} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem onClick={() => onEditItem(item)}>
                    <Edit2 className="mr-2 h-3 w-3" /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onAddPost(id)}>
                    <Plus className="mr-2 h-3 w-3" /> Add Above
                  </DropdownMenuItem>
                  {onDeleteItem && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => {
                          if (window.confirm(`Delete "${item.title}"?`)) {
                            onDeleteItem(item.id, id);
                          }
                        }}
                        className="text-red-600 focus:text-red-600 focus:bg-red-50"
                      >
                        <Trash2 className="mr-2 h-3 w-3" /> Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Item Metadata */}
            {item.tags && item.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {item.tags.slice(0, 3).map((tag, i) => (
                  <span key={i} className="text-xs bg-blue-100 text-blue-600 px-1 py-0.5 rounded">
                    {tag}
                  </span>
                ))}
                {item.tags.length > 3 && (
                  <span className="text-xs text-gray-500">+{item.tags.length - 3}</span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add Item Button */}
      <Button variant="ghost" onClick={() => onAddPost(id)} className="w-full mt-2 h-9">
        <Plus size={16} />
      </Button>
    </div>
  );
};

// ============================================================================
// COLUMNS PREVIEW COMPONENT (For Canvas Setup)
// ============================================================================

export const ColumnsPreview: React.FC<ColumnsPreviewProps> = ({
  columns,
  config = {},
  onEditItem,
  onAddPost,
  onRenameColumn,
  onDeleteColumn,
  onMoveColumn,
  onAddColumn,
  onDeleteItem
}) => {
  if (columns.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 text-xl">
        Add some columns to see the Columns layout preview
      </div>
    );
  }

  return (
    <div className="flex gap-4 h-full overflow-x-auto p-4 min-h-[600px]">
      {columns.map(col => (
        <Column
          key={col.id}
          id={col.id}
          title={col.title}
          items={col.items}
          config={config}
          onRename={onRenameColumn}
          onDelete={onDeleteColumn}
          onAddPost={onAddPost}
          onMove={onMoveColumn}
          onAddSection={(direction) => onAddColumn(col.id, direction)}
          onEditItem={(item) => onEditItem(item, col.id)}
          onDeleteItem={onDeleteItem}
        />
      ))}

      {/* Add Column Button */}
      <div className="flex-shrink-0 w-80 flex items-center justify-center">
        <Button
          variant="outline"
          className="h-20 w-full border-2 border-dashed border-gray-300 text-gray-600 hover:border-blue-400 hover:text-blue-600"
          onClick={() => onAddColumn()}
        >
          <Plus className="mr-2 h-5 w-5" />
          Add Column
        </Button>
      </div>
    </div>
  );
};

// ============================================================================
// COLUMNS LIVE CANVAS COMPONENT (Future Implementation)
// ============================================================================

export const ColumnsLiveCanvas: React.FC<ColumnsLiveCanvasProps> = ({
  canvasId,
  isEditable,
  columns,
  config = {},
  collaborators = [],
  onEditItem,
  onAddPost,
  onRenameColumn,
  onDeleteColumn,
  onMoveColumn,
  onAddColumn,
  onDeleteItem,
  onSave,
  onDragEnd
}) => {
  // TODO: Implement live columns functionality
  // - Drag and drop between columns
  // - Real-time collaboration
  // - Live updates with conflict resolution
  // - User cursors and activity indicators
  // - Column permissions and locking
  // - Performance optimizations for large datasets

  return (
    <div className="relative w-full h-full">
      <div className="flex items-center justify-center h-64 text-gray-500">
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-2">Columns Live Canvas</h3>
          <p>Canvas ID: {canvasId}</p>
          <p>Editable: {isEditable ? 'Yes' : 'No'}</p>
          <p>Collaborators: {collaborators.length}</p>
          <p>Columns: {columns.length}</p>
          <p className="text-sm text-gray-400 mt-2">Coming soon...</p>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// COLUMNS SETTINGS COMPONENT (Future Implementation)
// ============================================================================

export const ColumnsSettings: React.FC<ColumnsSettingsProps> = ({
  config,
  onChange,
  onSave
}) => {
  // TODO: Implement columns-specific settings
  // - Column width and spacing options
  // - Drag and drop configuration
  // - Visual styling options
  // - Content and sorting settings
  // - Collaboration and permissions
  // - Performance optimizations

  return (
    <div className="space-y-6 p-4">
      <h3 className="text-lg font-semibold">Columns Settings</h3>

      <div className="text-gray-500">
        <p>Columns-specific settings will include:</p>
        <ul className="list-disc ml-6 mt-2 space-y-1">
          <li>Column width and spacing controls</li>
          <li>Drag and drop configuration</li>
          <li>Visual styling and themes</li>
          <li>Content sorting and filtering</li>
          <li>Item count and metadata display</li>
          <li>Collaboration and real-time features</li>
          <li>Column permissions and ownership</li>
          <li>Performance and virtualization</li>
        </ul>
        <p className="text-sm mt-4">Coming soon...</p>
      </div>
    </div>
  );
};

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const defaultColumnsConfig: ColumnsConfig = {
  // Current settings
  newPostsAtTop: false,

  // Layout settings
  columnWidth: 'auto',
  fixedColumnWidth: 320,
  minColumnWidth: 200,
  maxColumnWidth: 500,
  columnSpacing: 'normal',
  columnAlignment: 'left',

  // Drag and drop
  enableDragDrop: true,
  dragDropAnimation: true,
  dragDropGhost: true,
  crossColumnDrop: true,
  reorderColumns: true,

  // Visual settings
  columnBackground: 'bg-slate-200/80',
  columnBorder: false,
  columnShadow: false,
  columnRadius: 'medium',
  headerStyle: 'simple',

  // Content settings
  showItemCount: true,
  showColumnMenu: true,
  allowEmptyColumns: true,
  autoCollapseEmpty: false,
  maxItemsPerColumn: 100,
  itemSorting: 'manual',

  // Collaboration
  realTimeUpdates: true,
  showUserAvatars: true,
  columnOwnership: false,
  lockColumns: false,

  // Performance
  virtualScrolling: false,
  lazyLoading: false,
  itemPagination: 50,

  // Access control
  viewPermissions: 'public',
  editPermissions: 'collaborators',
  columnPermissions: {}
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export const validateColumnsData = (columns: ColumnData[]): boolean => {
  // Validate columns data structure
  return columns.every(col =>
    col.id &&
    col.title &&
    Array.isArray(col.items)
  );
};

export const sortColumnItems = (
  items: Padlet[],
  sortType: ColumnsConfig['itemSorting'] = 'manual'
): Padlet[] => {
  switch (sortType) {
    case 'date':
      return [...items].sort((a, b) =>
        new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
      );
    case 'alphabetical':
      return [...items].sort((a, b) => a.title.localeCompare(b.title));
    case 'priority':
      const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
      return [...items].sort((a, b) =>
        (priorityOrder[a.priority || 'low'] || 3) - (priorityOrder[b.priority || 'low'] || 3)
      );
    default:
      return items; // manual sorting - preserve order
  }
};

export const filterColumnsByPermission = (
  columns: ColumnData[],
  userId: string,
  permission: 'read' | 'write' | 'admin' = 'read'
): ColumnData[] => {
  // TODO: Implement permission-based filtering
  return columns;
};

export const getColumnStatistics = (columns: ColumnData[]) => {
  return {
    totalColumns: columns.length,
    totalItems: columns.reduce((sum, col) => sum + col.items.length, 0),
    averageItemsPerColumn: columns.length > 0
      ? Math.round(columns.reduce((sum, col) => sum + col.items.length, 0) / columns.length)
      : 0,
    emptyColumns: columns.filter(col => col.items.length === 0).length,
    fullestColumn: columns.reduce((max, col) =>
      col.items.length > max.items.length ? col : max,
      { items: [] } as ColumnData
    )
  };
};

export const exportColumnsData = (
  columns: ColumnData[],
  format: 'json' | 'csv' | 'markdown' = 'json'
): string => {
  switch (format) {
    case 'csv':
      let csv = 'Column,Title,Content,Created\n';
      columns.forEach(col => {
        col.items.forEach(item => {
          csv += `"${col.title}","${item.title}","${item.content}","${item.created_at || ''}"\n`;
        });
      });
      return csv;
    case 'markdown':
      let md = '# Columns Export\n\n';
      columns.forEach(col => {
        md += `## ${col.title}\n\n`;
        col.items.forEach(item => {
          md += `### ${item.title}\n${item.content}\n\n`;
        });
      });
      return md;
    default:
      return JSON.stringify({ columns, exportedAt: new Date().toISOString() }, null, 2);
  }
};