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
  Timer,
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
  /**
   * PATCH-374. A guest, for the tools that are host-only. (PATCH-375 removed the
   * `board-ai` tool this also gated, along with `isWallLayout`,
   * `isColumnsLayout`, `isGridLayout` and `enableBoardAiChat`, which fed nothing
   * else: Board AI is the floating top-right button on every layout now.)
   */
  isGuest?: boolean;
  /**
   * PATCH-380. The owner's "Guests may upload images and PDFs" switch. When on,
   * a guest gets the Image tool back -- it is served by the guest-upload route.
   */
  guestUploadsAllowed?: boolean;
  /**
   * PATCH-374. The facilitator kit (a shared countdown and "Bring everyone
   * here"). The board's HOST -- owner or board admin -- and never a guest; the
   * RPCs refuse anyone else whatever the toolbar renders.
   */
  canFacilitate?: boolean;
  /**
   * PATCH-374. The board's raw layout, for the one allowlist that is not a set
   * of flags: {@link FACILITATION_LAYOUTS}. `isFreeformLayout` cannot be used
   * for it -- that is a catch-all which also swallows Table/Stream/Drawing.
   */
  canvasLayout?: string | null;
  chronoMode: ChronoMode | string | null;
  canManageCanvasShare: boolean;
  canUseFreeformEditButton: boolean;
  /**
   * The board's own edit authority -- ownership, or a `board_collaborators`
   * row with role 'editor' -- which is what the `padlets` policy actually
   * names.
   *
   * It gates every group that writes this board's shared content: Create,
   * Blocks, Media and Draw. Each tool in them ends in a `padlets` row, so a
   * board owner or editor whose workspace membership is readonly can use them,
   * and a workspace editor who is only a board VIEWER cannot -- which is what
   * the database says in both cases.
   *
   * Canvas, Settings and Share keep the workspace authority they had: they
   * write `boards`, the graph tables or the workspace, not this board's
   * content, and one capability must not speak for two policies.
   */
  canCreateBoardContent: boolean;
  /** PATCH SECTION-H3C: Section heading is now also supported in Drawing. */
  isDrawingLayout: boolean;
  /**
   * True on the layouts that may add AI/Wiki documents (Freeform and Scheduler);
   * gates the pinned entry in the Media group. Derive it with
   * {@link isDirectPdfCanvasLayout} -- never from `isFreeformLayout`, which is
   * a catch-all that also swallows Table/Stream and any unrecognised layout.
   * Outside the allowlist the tool is absent from the registry entirely rather
   * than rendered disabled, so no unsupported host can mount a control that
   * opens the picker.
   */
  isDirectPdfLayout: boolean;
};

/**
 * Release scope for the "AI/Wiki Documents" (PDF, Word, Text) tool. THE
 * allowlist, and the only gate: both the toolbar and the defensive placement
 * guard read this one predicate, so no per-layout document switch exists
 * anywhere. (The name is historical -- it began as "direct PDF canvas objects";
 * it now means "this layout can add AI/Wiki documents".)
 *
 * Freeform ships the document as a direct canvas object. PATCH-338 adds the
 * Scheduler, where the document post always lives INSIDE a time-slot entry
 * (never loose on the board), placed through the same flow a Note uses. Every
 * other structured layout (Wall, Columns, Grid, Table, Timeline, Map, Stream,
 * Kanban, Gantt, ...) stays without the tool and references a Knowledge
 * document from an ordinary post instead.
 *
 * Drawing is a spatial object canvas and its placement path works on insert,
 * but it is deliberately EXCLUDED here: container-hosted posts vanish from
 * Drawing's rendering after a board reload. That defect is generic to the
 * Drawing host -- an ordinary Note reproduces it -- so it is not fixed by this
 * predicate and is tracked as DRAWING_CONTAINER_HOST_RELOAD_DEFECT. Enabling
 * toolbar document insertion there would expose a known-broken experience.
 * Re-add 'drawing' here, and nowhere else, once that host defect is fixed and
 * independently verified.
 */
export function isDirectPdfCanvasLayout(layout: string | null | undefined): boolean {
  return layout === 'freeform' || layout === 'scheduler';
}

/**
 * PATCH-374. The layouts the facilitator kit runs on. The ONE allowlist: the
 * toolbar gate reads it, so a layout added here gets the tool and nothing else
 * does. Deliberately not `isFreeformLayout`, which is a catch-all.
 */
export const FACILITATION_LAYOUTS: ReadonlySet<string> = new Set([
  'freeform',
  'wall',
  'columns',
  'grid',
  'timeline',
  'map',
]);

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

/**
 * The shared-content tools that live OUTSIDE the Create group -- Blocks, Media
 * and Draw. Every one of them ends in a `padlets` write for this board, so they
 * answer to the same board authority Create does; the workspace role is not a
 * term in that policy.
 *
 * `knowledge-pdf` belongs here even though it reaches the board through a
 * native file input rather than the tool callback: this registry decides
 * whether that control exists at all, and the placement handler asks the same
 * capability again before anything is written.
 */
export const SHARED_BOARD_CONTENT_TOOL_TYPES: readonly string[] = [
  'section-heading',
  'library',
  'link',
  'image',
  'upload',
  'import',
  'draw',
  'knowledge-pdf',
];

/**
 * THE board-content classification: the Create group's tools and the shared
 * content tools, in one set, as both the toolbar and the callback guard consume
 * it. One list, two enforcement points -- what is not rendered is also not
 * executable, and neither half can drift from the other.
 */
export const BOARD_CONTENT_TOOL_TYPES: ReadonlySet<string> = new Set([
  ...CREATE_TOOLS.map((tool) => tool.type),
  ...SHARED_BOARD_CONTENT_TOOL_TYPES,
]);

/**
 * Tool types whose backends are NOT `padlets`, and which therefore answer to
 * the workspace capability rather than the board's content authority.
 *
 * Map style writes the board row; Graph Line drives the freeform graph tables,
 * which carry their own `can_edit_board`. Both are refused at the callback as
 * well as withheld from the toolbar, so reaching the action by another route
 * changes nothing.
 */
export const WORKSPACE_CANVAS_TOOL_TYPES: ReadonlySet<string> = new Set([
  'map-style',
  'graph-line',
]);

/**
 * PATCH-379. The tool types a GUEST is not offered.
 *
 * These are the ones the SERVER refuses: every AI route rejects a guest
 * (`GUEST_AI_REFUSAL`) and every upload route rejects one (`GUEST_UPLOAD_REFUSAL`),
 * with the storage policies refusing the write underneath. Showing them to a
 * guest offered a button whose only outcome was an error.
 *
 * `library` is here with them: the Library panel places library media and
 * replaces post icons, which is the media family the owner named, and a guest
 * has no way to remove what it puts on the board.
 *
 * PATCH-379 Addendum 1 adds `container`. The Column tool builds the same thing a
 * `board_sections` row does -- a group the board is then STRUCTURED by -- and a
 * guest may not write `board_sections` at all. A guest keeps every tool that
 * makes a POST: Note, Document, To-do, Comment, Table, Section heading, Link,
 * Draw, Line, and the map tools.
 */
export const GUEST_FORBIDDEN_TOOL_TYPES: ReadonlySet<string> = new Set([
  'ai-component',
  'image',
  'upload',
  'import',
  'knowledge-pdf',
  'library',
  'container',
  // PATCH-380. A guest does not get the Canvas settings tool: it writes the
  // board row (title, wallpaper, layout), which is the owner's.
  'canvas-settings',
]);

/**
 * PATCH-380. What a guest is forbidden, given the owner's switches.
 *
 * `guestUploadsAllowed` gives back `image` and nothing else -- that is the one
 * tool the server route behind it can serve a guest. `ai-component` stays out
 * even when AI is allowed: Board AI for a guest is answer-only, and a component
 * the model writes is a board change by another name.
 */
export function guestForbiddenToolTypes(flags: {
  readonly guestUploadsAllowed?: boolean;
} = {}): ReadonlySet<string> {
  const forbidden = new Set(GUEST_FORBIDDEN_TOOL_TYPES);
  if (flags.guestUploadsAllowed === true) forbidden.delete('image');
  return forbidden;
}

export function buildCanvasToolbarGroups({
  isMapLayout,
  isFreeformLayout,
  isFreeformGraphMode,
  isTimelineLayout,
  isGuest = false,
  guestUploadsAllowed = false,
  canFacilitate = false,
  canvasLayout = null,
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

  // PATCH-374. The facilitator kit runs on the six layouts that share the
  // canvas viewport, and only for the board's host. Kanban, Scheduler and Gantt
  // are separate pages and come later.
  const showFacilitateTool = canFacilitate && !isGuest && FACILITATION_LAYOUTS.has(canvasLayout ?? '');

  const groups: SidebarToolGroup[] = [
    // Group 1 - Canvas-specific (always visible, priority 1); only rendered when
    // there are canvas-specific tools AND the workspace capability is present.
    // Line, Map style and Graph Line do not write `padlets` -- Map style and
    // the graph tools reach `boards` and the freeform graph tables -- so the
    // board-content capability that opens the Create group must not open this.
    ...(canUseFreeformEditButton && canvasSpecificTools.length > 0 ? [{
      id: 'canvas',
      label: isMapLayout ? 'Map' : 'Canvas',
      tools: canvasSpecificTools,
      priority: 1,
      alwaysVisible: true,
    }] : []),
    // PATCH-375. There is no `board-ai` toolbar tool any more. PATCH-371 put one
    // here on the Padlet layouts, which showed the SAME Sparkles icon twice --
    // once in this group and once in Create, directly below it. Board AI is now
    // the floating top-right Bot button Freeform already used, on every layout
    // (CanvasClient owns that; a guest is excluded there).
    // PATCH-374. Facilitate: for the board's host only. It writes the `boards`
    // row, not `padlets`, so it is deliberately NOT gated on board-content
    // authority.
    ...(showFacilitateTool ? [{
      id: 'facilitate',
      label: 'Facilitate',
      tools: [
        { icon: Timer, label: 'Facilitate', color: 'text-amber-600', bg: 'hover:bg-amber-50', type: 'facilitate' },
      ],
      priority: 3,
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
    // Group 3 - Structure (priority 3). Board content: Section heading inserts
    // a `padlets` row, and the Library's drop places one.
    ...(canCreateBoardContent ? [{
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
    }] : []),
    // Group 4 - Media (priority 4). Board content: every entry ends in a
    // `padlets` row for this board. Storage and provider quotas are a separate
    // concern and are deliberately NOT proxied through the workspace role here.
    ...(canCreateBoardContent ? [{
      id: 'media',
      label: 'Media',
      tools: [
        { icon: Link, label: "Link", color: "text-blue-600", bg: "hover:bg-blue-50", type: "link" },
        { icon: ImageIcon, label: "Image", color: "text-pink-600", bg: "hover:bg-pink-50", type: "image",
          description: "Free images or upload your own" },
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
            icon: FileUp, label: "AI/Wiki Documents", color: "text-rose-700", bg: "hover:bg-rose-50",
            type: "knowledge-pdf", pinned: true, activatesInputId: KNOWLEDGE_PDF_TOOLBAR_INPUT_ID,
            description: "PDF, Word, Text",
          },
        ] : []),
        { icon: CloudDownload, label: "Cloud import", color: "text-sky-600", bg: "hover:bg-sky-50", type: "import",
          description: "Google Drive or OneDrive" },
      ],
      priority: 5,
    }] : []),
    // Group 5 - Draw (priority 5, collapsed first on small screens). Board
    // content: a drawing is a `padlets` row like any other.
    ...(canCreateBoardContent ? [{
      id: 'draw',
      label: 'Draw',
      tools: [
        { icon: PenTool, label: "Draw", color: "text-red-600", bg: "hover:bg-red-50", type: "draw" },
      ],
      priority: 6,
    }] : []),
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

  // PATCH-379. A guest is not offered a tool the server refuses. Filtering here
  // -- one predicate over every group -- means a group left empty disappears
  // whole, and no tool can be added later without answering this question.
  if (!isGuest) return groups;
  const guestForbidden = guestForbiddenToolTypes({ guestUploadsAllowed });
  return groups
    .map((group) => ({
      ...group,
      tools: group.tools.filter((tool) => !guestForbidden.has(tool.type)),
    }))
    .filter((group) => group.tools.length > 0);
}
