// lib/collabboard/layouts/GridLayout.tsx

import React, { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  MoreVertical,
  Edit2,
  Plus,
  Trash2,
  Grid3X3,
  LayoutGrid
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

export interface GridConfig {
  // Current settings
  newPostsAtTop: boolean;

  // Grid-specific settings
  columns: number;
  rows: number;
  cellAspectRatio: 'square' | '4:3' | '16:9' | 'auto';
  cellSpacing: 'none' | 'tight' | 'normal' | 'loose';
  fitToGrid: boolean;
  autoResize: boolean;
  showGridLines: boolean;
  equalSizing: boolean;

  // Layout behavior
  flowDirection: 'row' | 'column';
  alignment: 'start' | 'center' | 'end' | 'stretch';
  overflowBehavior: 'wrap' | 'scroll' | 'clip';
  responsiveBreakpoints: boolean;

  // Visual settings
  gridBackground: string;
  cellBackground: string;
  borderColor: string;
  borderWidth: number;
  borderRadius: 'none' | 'small' | 'medium' | 'large';
  shadows: boolean;

  // Interaction settings
  allowReordering: boolean;
  snapToGrid: boolean;
  resizableCells: boolean;
  selectMultiple: boolean;

  // Content settings
  showCellNumbers: boolean;
  showCellCoordinates: boolean;
  maxItemsPerCell: number;
  stackingMode: 'single' | 'stack' | 'overlay';

  // Performance settings
  virtualScrolling: boolean;
  lazyLoading: boolean;
  preloadAdjacent: boolean;

  // Access control
  viewPermissions: 'public' | 'restricted' | 'private';
  editPermissions: 'owner' | 'collaborators' | 'anyone';
}

export interface Padlet {
  id: string;
  title: string;
  content: string;
  type?: string;
  metadata?: any;
  file_url?: string;
  file_type?: string;
  file_name?: string;
  file_size?: number;
  thumbnail_url?: string;
  updated_at?: string;
  board_id?: string;
  created_at?: string;
  author_id?: string;
  gridPosition?: { row: number; col: number };
  tags?: string[];
}

export interface ColumnData {
  id: string;
  title: string;
  items: Padlet[];
}

export interface GridPreviewProps {
  columns: ColumnData[];
  config: Partial<GridConfig>;
  onEditItem: (padlet: Padlet, columnId?: string) => void;
  onAddPost: (columnId: string) => void;
  onDeleteItem?: (padletId: string, columnId: string) => void;
}

export interface GridLiveCanvasProps extends GridPreviewProps {
  canvasId: string;
  isEditable: boolean;
  collaborators?: any[];
  onSave?: (padlets: Padlet[]) => void;
}

export interface GridSettingsProps {
  config: GridConfig;
  onChange: (config: Partial<GridConfig>) => void;
  onSave: () => void;
}

// ============================================================================
// POSITIONING CALCULATION FUNCTION
// ============================================================================

/**
 * Grid Layout - Arranges padlets in an equal-sized grid
 * Creates a responsive grid with consistent cell sizes
 */
export function calculateGridPositions(
  count: number,
  canvasWidth: number,
  canvasHeight?: number,
  config: Partial<GridConfig> = {}
): PadletPosition[] {
  if (count === 0) return [];

  const {
    columns: configColumns,
    cellSpacing = 'normal',
    cellAspectRatio = 'square'
  } = config;

  const positions: PadletPosition[] = [];
  const padding = 20;

  // Calculate grid dimensions
  const cols = configColumns || Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);

  // Calculate spacing
  const spacingMap = { none: 0, tight: 8, normal: 16, loose: 24 };
  const spacing = spacingMap[cellSpacing];

  // Calculate cell dimensions
  const availableWidth = canvasWidth - (2 * padding) - ((cols - 1) * spacing);
  const cellWidth = availableWidth / cols;

  let cellHeight = cellWidth; // Default square
  if (cellAspectRatio === '4:3') cellHeight = cellWidth * 0.75;
  else if (cellAspectRatio === '16:9') cellHeight = cellWidth * 0.5625;
  else if (cellAspectRatio === 'auto' && canvasHeight) {
    const availableHeight = canvasHeight - (2 * padding) - ((rows - 1) * spacing);
    cellHeight = availableHeight / rows;
  }

  // Create grid positions
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;

    const x = padding + (col * (cellWidth + spacing));
    const y = padding + (row * (cellHeight + spacing));

    positions.push({
      top: y,
      left: x,
      width: cellWidth,
      height: cellHeight
    });
  }

  return positions;
}

// ============================================================================
// GRID CELL COMPONENT
// ============================================================================

const GridCell: React.FC<{
  padlet: Padlet;
  position: PadletPosition;
  config: Partial<GridConfig>;
  cellIndex: number;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ padlet, position, config, cellIndex, onEdit, onDelete }) => {
  const {
    showCellNumbers = false,
    borderRadius = 'medium',
    shadows = true,
    cellBackground = '#ffffff'
  } = config;

  const getRadiusClass = () => {
    switch (borderRadius) {
      case 'none': return 'rounded-none';
      case 'small': return 'rounded';
      case 'large': return 'rounded-xl';
      default: return 'rounded-lg';
    }
  };

  return (
    <div
      className={`absolute cursor-pointer transition-all duration-200 hover:scale-105 group ${getRadiusClass()} ${shadows ? 'shadow-md hover:shadow-lg' : ''
        }`}
      style={{
        top: position.top,
        left: position.left,
        width: position.width,
        height: position.height,
        backgroundColor: cellBackground
      }}
      onClick={onEdit}
    >
      {/* Cell Border */}
      <div className="w-full h-full border-2 border-gray-200 hover:border-blue-300 p-3 flex flex-col">
        {/* Cell Header */}
        <div className="flex justify-between items-start mb-2">
          {showCellNumbers && (
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
              {cellIndex + 1}
            </span>
          )}

          {/* Actions */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-100"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical size={14} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={onEdit}>
                <Edit2 className="mr-2 h-4 w-4" />
                Edit content
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="text-red-600 focus:text-red-600 focus:bg-red-50"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col justify-center">
          <h4 className="font-semibold text-gray-900 text-center mb-2 line-clamp-2">
            {padlet.title}
          </h4>
          <div className="text-sm text-gray-600 text-center line-clamp-3">
            <PostPreviewCard padlet={padlet as any} />
          </div>
        </div>

        {/* Tags */}
        {padlet.tags && padlet.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2 justify-center">
            {padlet.tags.slice(0, 2).map((tag, i) => (
              <span key={i} className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded-full">
                {tag}
              </span>
            ))}
            {padlet.tags.length > 2 && (
              <span className="text-xs text-gray-400">+{padlet.tags.length - 2}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// GRID PREVIEW COMPONENT (For Canvas Setup)
// ============================================================================

export const GridPreview: React.FC<GridPreviewProps> = ({
  columns,
  config = {},
  onEditItem,
  onAddPost,
  onDeleteItem
}) => {
  const {
    columns: gridCols = 3,
    showGridLines = true,
    newPostsAtTop = false
  } = config;

  // Get all padlets from columns
  const allPadlets = columns.flatMap(col => col.items);
  const displayedPadlets = newPostsAtTop ? [...allPadlets].reverse() : allPadlets;

  if (displayedPadlets.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 text-xl">
        <div className="text-center">
          <Grid3X3 className="h-16 w-16 mx-auto mb-4 opacity-50" />
          <p>Add some content to see the Grid layout preview</p>
        </div>
      </div>
    );
  }

  // Calculate positions
  const positions = calculateGridPositions(
    displayedPadlets.length,
    1200, // Canvas width
    800,  // Canvas height
    config
  );

  return (
    <div className="relative w-full min-h-[600px] p-4 bg-gray-50 rounded-lg border overflow-auto">
      <div className="relative bg-white rounded-lg" style={{ width: '1200px', height: '800px' }}>
        {/* Grid Lines */}
        {showGridLines && (
          <div className="absolute inset-0 pointer-events-none">
            {/* Vertical lines */}
            {Array.from({ length: gridCols + 1 }).map((_, i) => (
              <div
                key={`v-${i}`}
                className="absolute top-0 bottom-0 w-px bg-gray-200"
                style={{ left: 20 + (i * (1160 / gridCols)) }}
              />
            ))}
            {/* Horizontal lines */}
            {Array.from({ length: Math.ceil(displayedPadlets.length / gridCols) + 1 }).map((_, i) => (
              <div
                key={`h-${i}`}
                className="absolute left-0 right-0 h-px bg-gray-200"
                style={{ top: 20 + (i * 200) }} // Approximate row height
              />
            ))}
          </div>
        )}

        {/* Grid Items */}
        {displayedPadlets.map((padlet, index) => {
          const position = positions[index];
          if (!position) return null;

          return (
            <GridCell
              key={padlet.id}
              padlet={padlet}
              position={position}
              config={config}
              cellIndex={index}
              onEdit={() => {
                const sourceColumn = columns.find(col =>
                  col.items.some(item => item.id === padlet.id)
                );
                onEditItem(padlet, sourceColumn?.id);
              }}
              onDelete={() => {
                if (window.confirm(`Delete "${padlet.title}"?`)) {
                  const sourceColumn = columns.find(col =>
                    col.items.some(item => item.id === padlet.id)
                  );
                  if (sourceColumn && onDeleteItem) {
                    onDeleteItem(padlet.id, sourceColumn.id);
                  }
                }
              }}
            />
          );
        })}

        {/* Add New Item Button */}
        <div
          className="absolute flex items-center justify-center border-2 border-dashed border-gray-300 hover:border-blue-400 rounded-lg cursor-pointer bg-gray-50 hover:bg-blue-50 transition-colors"
          style={{
            top: positions[displayedPadlets.length]?.top || 20,
            left: positions[displayedPadlets.length]?.left || 20,
            width: positions[0]?.width || 200,
            height: positions[0]?.height || 200
          }}
          onClick={() => {
            if (columns.length > 0) {
              onAddPost(columns[0].id);
            }
          }}
        >
          <div className="text-center text-gray-500 hover:text-blue-600">
            <Plus className="h-8 w-8 mx-auto mb-2" />
            <p className="text-sm font-medium">Add Item</p>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// GRID LIVE CANVAS COMPONENT (Future Implementation)
// ============================================================================

export const GridLiveCanvas: React.FC<GridLiveCanvasProps> = ({
  canvasId,
  isEditable,
  columns,
  config = {},
  collaborators = [],
  onEditItem,
  onAddPost,
  onDeleteItem,
  onSave
}) => {
  // TODO: Implement live canvas functionality
  return (
    <div className="relative w-full h-full">
      <div className="flex items-center justify-center h-64 text-gray-500">
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-2">Grid Live Canvas</h3>
          <p>Canvas ID: {canvasId}</p>
          <p>Editable: {isEditable ? 'Yes' : 'No'}</p>
          <p>Collaborators: {collaborators.length}</p>
          <p className="text-sm text-gray-400 mt-2">Coming soon...</p>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// GRID SETTINGS COMPONENT (Future Implementation)
// ============================================================================

export const GridSettings: React.FC<GridSettingsProps> = ({
  config,
  onChange,
  onSave
}) => {
  return (
    <div className="space-y-6 p-4">
      <h3 className="text-lg font-semibold">Grid Settings</h3>

      <div className="text-gray-500">
        <p>Grid-specific settings will include:</p>
        <ul className="list-disc ml-6 mt-2 space-y-1">
          <li>Grid dimensions (columns/rows)</li>
          <li>Cell aspect ratio and sizing</li>
          <li>Spacing and alignment options</li>
          <li>Grid lines and visual guides</li>
          <li>Responsive breakpoints</li>
          <li>Content stacking and overflow</li>
          <li>Interactive behaviors</li>
        </ul>
        <p className="text-sm mt-4">Coming soon...</p>
      </div>
    </div>
  );
};

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const defaultGridConfig: GridConfig = {
  // Current settings
  newPostsAtTop: false,

  // Grid layout
  columns: 3,
  rows: 3,
  cellAspectRatio: 'square',
  cellSpacing: 'normal',
  fitToGrid: true,
  autoResize: true,
  showGridLines: true,
  equalSizing: true,

  // Layout behavior
  flowDirection: 'row',
  alignment: 'start',
  overflowBehavior: 'wrap',
  responsiveBreakpoints: true,

  // Visual settings
  gridBackground: '#f8fafc',
  cellBackground: '#ffffff',
  borderColor: '#e2e8f0',
  borderWidth: 1,
  borderRadius: 'medium',
  shadows: true,

  // Interaction
  allowReordering: true,
  snapToGrid: true,
  resizableCells: false,
  selectMultiple: true,

  // Content
  showCellNumbers: false,
  showCellCoordinates: false,
  maxItemsPerCell: 1,
  stackingMode: 'single',

  // Performance
  virtualScrolling: false,
  lazyLoading: false,
  preloadAdjacent: true,

  // Access control
  viewPermissions: 'public',
  editPermissions: 'collaborators'
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export const calculateOptimalGridSize = (itemCount: number): { columns: number; rows: number } => {
  const cols = Math.ceil(Math.sqrt(itemCount));
  const rows = Math.ceil(itemCount / cols);
  return { columns: cols, rows };
};

export const validateGridConfig = (config: Partial<GridConfig>): boolean => {
  if (config.columns && config.columns < 1) return false;
  if (config.rows && config.rows < 1) return false;
  return true;
};

export const getGridCoordinates = (index: number, columns: number): { row: number; col: number } => {
  return {
    row: Math.floor(index / columns),
    col: index % columns
  };
};

export const getGridIndex = (row: number, col: number, columns: number): number => {
  return row * columns + col;
};