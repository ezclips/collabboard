// types/collabboard.ts

import type { LoadedAIContent } from '@/lib/ai/contracts';
import type { KnowledgeSourceReferenceDraft } from '@/lib/domain/knowledge/knowledgeSourceNoteDraft';

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
  metadata?: {
    showDotGrid?: boolean;
    [key: string]: any;
  };
  container_size?: 'small' | 'medium' | 'large';
  settings?: {
    chronoMode?: ChronoMode;
    [key: string]: any;
  };
  created_at: string;
  updated_at: string;
}

export type ContainerOrientation = 'vertical' | 'horizontal';

export interface Padlet {
  id: string;
  board_id: string;
  title: string;
  content: string;
  type: 'text' | 'image' | 'file' | 'table' | 'link' | 'todo' | 'container' | 'comment' | 'drawing' | 'card' | 'note' | 'ai-component' | 'section_heading';
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
    isAllDay?: boolean;
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
    // PATCH POST-RESIZE-B1.1: true only once the user has explicitly resized
    // this post through the shared PostResizeHandle. Legacy Image posts carry
    // generic stored width/height from their original creation path (e.g.
    // 300x200, 280x350, 300x400 template defaults) that were never rendered
    // from -- pre-B1 always rendered Images at a fixed 360px presentation --
    // so finite positive width/height alone is NOT proof of intentional
    // sizing. Missing/false means "render the legacy presentation"; true
    // means "canonical width/height are authoritative." See
    // lib/domain/canvas/postResizePolicy.ts#isImageManuallySized.
    manualSize?: boolean;
    captionStyle?: {
      color?: string;
      backgroundColor?: string;
      fontSize?: string;
      fontWeight?: string;
      fontStyle?: string;
      fontFamily?: string;
      lineHeight?: string;
      heading?: string;
      underline?: boolean;
      strikethrough?: boolean;
      textAlign?: 'left' | 'center' | 'right';
    };
    // Image post's own title -- independent of captionStyle above so
    // formatting the title never bleeds into the caption or vice versa.
    titleStyle?: {
      color?: string;
      backgroundColor?: string;
      fontSize?: string;
      fontWeight?: string;
      fontStyle?: string;
      fontFamily?: string;
      lineHeight?: string;
      heading?: string;
      underline?: boolean;
      strikethrough?: boolean;
      textAlign?: 'left' | 'center' | 'right';
    };

    // Container-specific
    childPadletIds?: string[];
    orientation?: ContainerOrientation;
    coverChildId?: string;
    coverPadletId?: string;
    coverChildPadletId?: string;
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

    // Section Heading specific (PATCH SECTION-H1). The heading's own text
    // lives in the post's canonical `title`; only the semantic level needs
    // its own field. Surface/accent/text COLOURS deliberately reuse the
    // existing generic metadata above rather than adding new columns --
    // SECTION-H2 wires the controls to them.
    headingLevel?: 1 | 2 | 3 | 4;
    // PATCH SECTION-H2 Phase 29: the left accent stripe's colour -- the ONE
    // field SECTION-H2 adds. Text colour, surface colour and whole-heading
    // typography deliberately reuse the existing generic `textColor`,
    // `backgroundColor` and `titleStyle` above instead of minting parallel
    // section-heading-only keys. JSONB only; no schema column.
    accentColor?: string;

    // PDF-C1: a canvas PLACEMENT of a Knowledge document, never the document
    // itself. The board post is a reference -- deleting it removes only this
    // placement, and the knowledge_documents row, its pages, chunks and
    // source references all survive. Identity is the document id: filenames
    // are not unique and are display text only. Nothing derived or secret is
    // stored here (no storage_path, no signed URL, no page text, no chunks).
    knowledgeDocumentId?: string;
    knowledgeOriginalFilename?: string;
    knowledgeProcessingStatus?: 'uploaded' | 'processing' | 'ready' | 'failed';
    /**
     * Presentation only. 'expanded' is deliberately declared but unused in
     * PDF-C1 so adding it later is a rendering change, not a change to how a
     * placement identifies its document.
     */
    knowledgeDisplayMode?: 'compact' | 'preview' | 'expanded';

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
    commentTitleStyle?: {
      color?: string;
      backgroundColor?: string;
    };
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
  // Absent/null rows use the legacy viewport-layer coordinate system.
  coord_space?: 'scene' | null;
  // NEW: Multi-point path (takes precedence if exists)
  points?: Array<{
    x: number;
    y: number;
    type: 'corner' | 'smooth';
    // Geographic anchors — populated in map layout so lines reproject on pan/zoom
    lng?: number;
    lat?: number;
  }>;
  // Attachments (optional - when connected to posts)
  start_post_id?: string;
  end_post_id?: string;
  // Styling
  color: string; // default: '#374151' (gray-700)
  stroke_width: number; // default: 2
  z_index?: number; // Layer order within the plane (higher = on top), default: 0
  layer_plane: 'back' | 'front'; // Global plane: 'front' renders above padlets, 'back' renders behind them
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
  // 'file' (PDF-C1 R1-A-2) is a Knowledge-document PLACEMENT draft. It exists
  // so a PDF enters the same layout placement policy as every other new
  // post; the durable PDF authority remains the Knowledge document.
  kind: 'note' | 'todo' | 'link' | 'table' | 'image' | 'comment' | 'drawing' | 'card' | 'ai-component' | 'file';
  title?: string;
  content: any;
  file_url?: string;
  metadata?: Record<string, any>;
  width?: number;
  height?: number;
  position_x?: number;
  position_y?: number;
  createdAt: number;
  /**
   * P6J-F5 transient provenance for a Note created from a Knowledge source
   * page. It rides the placement draft only; it is NEVER written to a padlets
   * column or into padlets.metadata. The one durable home is source_references,
   * written through the F4-B route after the Note row exists.
   */
  sourceReference?: KnowledgeSourceReferenceDraft;
};

export type NewPostDragState = {
  isActive: boolean;
  draft: PendingPostDraft | null;
  cursor: { x: number; y: number };
  grabOffset: { x: number; y: number };
};

// PATCH ALIGN-A: transient, non-persisted Freeform Smart Alignment Guide
// state -- a single vertical/horizontal guide line in WORLD coordinates, or
// null on either axis when no guide is showing. Detection (comparing the
// dragged post's edges/center against other root posts) is NOT implemented
// yet; this is only the state shape the render layer consumes.
export type FreeformAlignmentGuideState = {
  verticalX: number | null;
  horizontalY: number | null;
};

// PATCH ALIGN-E2: presentation-only sibling of FreeformAlignmentGuideState --
// which pair family produced each axis's current guide (adjacency vs
// ordinary same-edge/center), plus WHERE along that guide line an adjacency
// marker should sit, so the render layer can draw a small perpendicular
// tick at the actual touching point without needing the winning candidate's
// own rect. Deliberately a SEPARATE state/type rather than new fields on
// FreeformAlignmentGuideState itself: geometry (where the line is) and
// presentation (how/whether to mark it) are independent concerns, and
// keeping them apart means every existing `{ verticalX, horizontalY }`
// assertion across the ALIGN-B through ALIGN-E1 test suites stays exact,
// unaffected by this patch.
//
// The marker's cross-axis position is the DRAGGED post's own center on that
// axis (verticalMarkerY = dragged post's vertical center, for a vertical/
// X-axis guide; horizontalMarkerX = dragged post's horizontal center, for a
// horizontal/Y-axis guide) -- not the touching OTHER post's center, which
// this state never tracks. False/null whenever the corresponding axis has
// no guide showing, or its guide is an ordinary (non-adjacency) match.
export type FreeformAlignmentGuideKindState = {
  verticalIsAdjacency: boolean;
  horizontalIsAdjacency: boolean;
  verticalMarkerY: number | null;
  horizontalMarkerX: number | null;
};

// PATCH SPACE-P1: transient, non-persisted "spacing guide" state -- the
// actual positive gap (world units) between the dragged root post and its
// nearest non-overlapping neighbour, shown as a measurement bracket rather
// than a snapping/alignment line. Independent of FreeformAlignmentGuideState
// (which marks WHERE edges/centers line up, not the magnitude of open
// space between two posts that do NOT line up). `horizontalGap` is a
// side-by-side (left/right neighbour) gap measured along X, drawn as a
// horizontally-spanning bracket; `verticalGap` is a stacked (top/bottom
// neighbour) gap measured along Y, drawn as a vertically-spanning bracket --
// this naming matches the bracket's own drawn orientation, NOT
// FreeformAlignmentGuideState's "verticalX/horizontalY" convention (there,
// "vertical"/"horizontal" name the guide LINE's orientation, which is the
// opposite axis relationship). At most one of each may be non-null at a
// time -- the nearest qualifying neighbour on that axis, or null when none
// qualifies.
export type FreeformSpacingGuideAxisState = {
  // World-space coordinates of the two facing edges the bracket spans
  // between, along the gap's own axis. gapEnd is always > gapStart.
  gapStart: number;
  gapEnd: number;
  // World-space midpoint of the overlap band on the PERPENDICULAR axis --
  // where the bracket line, its end ticks, and its label are centered.
  crossCenter: number;
  // gapEnd - gapStart, kept alongside the raw edges so render layers never
  // need to re-derive it.
  distance: number;
} | null;

export type FreeformSpacingGuideState = {
  horizontalGap: FreeformSpacingGuideAxisState;
  verticalGap: FreeformSpacingGuideAxisState;
};

export type ColumnDragPayload =
  | { kind: "container"; id: string; fromSectionId: string }
  | { kind: "post"; id: string; fromSectionId: string };

export type DropIndicatorState = {
  sectionId: string | null;
  index: number | null;
};

export type Board = Canvas;
