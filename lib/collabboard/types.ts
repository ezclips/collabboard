// lib/collabboard/types.ts

/**
 * Position and size information for a padlet
 */
export interface PadletPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Available layout types for canvases
 */
export type LayoutType =
  | 'wall'
  | 'columns'
  | 'kanban'
  | 'gantt'
  | 'scheduler'
  | 'grid'
  | 'table'
  | 'freeform'
  | 'timeline'
  | 'stream'
  | 'map';

/**
 * Canvas configuration interface
 */
export interface CanvasConfig {
  id?: string;
  title: string;
  description?: string;
  layout: LayoutType;
  background_type: 'color' | 'gradient' | 'image';
  background_value: string;
  comments_enabled: boolean;
  reactions_enabled: boolean;
  thumbnail?: string;
}

/**
 * Padlet/content item interface
 */
export interface Padlet {
  id: string;
  board_id: string;
  title: string;
  content: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  created_at: string;
  updated_at: string;
}

/**
 * Board section interface (for columns layout)
 */
export interface BoardSection {
  id: string;
  board_id: string;
  title: string;
  description?: string;
  position: number;
  created_at: string;
  updated_at: string;
}

/**
 * Layout calculation function signature
 */
export type LayoutCalculationFunction = (
  count: number,
  containerWidth: number,
  containerHeight: number,
  existingPositions?: PadletPosition[]
) => PadletPosition[];

/**
 * Layout configuration options
 */
export interface LayoutConfig {
  type: LayoutType;
  containerWidth: number;
  containerHeight: number;
  itemCount: number;
  options?: {
    // Wall layout options
    wallSpacing?: number;
    wallColumns?: number;
    
    // Grid layout options
    gridColumns?: number;
    gridRows?: number;
    
    // Table layout options
    tableColumns?: number;
    tableRowHeight?: number;
    
    // Timeline options
    timelineDirection?: 'horizontal' | 'vertical';
    
    // Stream options
    streamItemHeight?: number;
    streamWidth?: number;
    
    // Map options
    mapCenterX?: number;
    mapCenterY?: number;
    mapRadius?: number;
    
    // Freeform options
    snapToGrid?: boolean;
    gridSize?: number;
  };
}

/**
 * Layout metadata for rendering hints
 */
export interface LayoutMetadata {
  type: LayoutType;
  totalWidth: number;
  totalHeight: number;
  itemWidth: number;
  itemHeight: number;
  padding: number;
  spacing: number;
  supportsResize: boolean;
  supportsDragDrop: boolean;
  supportsCustomPositions: boolean;
}

/**
 * Canvas viewport interface
 */
export interface CanvasViewport {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom: number;
}

/**
 * Drag and drop interface
 */
export interface DragDropContext {
  isDragging: boolean;
  draggedItem?: string;
  dropTarget?: string;
  dragOffset: { x: number; y: number };
}

/**
 * Layout animation interface
 */
export interface LayoutAnimation {
  duration: number;
  easing: 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'linear';
  delay?: number;
}

/**
 * Responsive breakpoints
 */
export interface ResponsiveBreakpoints {
  mobile: number;
  tablet: number;
  desktop: number;
  ultrawide: number;
}

/**
 * Layout validation result
 */
export interface LayoutValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Canvas background configuration
 */
export interface CanvasBackground {
  type: 'color' | 'gradient' | 'image';
  value: string;
  opacity?: number;
  repeat?: 'repeat' | 'no-repeat' | 'repeat-x' | 'repeat-y';
  position?: string;
  size?: 'cover' | 'contain' | 'auto';
}

/**
 * User permissions for canvas
 */
export interface CanvasPermissions {
  canView: boolean;
  canEdit: boolean;
  canComment: boolean;
  canShare: boolean;
  canDelete: boolean;
  isOwner: boolean;
}

/**
 * Canvas statistics
 */
export interface CanvasStats {
  totalPadlets: number;
  totalComments: number;
  totalViews: number;
  lastActivity: string;
  collaborators: number;
}

/**
 * Export configuration
 */
export interface ExportConfig {
  format: 'png' | 'jpg' | 'pdf' | 'svg';
  quality?: number;
  width?: number;
  height?: number;
  includeBackground: boolean;
  includeComments: boolean;
}

// Legacy collabboard page types (used by app/collabboard/** pages)

export interface CanvasSection {
  id: string;
  title: string;
  description: string;
  items?: unknown[];
  position: number;
}

export interface Canvas {
  id: string;
  name: string;
  category: string;
  description?: string;
  sections?: CanvasSection[];
  created_at: string;
  updated_at: string;
}

export interface CreateCanvasRequest {
  name: string;
  category: string;
  description?: string;
  sections?: CanvasSection[];
}

export interface UpdateCanvasRequest {
  name?: string;
  category?: string;
  description?: string;
}

export interface CanvasListResponse {
  canvases: Canvas[];
  total_pages: number;
  total_count?: number;
}

// Utility types
export type Position = Pick<PadletPosition, 'x' | 'y'>;
export type Size = Pick<PadletPosition, 'width' | 'height'>;
export type Bounds = PadletPosition;

// Event types
export type LayoutChangeEvent = {
  from: LayoutType;
  to: LayoutType;
  timestamp: number;
};

export type PadletMoveEvent = {
  padletId: string;
  fromPosition: Position;
  toPosition: Position;
  timestamp: number;
};

export type CanvasResizeEvent = {
  fromSize: Size;
  toSize: Size;
  timestamp: number;
};
