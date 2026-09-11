"use client";

import React from 'react';
import {
  BookOpen,
  CheckSquare,
  CloudDownload,
  Columns3,
  FileText,
  FileUp,
  Heading,
  Image as ImageIcon,
  Link,
  Map as MapIcon,
  MessageCircle,
  MoveRight,
  PenTool,
  Settings,
  Sparkles,
  StickyNote,
  Table,
  Upload,
  UserPlus,
} from 'lucide-react';
import type { ChronoMode } from '@/types/collabboard';
import type { SidebarToolGroup } from './CanvasSidebar';
import { KNOWLEDGE_PDF_TOOLBAR_INPUT_ID } from '@/components/collabboard/KnowledgePdfUploader';

export type CanvasToolbarFlags = {
  isMapLayout: boolean;
  isFreeformLayout: boolean;
  isFreeformGraphMode: boolean;
  isTimelineLayout: boolean;
  chronoMode: ChronoMode | string | null;
  canManageCanvasShare: boolean;
  canUseFreeformEditButton: boolean;
  /**
   * The board's own edit authority -- ownership, or a `board_collaborators`
   * row with role 'editor' -- which is what the `padlets` policy actually
   * names.
   *
   * The Create group is the toolbar's board-CONTENT group: every tool in it
   * inserts a `padlets` row. It is therefore gated on this and not on the
   * workspace role, so a board owner or editor whose workspace membership is
   * readonly can still create a Note, and a workspace editor who is only a
   * board VIEWER cannot -- which is what the database says in both cases.
   *
   * Every other group keeps the authority it already had. This gate is about
   * Note creation, not a repermissioning of the toolbar.
   */
  canCreateBoardContent: boolean;
  /** PATCH SECTION-H3C: Section heading is now also supported in Drawing. */
  isDrawingLayout: boolean;
  /**
   * True only on the one layout that ships direct PDF canvas objects; gates the
   * pinned PDF entry in the Media group. Derive it with
   * {@link isDirectPdfCanvasLayout} -- never from `isFreeformLayout`, which is
   * a catch-all that also swallows Table/Stream and any unrecognised layout.
   * Outside the allowlist the tool is absent from the registry entirely rather
   * than rendered disabled, so no unsupported host can mount a control that
   * opens the picker.
   */
  isDirectPdfLayout: boolean;
};

/**
 * PDF-C1 release scope. THE allowlist for direct PDF canvas objects, and the
 * only gate: both the toolbar and the defensive placement guard read this one
 * predicate, so no per-layout PDF switch exists anywhere.
 *
 * Freeform alone ships in C1. Every structured layout (Wall, Columns, Grid,
 * Table, Timeline, Scheduler, Map, Stream, Kanban, Gantt, ...) has semantic
 * placement structures instead, and will eventually reference a Knowledge PDF
 * from an ordinary Note/Post/Container rather than hold a raw PDF object.
 *
 * Drawing is a spatial object canvas and its PDF placement path works on
 * insert, but it is deliberately EXCLUDED here: container-hosted posts vanish
 * from Drawing's rendering after a board reload. That defect is generic to the
 * Drawing host -- an ordinary Note reproduces it -- so it is not fixed by this
 * predicate and is tracked as DRAWING_CONTAINER_HOST_RELOAD_DEFECT. Enabling
 * toolbar PDF insertion there would expose a known-broken experience. Re-add
 * 'drawing' here, and nowhere else, once that host defect is fixed and
 * independently verified.
 */
export function isDirectPdfCanvasLayout(layout: string | null | undefined): boolean {
  return layout === 'freeform';
}

function GraphLineToolIcon({ size = 18, className, ...rest }: { size?: number; className?: string; [key: string]: unknown }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true" {...rest}>
      <circle cx="5" cy="12" r="2" fill="currentColor" />
      <circle cx="19" cy="5" r="2" fill="currentColor" />
      <circle cx="19" cy="12" r="2" fill="currentColor" />
      <circle cx="19" cy="19" r="2" fill="currentColor" />
      <path d="M7 12L17 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M7 12L17 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M7 12L17 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function MapPinToolbarIcon({ size = 18, className, ...rest }: { size?: number; className?: string; [key: string]: unknown }) {
  const iconSize = Math.max(size, 22);
  return (
    <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true" {...rest}>
      <circle cx="12" cy="9" r="6" fill="currentColor" />
      <rect x="8.5" y="13" width="7" height="7" transform="rotate(45 12 16.5)" fill="currentColor" />
    </svg>
  );
}

/**
 * The board-content creation tools, in their rendered order.
 *
 * Exported as the single list so the callback that executes a tool can refuse
 * exactly the set the toolbar refuses to render -- one definition, two
 * enforcement points, no drift between what is shown and what is allowed.
 */
export const CREATE_TOOLS: SidebarToolGroup['tools'] = [
  { icon: Sparkles, label: "AI", color: "text-purple-600", bg: "hover:bg-purple-50", type: "ai-component" },
  { icon: StickyNote, label: "Note", color: "text-yellow-600", bg: "hover:bg-yellow-50", type: "note" },
  { icon: FileText, label: "Document", color: "text-sky-700", bg: "hover:bg-sky-50", type: "document" },
  { icon: CheckSquare, label: "To-do", color: "text-green-600", bg: "hover:bg-green-50", type: "todo" },
  { icon: MessageCircle, label: "Comment", color: "text-orange-600", bg: "hover:bg-orange-50", type: "comment" },
  { icon: Table, label: "Table", color: "text-purple-600", bg: "hover:bg-purple-50", type: "table" },
];

/** The same set, as the callback guard consumes it. */
export const BOARD_CONTENT_TOOL_TYPES: ReadonlySet<string> = new Set(
  CREATE_TOOLS.map((tool) => tool.type),
);

export function buildCanvasToolbarGroups({
  isMapLayout,
  isFreeformLayout,
  isFreeformGraphMode,
  isTimelineLayout,
  chronoMode,
  canManageCanvasShare,
  canUseFreeformEditButton,
  canCreateBoardContent,
  isDrawingLayout,
  isDirectPdfLayout,
}: CanvasToolbarFlags): SidebarToolGroup[] {
  const canvasSpecificTools = [
    { icon: MoveRight, label: "Line", color: "text-gray-600", bg: "hover:bg-gray-50", type: "line" },
    ...(isMapLayout ? [
      { icon: MapPinToolbarIcon, label: "Pins panel", color: "text-slate-700", bg: "hover:bg-slate-100", type: "map-sidebar" },
      { icon: MapIcon, label: "Map", color: "text-emerald-600", bg: "hover:bg-emerald-50", type: "map-style" },
    ] : []),
    ...(isFreeformLayout ? [
      ...(isFreeformGraphMode ? [{ icon: GraphLineToolIcon, label: "Graph Line", color: "text-indigo-600", bg: "hover:bg-indigo-50", type: "graph-line" }] : []),
      { icon: Columns3, label: "Column", color: "text-violet-700", bg: "hover:bg-violet-50", type: "container" },
    ] : []),
  ];

  return [
    // Group 1 - Canvas-specific (always visible, priority 1); only rendered when there are canvas-specific tools
    ...(canvasSpecificTools.length > 0 ? [{
      id: 'canvas',
      label: isMapLayout ? 'Map' : 'Canvas',
      tools: canvasSpecificTools,
      priority: 1,
      alwaysVisible: true,
    }] : []),
    // Group 2 - Create (always visible, priority 2); AI is always first.
    // Present only for a user the BOARD authorises to write its content --
    // every tool here inserts a `padlets` row under that one policy.
    ...(canCreateBoardContent ? [{
      id: 'create',
      label: 'Create',
      tools: CREATE_TOOLS,
      priority: 2,
      alwaysVisible: true,
    }] : []),
    // Group 3 - Structure (priority 3)
    {
      id: 'structure',
      label: 'Blocks',
      tools: [
        // PATCH SECTION-H1: Freeform only, initially. PATCH SECTION-H3C: Drawing
        // now shares the same canonical renderer/engine, so the tool is exposed
        // there too. Still absent from the registry entirely (not merely
        // disabled) for every other structured layout -- no dead button can be
        // mounted for Wall/Columns/Grid/Table/Timeline/Stream/Map.
        ...(isFreeformLayout || isDrawingLayout ? [
          { icon: Heading, label: "Section heading", color: "text-teal-700", bg: "hover:bg-teal-50", type: "section-heading" },
        ] : []),
        { icon: BookOpen, label: "Library", color: "text-blue-600", bg: "hover:bg-blue-50", type: "library",
          disabled: isTimelineLayout && chronoMode === 'vertical',
          hint: "Switch to Horizontal or Alternating view to use the Library." },
      ],
      priority: 4,
    },
    // Group 4 - Media (priority 4)
    {
      id: 'media',
      label: 'Media',
      tools: [
        { icon: Link, label: "Link", color: "text-blue-600", bg: "hover:bg-blue-50", type: "link" },
        { icon: ImageIcon, label: "Add image", color: "text-pink-600", bg: "hover:bg-pink-50", type: "image" },
        // PDF belongs in Media, and two properties keep it working there.
        // `pinned` keeps it rendered inline even when Media overflows into the
        // More menu -- that menu dispatches after it has closed, by which point
        // the browser will no longer open a file dialog. `activatesInputId`
        // makes the control a real <label htmlFor>, so the BROWSER opens the
        // dialog natively instead of JavaScript calling input.click(). Remove
        // either one and "PDF does nothing" returns.
        //
        // ONE entry, deliberately. Re-placing a PDF the board already has is
        // reached through the PDF workspace's own "+" flow, so no second
        // toolbar button competes with this one.
        ...(isDirectPdfLayout ? [
          {
            icon: FileUp, label: "PDF", color: "text-rose-700", bg: "hover:bg-rose-50",
            type: "knowledge-pdf", pinned: true, activatesInputId: KNOWLEDGE_PDF_TOOLBAR_INPUT_ID,
          },
        ] : []),
        { icon: Upload, label: "Upload", color: "text-cyan-600", bg: "hover:bg-cyan-50", type: "upload" },
        { icon: CloudDownload, label: "Import", color: "text-sky-600", bg: "hover:bg-sky-50", type: "import" },
      ],
      priority: 5,
    },
    // Group 5 - Draw (priority 5, collapsed first on small screens)
    {
      id: 'draw',
      label: 'Draw',
      tools: [
        { icon: PenTool, label: "Draw", color: "text-red-600", bg: "hover:bg-red-50", type: "draw" },
      ],
      priority: 6,
    },
    ...(canManageCanvasShare ? [{
      id: 'share',
      label: 'Share',
      tools: [
        { icon: UserPlus, label: 'Share canvas', color: 'text-slate-700', bg: 'hover:bg-slate-100', type: 'share' },
      ],
      priority: 7,
      alwaysVisible: true,
    }] : []),
    ...(canUseFreeformEditButton ? [{
      id: 'settings',
      label: 'Settings',
      tools: [
        { icon: Settings, label: 'Canvas settings', color: 'text-slate-700', bg: 'hover:bg-slate-100', type: 'canvas-settings' },
      ],
      priority: 8,
      alwaysVisible: true,
    }] : []),
  ];
}
