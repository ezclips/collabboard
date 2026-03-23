// types/collabboard.ts

import type { LoadedAIContent } from '@/lib/ai/contracts';

export type ChronoMode =
  | 'VERTICAL'
  | 'HORIZONTAL'
  | 'VERTICAL_ALTERNATING'
  | 'HORIZONTAL_ALL'
  | 'vertical'
  | 'horizontal'
  | 'alternating'
  | 'horizontal-all';

// Structured JSON schema returned by AI generation (JSON architecture)
export type LessonBoardItem = {
  type: 'text' | 'list' | 'task';
  content: string;
  bullets?: string[];
  duration?: string;
};

export type LessonBoardSection = {
  title: string;
  items: LessonBoardItem[];
};

export type LessonBoard = {
  version: 1;
  type: 'lesson_board';
  title: string;
  description?: string;
  heroImage?: {
    query: string;
    url?: string | null;
    storagePath?: string | null;
  };
  sections: LessonBoardSection[];
};

export type StoredAIImageAsset = {
  id: string;
  query: string;
  placeholder: string;
  originalUrl: string | null;
  storagePath: string | null;
  publicUrl: string | null;
  source: 'unsplash' | 'fallback';
  status: 'stored' | 'unresolved' | 'failed';
  mimeType: string | null;
  width: number | null;
  height: number | null;
  authorName: string | null;
  authorLink: string | null;
};

export type SavedAIComponent = {
  id: string;
  code: string;
  assets: {
    images: {
      query: string;
      placeholder?: string;
      url: string | null;
      source: string | null;
      author?: string | null;
      authorLink?: string | null;
    }[];
  };
};

export interface Canvas {
  id: string;
  title: string;
  description?: string;
  layout: LayoutType;
  background_type?: 'color' | 'gradient' | 'image';
  background_value?: string;
  container_size?: 'small' | 'medium' | 'large';
  settings?: {
    chronoMode?: ChronoMode;
    [key: string]: any;
  };
  created_at: string;
  updated_at: string;
}

export interface Padlet {
  id: string;
  board_id: string;
  title: string;
  content: string;
  type: 'text' | 'image' | 'file' | 'table' | 'link' | 'todo' | 'container' | 'comment' | 'drawing' | 'card' | 'note' | 'ai-component';
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  file_url?: string;
  file_name?: string;
  file_type?: string;
  file_size?: number;
  image_url?: string;
  created_at: string;
  updated_at: string;
  is_pinned?: boolean;
  likes_count?: number;
  metadata?: {
    // Scheduler-specific metadata
    start_date?: string;
    end_date?: string;
    // Link-specific metadata
    linkUrl?: string;
    linkTitle?: string;
    linkDescription?: string;
    linkImage?: string;
    linkFavicon?: string;
    linkDomain?: string;
    linkCaption?: string;
    linkCaptionColor?: string;
    displayMode?: 'both' | 'image-only' | 'info-only';
    // Todo-specific metadata
    todoTitle?: string;
    completed?: boolean;
    tasks?: Array<{
      id: string;
      text: string;
      completed: boolean;
      dueDate?: string;
      assignee?: string;
      color?: string;
    }>;
    // Card styling
    detachedComments?: Array<{
      id: string;
      text: string;
      userId: string;
      userName: string;
      timestamp: number;
    }>;
    // Link comments (with color)
    comments?: Array<{
      id: string;
      text: string;
      userId: string;
      userName: string;
      timestamp: number;
      color?: string;
      textColor?: string;
      backgroundColor?: string;
      isStrikethrough?: boolean;
    }>;
    cardColor?: string;
    topStrip?: string;
    textColor?: string;
    reactions?: string[];
    badgeColor?: string;
    isCollapsed?: boolean;
    // Image-specific
    imageUrl?: string;
    caption?: string; // Shared with linkCaption but useful to have explicit
    photographer?: string;
    photographerUrl?: string;
    source?: 'pexels' | 'upload' | 'import';
    drawing?: string; // Data URL of the drawing layer
    drawingPaths?: any[];
    drawingText?: any[];
    captionStyle?: {
      color?: string;
      backgroundColor?: string;
      fontSize?: string;
      fontWeight?: string;
      fontStyle?: string;
      fontFamily?: string;
      lineHeight?: string;
      heading?: string;
    };

    // Container-specific
    childPadletIds?: string[];
    // Hierarchy
    parentId?: string;
    containerIndex?: number;

    // Drawing-specific (Excalidraw)
    drawingData?: string; // JSON serialized elements
    drawingAppState?: string; // JSON serialized app state
    drawingFiles?: string; // JSON serialized binary files
    previewUrl?: string; // SVG data URL

    // Card-specific
    svgUrl?: string;
    iconColor?: string;
    iconBgColor?: string;
    topStripColor?: string;
    showCardView?: boolean;
    counterType?: 'cards' | 'words';
    backgroundColor?: string;



    // Columns Layout specific
    sectionId?: string;
    sectionPosition?: number;
    fileUrl?: string;
    isLocked?: boolean;
    tableValues?: Record<string, any>;
    // Timeline specific
    position_in_timeline?: number;
    // Freeform graph specific
    freeformLayer?: number;
    isFocusNode?: boolean;

    // AI Component specific
    aiComponentCode?: string;
    aiPrompt?: string;
    aiRawCode?: string;
    aiAssets?: {
      images?: Array<{
        query: string;
        placeholder?: string;
        url: string | null;
        status: 'resolved' | 'unresolved';
        source: string | null;
        author?: string | null;
        authorLink?: string | null;
      }>;
    };
    aiAssetManifest?: StoredAIImageAsset[];
    aiComponentJson?: LoadedAIContent;
    savedAIComponent?: SavedAIComponent;
    kind?: string;
    isContainer?: boolean;
    zIndex?: number;
    commentTitle?: string;
    // Cloud Import specific
    importProvider?: 'google-drive' | 'microsoft-onedrive';
    importItemId?: string;
    importOpenUrl?: string;
    importMimeType?: string;
    importFileName?: string;
    importKind?: 'image' | 'document';
    importSizeBytes?: number;
    file_url?: string;
    // Runtime guard ensures strict payload
  };
}

export type LayoutType = 'wall' | 'columns' | 'kanban' | 'gantt' | 'scheduler' | 'grid' | 'table' | 'freeform' | 'timeline' | 'stream' | 'map' | 'drawing';
export interface LayoutSettings {
  columns?: number;
  spacing?: number;
  direction?: 'horizontal' | 'vertical';
}

// Keep BoardSection for backwards compatibility
export interface BoardSection {
  id: number;
  board_id: number;
  title: string;
  description: string;
  position: number;
  created_at: string;
  updated_at: string;
}

// Line connector between posts
export interface CanvasLine {
  id: string;
  board_id: string;
  // Legacy control points
  start_x: number;
  start_y: number;
  control_x: number;
  control_y: number;
  end_x: number;
  end_y: number;
  // NEW: Multi-point path (takes precedence if exists)
  points?: Array<{
    x: number;
    y: number;
    type: 'corner' | 'smooth';
  }>;
  // Attachments (optional - when connected to posts)
  start_post_id?: string;
  end_post_id?: string;
  // Styling
  color: string; // default: '#374151' (gray-700)
  stroke_width: number; // default: 2
  z_index?: number; // Layer order (higher = on top), default: 0
  start_arrow: boolean; // default: false
  end_arrow: boolean; // default: true
  dashed: boolean; // default: false
  label?: string;
  label_position?: number; // 0-1 position along the curve, default: 0.5 (middle)
  label_text_color?: string;
  label_background_color?: string;
  // Timestamps
  created_at: string;
  updated_at: string;
}

// Types for Column Layout Post Placement
export type PendingPostDraft = {
  kind: 'note' | 'todo' | 'link' | 'table' | 'image' | 'comment' | 'drawing' | 'card' | 'ai-component';
  title?: string;
  content: any;
  file_url?: string;
  metadata?: Record<string, any>;
  width?: number;
  height?: number;
  createdAt: number;
};

export type NewPostDragState = {
  isActive: boolean;
  draft: PendingPostDraft | null;
  cursor: { x: number; y: number };
  grabOffset: { x: number; y: number };
};

export type ColumnDragPayload =
  | { kind: "container"; id: string; fromSectionId: string }
  | { kind: "post"; id: string; fromSectionId: string };

export type DropIndicatorState = {
  sectionId: string | null;
  index: number | null;
};

export type Board = Canvas;
