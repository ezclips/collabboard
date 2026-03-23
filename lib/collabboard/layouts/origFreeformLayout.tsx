// lib/collabboard/layouts/FreeformLayout.tsx

import React, { useState, useRef, useCallback } from 'react';
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
  Move,
  RotateCw,
  Maximize2,
  Copy,
  MousePointer
} from "lucide-react";
import SafeHtmlContent from "@/components/collabboard/SafeHtmlContent";

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface PadletPosition {
  top: number;
  left: number;
  width: number;
  height: number;
  rotation?: number;
  zIndex?: number;
}

export interface FreeformConfig {
  // Current settings
  newPostsAtTop: boolean;

  // Freeform-specific settings
  enableDragDrop: boolean;
  enableResize: boolean;
  enableRotation: boolean;
  snapToGrid: boolean;
  gridSize: number;
  showGrid: boolean;
  showRulers: boolean;
  enableZOrdering: boolean;

  // Canvas settings
  canvasBackground: string;
  canvasWidth: number;
  canvasHeight: number;
  infiniteCanvas: boolean;
  panAndZoom: boolean;

  // Default item properties
  defaultWidth: number;
  defaultHeight: number;
  defaultBackground: string;
  defaultTextColor: string;
  minItemSize: number;
  maxItemSize: number;

  // Visual settings
  selectionColor: string;
  borderRadius: 'none' | 'small' | 'medium' | 'large';
  shadows: boolean;
  showHandles: boolean;

  // Interaction modes
  selectionMode: 'single' | 'multiple';
  editMode: 'click' | 'doubleClick';
  dragMode: 'immediate' | 'handle';
  resizeMode: 'corners' | 'edges' | 'both';

  // Collaboration settings
  showUserCursors: boolean;
  showLiveEditing: boolean;
  conflictResolution: 'lastWriter' | 'merge' | 'lock';

  // Performance settings
  renderOptimization: boolean;
  cullingEnabled: boolean;
  lazyLoading: boolean;

  // Access control
  viewPermissions: 'public' | 'restricted' | 'private';
  editPermissions: 'owner' | 'collaborators' | 'anyone';
  lockItems: boolean;
}

export interface Padlet {
  id: string;
  title: string;
  content: string;
  board_id?: string;
  created_at?: string;
  author_id?: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  rotation?: number;
  z_index?: number;
  background_color?: string;
  text_color?: string;
  locked?: boolean;
  tags?: string[];
}

export interface ColumnData {
  id: string;
  title: string;
  items: Padlet[];
}

export interface FreeformPreviewProps {
  columns: ColumnData[];
  config: Partial<FreeformConfig>;
  onEditItem: (padlet: Padlet, columnId?: string) => void;
  onAddPost: (columnId: string) => void;
  onDeleteItem?: (padletId: string, columnId: string) => void;
  onUpdatePosition?: (padletId: string, position: Partial<Padlet>) => void;
}

export interface FreeformLiveCanvasProps extends FreeformPreviewProps {
  canvasId: string;
  isEditable: boolean;
  collaborators?: any[];
  onSave?: (padlets: Padlet[]) => void;
}

export interface FreeformSettingsProps {
  config: FreeformConfig;
  onChange: (config: Partial<FreeformConfig>) => void;
  onSave: () => void;
}

// ============================================================================
// POSITIONING CALCULATION FUNCTION
// ============================================================================

/**
 * Freeform Layout - Allows completely free positioning of padlets
 * Preserves exact positions as stored in the database
 */
export function calculateFreeformPositions(
  padlets: Padlet[],
  canvasWidth: number,
  canvasHeight?: number,
  config: Partial<FreeformConfig> = {}
): PadletPosition[] {
  // Freeform layout preserves exact positions from the database
  return padlets.map(padlet => ({
    top: padlet.position_y,
    left: padlet.position_x,
    width: padlet.width,
    height: padlet.height,
    rotation: padlet.rotation || 0,
    zIndex: padlet.z_index || 1
  }));
}

/**
 * Generate random positions for new items (when no position specified)
 */
export function generateRandomPosition(
  canvasWidth: number,
  canvasHeight: number,
  config: Partial<FreeformConfig> = {}
): { x: number; y: number } {
  const { defaultWidth = 200, defaultHeight = 150 } = config;
  const padding = 40;

  const maxX = canvasWidth - defaultWidth - padding;
  const maxY = canvasHeight - defaultHeight - padding;

  return {
    x: padding + Math.random() * Math.max(0, maxX),
    y: padding + Math.random() * Math.max(0, maxY)
  };
}

// ============================================================================
// DRAGGABLE PADLET COMPONENT
// ============================================================================

const DraggablePadlet: React.FC<{
  padlet: Padlet;
  config: Partial<FreeformConfig>;
  isSelected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onUpdatePosition: (updates: Partial<Padlet>) => void;
}> = ({ padlet, config, isSelected, onSelect, onEdit, onDelete, onUpdatePosition }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const elementRef = useRef<HTMLDivElement>(null);

  const {
    enableDragDrop = true,
    enableResize = true,
    snapToGrid = false,
    gridSize = 20,
    borderRadius = 'medium',
    shadows = true,
    showHandles = true
  } = config;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!enableDragDrop) return;

    e.preventDefault();
    e.stopPropagation();

    onSelect();
    setIsDragging(true);
    setDragStart({
      x: e.clientX - padlet.position_x,
      y: e.clientY - padlet.position_y
    });
  }, [enableDragDrop, onSelect, padlet.position_x, padlet.position_y]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;

    let newX = e.clientX - dragStart.x;
    let newY = e.clientY - dragStart.y;

    // Snap to grid if enabled
    if (snapToGrid) {
      newX = Math.round(newX / gridSize) * gridSize;
      newY = Math.round(newY / gridSize) * gridSize;
    }

    // Boundary constraints
    newX = Math.max(0, Math.min(newX, 1200 - padlet.width));
    newY = Math.max(0, Math.min(newY, 800 - padlet.height));

    onUpdatePosition({
      position_x: newX,
      position_y: newY
    });
  }, [isDragging, dragStart, snapToGrid, gridSize, padlet.width, padlet.height, onUpdatePosition]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(false);
  }, []);

  // Attach global mouse events
  React.useEffect(() => {
    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, isResizing, handleMouseMove, handleMouseUp]);

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
      ref={elementRef}
      className={`absolute cursor-pointer transition-all duration-200 group ${getRadiusClass()} ${shadows ? 'shadow-md hover:shadow-lg' : ''
        } ${isSelected ? 'ring-2 ring-blue-500 z-50' : 'hover:scale-105'} ${isDragging ? 'cursor-grabbing z-50' : 'cursor-grab'
        }`}
      style={{
        left: padlet.position_x,
        top: padlet.position_y,
        width: padlet.width,
        height: padlet.height,
        backgroundColor: padlet.background_color || '#ffffff',
        color: padlet.text_color || '#000000',
        transform: padlet.rotation ? `rotate(${padlet.rotation}deg)` : undefined,
        zIndex: padlet.z_index || 1
      }}
      onMouseDown={handleMouseDown}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onEdit();
      }}
    >
      {/* Content */}
      <div className="w-full h-full p-3 flex flex-col border border-gray-200 hover:border-blue-300">
        <div className="flex justify-between items-start mb-2">
          <h4 className="font-semibold text-sm leading-tight flex-1">{padlet.title}</h4>

          {/* Actions Menu */}
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
              <DropdownMenuItem onClick={() => {
                const newPos = generateRandomPosition(1200, 800, config);
                onUpdatePosition({ position_x: newPos.x, position_y: newPos.y });
              }}>
                <Move className="mr-2 h-4 w-4" />
                Random position
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                onUpdatePosition({
                  rotation: (padlet.rotation || 0) + 15
                });
              }}>
                <RotateCw className="mr-2 h-4 w-4" />
                Rotate 15°
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                onUpdatePosition({
                  width: padlet.width + 20,
                  height: padlet.height + 15
                });
              }}>
                <Maximize2 className="mr-2 h-4 w-4" />
                Increase size
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => {
                // Duplicate functionality
                const newPos = generateRandomPosition(1200, 800, config);
                const newPadlet = {
                  ...padlet,
                  id: `${padlet.id}_copy_${Date.now()}`,
                  title: `${padlet.title} (Copy)`,
                  position_x: newPos.x,
                  position_y: newPos.y
                };
                // TODO: Implement copy functionality
              }}>
                <Copy className="mr-2 h-4 w-4" />
                Duplicate
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

        <SafeHtmlContent
          content={padlet.content}
          className="text-xs flex-1 overflow-hidden leading-relaxed"
          lineClamp={4}
        />

        {/* Tags */}
        {padlet.tags && padlet.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {padlet.tags.slice(0, 2).map((tag, i) => (
              <span key={i} className="text-xs bg-blue-100 text-blue-600 px-1 py-0.5 rounded">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Selection Handles */}
      {isSelected && showHandles && enableResize && (
        <>
          {/* Corner handles */}
          <div className="absolute -top-1 -left-1 w-3 h-3 bg-blue-500 border border-white rounded-full cursor-nw-resize" />
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 border border-white rounded-full cursor-ne-resize" />
          <div className="absolute -bottom-1 -left-1 w-3 h-3 bg-blue-500 border border-white rounded-full cursor-sw-resize" />
          <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-blue-500 border border-white rounded-full cursor-se-resize" />
        </>
      )}

      {/* Drag handle indicator */}
      {isDragging && (
        <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-2 py-1 rounded text-xs">
          {Math.round(padlet.position_x)}, {Math.round(padlet.position_y)}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// FREEFORM PREVIEW COMPONENT (For Canvas Setup)
// ============================================================================

export const FreeformPreview: React.FC<FreeformPreviewProps> = ({
  columns,
  config = {},
  onEditItem,
  onAddPost,
  onDeleteItem,
  onUpdatePosition
}) => {
  const [selectedPadlet, setSelectedPadlet] = useState<string | null>(null);
  const { showGrid = false, gridSize = 20 } = config;

  // Get all padlets from columns with positions
  const allPadlets = columns.flatMap(col => col.items);

  // Generate positions for items that don't have them
  const padletsWithPositions = allPadlets.map(padlet => {
    if (padlet.position_x === undefined || padlet.position_y === undefined) {
      const randomPos = generateRandomPosition(1200, 800, config);
      return {
        ...padlet,
        position_x: randomPos.x,
        position_y: randomPos.y,
        width: padlet.width || config.defaultWidth || 200,
        height: padlet.height || config.defaultHeight || 150
      };
    }
    return padlet;
  });

  if (padletsWithPositions.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 text-xl">
        <div className="text-center">
          <MousePointer className="h-16 w-16 mx-auto mb-4 opacity-50" />
          <p>Add some content to see the Freeform layout preview</p>
          <p className="text-sm mt-2">Items can be positioned anywhere on the canvas</p>
        </div>
      </div>
    );
  }

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      setSelectedPadlet(null);
    }
  };

  const handleAddPadlet = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && columns.length > 0) {
      // Add new padlet at click position
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left - 100; // Offset for padlet center
      const y = e.clientY - rect.top - 75;

      // TODO: Store click position for new padlet creation
      onAddPost(columns[0].id);
    }
  };

  return (
    <div className="relative w-full min-h-[600px] p-4 bg-gray-50 rounded-lg border overflow-auto">
      <div
        className="relative bg-white rounded-lg cursor-default"
        style={{ width: '1200px', height: '800px' }}
        onClick={handleCanvasClick}
        onDoubleClick={handleAddPadlet}
      >
        {/* Grid Background */}
        {showGrid && (
          <div className="absolute inset-0 pointer-events-none opacity-30">
            <svg width="100%" height="100%">
              <defs>
                <pattern
                  id="grid"
                  width={gridSize}
                  height={gridSize}
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`}
                    fill="none"
                    stroke="#e5e7eb"
                    strokeWidth="1"
                  />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>
          </div>
        )}

        {/* Freeform Padlets */}
        {padletsWithPositions.map((padlet) => (
          <DraggablePadlet
            key={padlet.id}
            padlet={padlet}
            config={config}
            isSelected={selectedPadlet === padlet.id}
            onSelect={() => setSelectedPadlet(padlet.id)}
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
            onUpdatePosition={(updates) => {
              if (onUpdatePosition) {
                onUpdatePosition(padlet.id, updates);
              }
            }}
          />
        ))}

        {/* Instructions */}
        <div className="absolute top-4 left-4 bg-blue-50 border border-blue-200 rounded-lg p-3 max-w-xs">
          <h4 className="font-medium text-blue-900 mb-1">Freeform Canvas</h4>
          <ul className="text-xs text-blue-700 space-y-1">
            <li>• Drag items to move them anywhere</li>
            <li>• Double-click empty area to add new item</li>
            <li>• Click item to select and see options</li>
            <li>• Double-click item to edit content</li>
          </ul>
        </div>

        {/* Selection Info */}
        {selectedPadlet && (
          <div className="absolute top-4 right-4 bg-white border border-gray-200 rounded-lg p-3 shadow-lg">
            <h4 className="font-medium text-gray-900 mb-2">Selected Item</h4>
            {(() => {
              const padlet = padletsWithPositions.find(p => p.id === selectedPadlet);
              if (!padlet) return null;
              return (
                <div className="text-xs text-gray-600 space-y-1">
                  <div>Position: {Math.round(padlet.position_x)}, {Math.round(padlet.position_y)}</div>
                  <div>Size: {padlet.width} × {padlet.height}</div>
                  {padlet.rotation && <div>Rotation: {padlet.rotation}°</div>}
                  <div>Z-Index: {padlet.z_index || 1}</div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// FREEFORM LIVE CANVAS COMPONENT (Future Implementation)
// ============================================================================

export const FreeformLiveCanvas: React.FC<FreeformLiveCanvasProps> = ({
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
          <h3 className="text-lg font-semibold mb-2">Freeform Live Canvas</h3>
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
// FREEFORM SETTINGS COMPONENT (Future Implementation)
// ============================================================================

export const FreeformSettings: React.FC<FreeformSettingsProps> = ({
  config,
  onChange,
  onSave
}) => {
  return (
    <div className="space-y-6 p-4">
      <h3 className="text-lg font-semibold">Freeform Settings</h3>

      <div className="text-gray-500">
        <p>Freeform-specific settings will include:</p>
        <ul className="list-disc ml-6 mt-2 space-y-1">
          <li>Drag and drop behavior</li>
          <li>Grid snapping and visual guides</li>
          <li>Canvas dimensions and boundaries</li>
          <li>Item sizing and rotation controls</li>
          <li>Selection and editing modes</li>
          <li>Collaboration and conflict resolution</li>
          <li>Performance optimizations</li>
        </ul>
        <p className="text-sm mt-4">Coming soon...</p>
      </div>
    </div>
  );
};

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

export const defaultFreeformConfig: FreeformConfig = {
  // Current settings
  newPostsAtTop: false,

  // Freeform interaction
  enableDragDrop: true,
  enableResize: true,
  enableRotation: true,
  snapToGrid: false,
  gridSize: 20,
  showGrid: false,
  showRulers: false,
  enableZOrdering: true,

  // Canvas settings
  canvasBackground: '#ffffff',
  canvasWidth: 1200,
  canvasHeight: 800,
  infiniteCanvas: false,
  panAndZoom: false,

  // Default item properties
  defaultWidth: 200,
  defaultHeight: 150,
  defaultBackground: '#ffffff',
  defaultTextColor: '#000000',
  minItemSize: 50,
  maxItemSize: 500,

  // Visual settings
  selectionColor: '#3b82f6',
  borderRadius: 'medium',
  shadows: true,
  showHandles: true,

  // Interaction modes
  selectionMode: 'single',
  editMode: 'doubleClick',
  dragMode: 'immediate',
  resizeMode: 'corners',

  // Collaboration settings
  showUserCursors: false,
  showLiveEditing: false,
  conflictResolution: 'lastWriter',

  // Performance settings
  renderOptimization: true,
  cullingEnabled: false,
  lazyLoading: false,

  // Access control
  viewPermissions: 'public',
  editPermissions: 'collaborators',
  lockItems: false
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export const snapToGrid = (
  value: number,
  gridSize: number
): number => {
  return Math.round(value / gridSize) * gridSize;
};

export const constrainToBounds = (
  x: number,
  y: number,
  width: number,
  height: number,
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number } => {
  return {
    x: Math.max(0, Math.min(x, canvasWidth - width)),
    y: Math.max(0, Math.min(y, canvasHeight - height))
  };
};

export const detectCollision = (
  item1: { x: number; y: number; width: number; height: number },
  item2: { x: number; y: number; width: number; height: number }
): boolean => {
  return !(
    item1.x + item1.width < item2.x ||
    item2.x + item2.width < item1.x ||
    item1.y + item1.height < item2.y ||
    item2.y + item2.height < item1.y
  );
};

export const findEmptySpace = (
  existingItems: Array<{ x: number; y: number; width: number; height: number }>,
  newItemWidth: number,
  newItemHeight: number,
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number } | null => {
  const gridSize = 20;

  for (let y = 0; y <= canvasHeight - newItemHeight; y += gridSize) {
    for (let x = 0; x <= canvasWidth - newItemWidth; x += gridSize) {
      const newItem = { x, y, width: newItemWidth, height: newItemHeight };

      const hasCollision = existingItems.some(item =>
        detectCollision(newItem, item)
      );

      if (!hasCollision) {
        return { x, y };
      }
    }
  }

  return null; // No empty space found
};

export const optimizeLayout = (
  items: Padlet[],
  canvasWidth: number,
  canvasHeight: number
): Padlet[] => {
  // Basic layout optimization - prevents overlapping
  const optimized = [...items];

  optimized.forEach((item, index) => {
    const others = optimized.filter((_, i) => i !== index);

    while (others.some(other => detectCollision(
      { x: item.position_x, y: item.position_y, width: item.width, height: item.height },
      { x: other.position_x, y: other.position_y, width: other.width, height: other.height }
    ))) {
      // Move item slightly to resolve collision
      item.position_x += 20;
      if (item.position_x + item.width > canvasWidth) {
        item.position_x = 0;
        item.position_y += 20;
      }
      if (item.position_y + item.height > canvasHeight) {
        item.position_y = 0;
      }
    }
  });

  return optimized;
};

export const validateFreeformConfig = (config: Partial<FreeformConfig>): boolean => {
  if (config.gridSize && config.gridSize < 5) return false;
  if (config.defaultWidth && config.defaultWidth < 50) return false;
  if (config.defaultHeight && config.defaultHeight < 50) return false;
  return true;
};