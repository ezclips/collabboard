'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, X, Loader2, Play, Save, StopCircle, Lock, Palette, Type, Smile, MessageSquare, TextCursor } from 'lucide-react';

import AIContentRenderer from '@/components/ai/AIContentRenderer';
import type {
  AIContentData,
  AIMode,
  AIGenerationAttribution,
  DiagramSubtype,
  GenerateAIContentRequest,
  InfographicDiagramData,
  LoadedAIContent,
  PhotoCardData,
  PhotoCardTextStyle,
} from '@/lib/ai/contracts';
import {
  MODE_REGISTRY,
  getDiagramSubtypeConfig,
  getModeConfig,
  isDiagramModeConfig,
} from '@/lib/ai/mode-registry';
import { normalizeAIContent } from '@/lib/ai/normalize-ai-content';
import { suggestDesigns, type DesignSuggestion } from '@/lib/ai/infographic/suggest';
import { familyForSubtype, type PictureFamily } from '@/lib/ai/pictureFamilies';
import { withExampleValues, type VisualOutline } from '@/lib/ai/outline';
import { flowCode } from '@/lib/ai/outlineToVisuals';
import { themeById, type VisualThemeId } from '@/lib/ai/visualThemes';
import type { VisualStyle } from '@/lib/ai/visualStyle';
import OutlineTextEditor from './OutlineTextEditor';
import OutlineSuggestionsPanel from './OutlineSuggestionsPanel';
import { serializeAIContentForPersistence } from '@/lib/ai/persistence';
import {
  trackAIAutoModeCorrectedByUser,
  trackAIAutoModeSelected,
  trackAIRegenerationFailed,
  trackAIRegenerationStarted,
  trackAIRegenerationSucceeded,
} from '@/lib/ai/telemetry';
import { CardColorPanel } from './CardColorPanel';
import TextStylePopup from './TextStylePopup';
import EmojiReactionPicker from './EmojiReactionPicker';
import CommentPopup from './CommentPopup';
import ReactionDisplay from './ReactionDisplay';
import InlineCaption from './InlineCaption';
import { resolveCaptionStyle, CAPTION_STYLE_PRESETS, type CaptionHeading } from '@/lib/domain/canvas/captionStyle';
import { nextTextAlign } from './textAlignCycle';
import { AI_ROLE_COMPONENT } from '@/lib/ai/aiRoles';
import AIRoleModelChooser from '@/components/ai/AIRoleModelChooser';
import PlanLimitNotice, { planLimitFromResponse } from '@/components/billing/PlanLimitNotice';
import { formatAIGenerationAttribution, readAIGenerationAttribution } from '@/lib/ai/attribution';
import { guardCommentMutation, type CommentAccessMode } from '@/lib/domain/canvas/comments';

type Stage = 'idle' | 'classifying' | 'generating' | 'rendering' | 'done' | 'error';

// 'auto' is a UI-only sentinel — it is resolved to a concrete AIMode before generation
type UIMode = AIMode | 'auto';

interface AutoResolved {
  mode: AIMode;
  subtype?: DiagramSubtype;
  confidence: 'high' | 'low';
}

/** PATCH-256. The optional Customize options an outline request can carry. */
interface OutlineRequestBody {
  detail?: 'auto' | 'summary' | 'detailed';
  keepWording?: boolean;
  visualHint?: string;
  estimateValues?: boolean;
}

interface AIComponentEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    title?: string;
    aiPrompt: string;
    aiComponentJson?: LoadedAIContent;
    aiComponentCode?: string;
    aiRawCode?: string;
    metadata?: Record<string, unknown>;
  }) => void;
  initialTitle?: string;
  initialPrompt?: string;
  initialContent?: unknown;
  initialMetadata?: Record<string, unknown>;
  // When set, mode and subtype selectors are locked (regenerate flow)
  lockedMode?: AIMode;
  lockedSubtype?: DiagramSubtype;
  // PATCH 8T -- accessMode/currentUserId/currentUserName. Matches
  // NoteEditor/DrawingEditor/TodoEditor's own-editor-site convention:
  // defaults to 'manage'/'anon'/'You' so existing callers that don't yet
  // pass these keep their current fully-writable behavior.
  accessMode?: CommentAccessMode;
  currentUserId?: string;
  currentUserName?: string;
  /** PATCH-188. The board this card is built on; the owner's plan pays. */
  boardId?: string;
  // PATCH-235. Opened by "Visualize…": starts in Diagram + Show options with the
  // post's text and generates once, automatically.
  initialVisualize?: boolean;
}

type CommentDraft = {
  id: string;
  text: string;
  userId: string;
  userName: string;
  timestamp: number;
  textColor?: string;
  backgroundColor?: string;
  isStrikethrough?: boolean;
};

type CommentTitleStyle = { color?: string; backgroundColor?: string };

function isQuotaExceededMessage(message: string) {
  return /quota|exceeded.*quota|rate.?limit/i.test(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * PATCH-236. Opening a stored infographic: its shape is already saved, so the
 * editor can offer the designs again with no AI call.
 */
function readStoredInfographic(initialContent?: unknown): InfographicDiagramData | null {
  const normalized = normalizeAIContent(initialContent);
  if (normalized.kind !== 'structured') return null;
  const data = normalized.envelope?.data ?? normalized.data;
  if (isRecord(data) && data.type === 'diagram' && data.subtype === 'infographic') {
    return data as InfographicDiagramData;
  }
  return null;
}

/** PATCH-238. Subtypes that draw with a theme; Flow/Mermaid keep their colours. */
const THEMED_SUBTYPES: ReadonlySet<string> = new Set(['infographic', 'mindmap', 'comparison', 'timeline']);

/**
 * PATCH-238. Stamps the chosen theme onto a themed diagram's envelope data.
 * Classic (and Flow) are left untouched so a plain picture is byte-identical.
 */
function applyThemeToData<T extends { subtype: string }>(data: T, theme: VisualThemeId): T {
  if (!THEMED_SUBTYPES.has(data.subtype) || theme === 'classic') return data;
  return { ...data, theme } as T;
}

/**
 * PATCH-253. Stamps the chosen colour / font style onto a themed diagram's
 * envelope data. No style (or an unthemed design) leaves it byte-identical.
 */
function applyStyleToData<T extends { subtype: string }>(data: T, style?: VisualStyle): T {
  if (!style || !THEMED_SUBTYPES.has(data.subtype)) return data;
  return { ...data, style } as T;
}

function inferInitialSelection(initialContent?: unknown): {
  mode: AIMode;
  subtype?: DiagramSubtype;
} {
  if (!initialContent) {
    return { mode: 'lesson_board' };
  }

  const normalized = normalizeAIContent(initialContent);

  switch (normalized.kind) {
    case 'structured':
      if (normalized.envelope) {
        return {
          mode: normalized.envelope.mode,
          subtype: normalized.envelope.meta?.subtype as DiagramSubtype | undefined,
        };
      }

      if (normalized.data.type === 'diagram') {
        return {
          mode: 'diagram',
          subtype: normalized.data.subtype,
        };
      }

      if (normalized.data.type === 'photo') {
        return { mode: 'photo_card' };
      }

      if (normalized.data.type === 'workshop_board') {
        return { mode: 'workshop_board' };
      }

      return { mode: 'lesson_board' };
    case 'legacy_html':
    case 'legacy_lesson_board':
    case 'unknown':
    default:
      return { mode: 'lesson_board' };
  }
}

function getDefaultDiagramSubtype(): DiagramSubtype {
  return 'flowchart';
}

/** PATCH-257. A suggestion key that names a pie/bar/column/line chart. */
function isNumericChartOption(option: DesignSuggestion): boolean {
  const name = option.key.startsWith('antv:') ? option.key.slice('antv:'.length) : option.key;
  return (
    name.startsWith('chart-pie-') ||
    name.startsWith('chart-bar-') ||
    name.startsWith('chart-column-') ||
    name.startsWith('chart-line-')
  );
}

function getErrorMessage(payload: unknown): string {
  if (!isRecord(payload)) {
    return 'Failed to generate component';
  }

  const details = payload.details;
  if (typeof details === 'string' && details.trim()) {
    return details;
  }

  const error = payload.error;
  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  if (isRecord(error)) {
    // Prefer specific Zod issue over the generic fallback message
    if (Array.isArray(error.issues) && error.issues.length > 0) {
      const firstIssue = error.issues[0];
      if (isRecord(firstIssue) && typeof firstIssue.message === 'string') {
        const path = typeof firstIssue.path === 'string' && firstIssue.path
          ? `${firstIssue.path}: ` : '';
        return `${path}${firstIssue.message}`;
      }
    }

    const nestedMessage = error.message;
    if (typeof nestedMessage === 'string' && nestedMessage.trim()) {
      return nestedMessage;
    }
  }

  return 'Failed to generate component';
}

const EXAMPLE_PROMPTS: Partial<Record<AIMode | 'auto', string>> = {
  auto: 'Water cycle for 7th grade',
  lesson_board: 'Photosynthesis for middle school',
  diagram: 'How a JWT token is validated',
  photo_card: 'Golden Gate Bridge at sunset',
  workshop_board: '90-minute design sprint agenda',
};

function buildRequestBody(
  prompt: string,
  mode: AIMode,
  subtype?: DiagramSubtype,
): GenerateAIContentRequest {
  if (mode === 'diagram') {
    return {
      prompt,
      mode,
      subtype: subtype ?? getDefaultDiagramSubtype(),
    };
  }

  return {
    prompt,
    mode,
  };
}

export default function AIComponentEditor({
  isOpen,
  onClose,
  onSave,
  initialTitle = '',
  initialPrompt = '',
  initialContent,
  initialMetadata,
  lockedMode,
  lockedSubtype,
  accessMode = 'manage',
  currentUserId = 'anon',
  currentUserName = 'You',
  boardId,
  initialVisualize = false,
}: AIComponentEditorProps) {
  const isLocked = Boolean(lockedMode);
  const [title, setTitle] = useState(initialTitle);

  // Post customization: color, title style, reaction, comment and caption --
  // the same set every other post type (Note/Image/Drawing) supports,
  // entered directly in the header row and saved together with the
  // component on Save to Canvas.
  const [cardColor, setCardColor] = useState('#ffffff');
  const [topStrip, setTopStrip] = useState('transparent');
  const [titleStyle, setTitleStyle] = useState<Record<string, any>>({});
  const [reactions, setReactions] = useState<string[]>([]);
  const [detachedComments, setDetachedComments] = useState<CommentDraft[]>([]);
  const [badgeColor, setBadgeColor] = useState('#facc15');
  const [commentTitle, setCommentTitle] = useState<string | undefined>(undefined);
  const [commentTitleStyle, setCommentTitleStyle] = useState<CommentTitleStyle>({});
  const [caption, setCaption] = useState('');

  const [isTextStyleOpen, setIsTextStyleOpen] = useState(false);
  const [isColorPanelOpen, setIsColorPanelOpen] = useState(false);
  const [isReactionPickerOpen, setIsReactionPickerOpen] = useState(false);
  const [isCommentPanelOpen, setIsCommentPanelOpen] = useState(false);
  const [isCaptionEditing, setIsCaptionEditing] = useState(false);

  // The single Text style button doubles up: it either styles the post's
  // own title (default) or, when the user has focused text inside a Photo
  // Card's preview (kicker/title/caption), the Photo Card's own text --
  // no second style button/popup duplicated inside the renderer itself.
  const [activeStyleTarget, setActiveStyleTarget] = useState<'title' | 'photoCard'>('title');
  const modalRef = useRef<HTMLDivElement>(null);
  // Shared position for every popup that detaches to the right of the modal
  // (Text style, Reaction, Comment) -- only one is ever open at a time, so
  // one position is enough, computed fresh each time one of them opens.
  const [detachedPopupPos, setDetachedPopupPos] = useState<{ left: number; top: number } | null>(null);

  const togglePanel = (panel: 'text' | 'color' | 'reaction' | 'comment' | 'caption') => {
    setIsTextStyleOpen((prev) => (panel === 'text' ? !prev : false));
    setIsColorPanelOpen((prev) => (panel === 'color' ? !prev : false));
    setIsReactionPickerOpen((prev) => (panel === 'reaction' ? !prev : false));
    setIsCommentPanelOpen((prev) => (panel === 'comment' ? !prev : false));
    setIsCaptionEditing((prev) => (panel === 'caption' ? !prev : false));
  };

  const openDetachedPanel = (panel: 'text' | 'color' | 'reaction' | 'comment', isCurrentlyOpen: boolean) => {
    const opening = !isCurrentlyOpen;
    togglePanel(panel);
    if (opening && modalRef.current) {
      const rect = modalRef.current.getBoundingClientRect();
      setDetachedPopupPos({ left: rect.right + 12, top: rect.top });
    }
  };

  // Highlighting title text should open the Text style panel, without
  // toggling an already-open panel closed (openDetachedPanel toggles on
  // `!prev`, so calling it while already open would close it).
  const openTextStyleForTitle = () => {
    setActiveStyleTarget('title');
    if (!isTextStyleOpen) openDetachedPanel('text', isTextStyleOpen);
  };

  const isTitleBold = titleStyle.fontWeight === '700' || titleStyle.fontWeight === 'bold';
  const isTitleItalic = titleStyle.fontStyle === 'italic';
  const toggleTitleBold = () => setTitleStyle((prev) => ({ ...prev, fontWeight: isTitleBold ? '400' : '700' }));
  const toggleTitleItalic = () => setTitleStyle((prev) => ({ ...prev, fontStyle: isTitleItalic ? 'normal' : 'italic' }));
  const toggleTitleUnderline = () => setTitleStyle((prev) => ({ ...prev, underline: !prev.underline }));
  const toggleTitleStrikethrough = () => setTitleStyle((prev) => ({ ...prev, strikethrough: !prev.strikethrough }));
  const cycleTitleAlign = () => setTitleStyle((prev) => ({ ...prev, textAlign: nextTextAlign(prev.textAlign || 'left') }));
  const applyTitlePreset = (level: CaptionHeading) => {
    setTitleStyle((prev) => {
      const selectedPreset = level === 'callout' && prev.backgroundColor
        ? { ...CAPTION_STYLE_PRESETS.callout, backgroundColor: prev.backgroundColor }
        : CAPTION_STYLE_PRESETS[level];
      return { ...prev, ...selectedPreset };
    });
  };

  const commentCount = detachedComments.length;
  const titleInputStyle = resolveCaptionStyle(titleStyle, undefined);

  const initialSelection = useMemo(
    () => inferInitialSelection(initialContent),
    [initialContent],
  );

  const [prompt, setPrompt] = useState(initialPrompt);
  const [uiMode, setUiMode] = useState<UIMode>(lockedMode ?? initialSelection.mode);
  const [mode, setMode] = useState<AIMode>(lockedMode ?? initialSelection.mode);
  const [subtype, setSubtype] = useState<DiagramSubtype | undefined>(lockedSubtype ?? initialSelection.subtype);
  const [autoResolved, setAutoResolved] = useState<AutoResolved | null>(null);
  // PATCH-233. "Show options": one outline call draws several pictures locally.
  const [showOptions, setShowOptions] = useState(false);
  const [outlineOptions, setOutlineOptions] = useState<DesignSuggestion[]>([]);
  // PATCH-237. The CURRENT outline, so Edit text can redraw locally with no AI call.
  const [activeOutline, setActiveOutline] = useState<VisualOutline | null>(null);
  // PATCH-237 Addendum 1. The Customize hint named on the last Apply, kept so
  // later local re-ranks (Edit text) rank the named design first too.
  const [activeVisualHint, setActiveVisualHint] = useState<string | undefined>(undefined);
  // PATCH-238. The chosen colour theme; local to the picture, saved with it.
  const [visualTheme, setVisualTheme] = useState<VisualThemeId>('classic');
  // PATCH-253. Custom background / element colours / fonts, saved with it.
  const [visualStyle, setVisualStyle] = useState<VisualStyle | undefined>(undefined);
  const [selectedOptionKey, setSelectedOptionKey] = useState<string | null>(null);
  // PATCH-248. A Diagram subtype button filters the designs locally (no fetch).
  const [activeFamily, setActiveFamily] = useState<PictureFamily | null>(null);
  const [activeFamilyLabel, setActiveFamilyLabel] = useState<string | null>(null);
  // PATCH-248 Addendum 2. The selected button's own description line.
  const [activeFamilyDescription, setActiveFamilyDescription] = useState<string | null>(null);
  // PATCH-248. Which chart button opened the list, so the note offers that chart.
  const [chartMakeSubtype, setChartMakeSubtype] = useState<'pie_chart' | 'bar_chart' | null>(null);
  const [outlineGeneratedBy, setOutlineGeneratedBy] = useState<AIGenerationAttribution | null>(null);
  const [outlineCreatedAt, setOutlineCreatedAt] = useState<string | null>(null);
  const [content, setContent] = useState<unknown>(initialContent ?? null);
  const [stage, setStage] = useState<Stage>(initialContent ? 'done' : 'idle');
  const [error, setError] = useState<string | null>(null);
  /** PATCH-188. True when `error` is the server's plan-limit refusal, so it
   *  renders with the shared message and the "See plans" link. */
  const [errorIsPlanLimit, setErrorIsPlanLimit] = useState(false);
  /** Its own line: a failed model change and a failed generation are different
   *  failures, and neither may overwrite the other's message. */
  const [modelError, setModelError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  // PATCH-235: the Visualize auto-run fires exactly once per open.
  const visualizeAutoRanRef = useRef(false);
  // PATCH-256. The options the last outline attempt used, so the preview's
  // Try again replays exactly that request (a bare Generate, or a Customize /
  // estimated-values one) rather than always sending no options.
  const lastOutlineRequestBodyRef = useRef<OutlineRequestBody | undefined>(undefined);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const selection = inferInitialSelection(initialContent);
    const resolvedMode = lockedMode ?? selection.mode;
    setTitle(initialTitle);
    setPrompt(initialPrompt);
    setUiMode(lockedMode ?? selection.mode);
    setMode(resolvedMode);
    setSubtype(
      lockedSubtype
        ?? (selection.mode === 'diagram' ? selection.subtype ?? getDefaultDiagramSubtype() : undefined)
    );
    setAutoResolved(null);
    setShowOptions(false);
    setOutlineOptions([]);
    setActiveVisualHint(undefined);
    setActiveFamily(null);
    setActiveFamilyLabel(null);
    setActiveFamilyDescription(null);
    setChartMakeSubtype(null);
    setVisualTheme('classic');
    setVisualStyle(undefined);
    setSelectedOptionKey(null);
    setOutlineGeneratedBy(null);
    setOutlineCreatedAt(null);
    setContent(initialContent ?? null);
    setStage(initialContent ? 'done' : 'idle');
    setError(null);
    setErrorIsPlanLimit(false);
    // PATCH-235: a Visualize request opens straight into Diagram + Show options.
    visualizeAutoRanRef.current = false;
    if (initialVisualize) {
      setUiMode('diagram');
      setMode('diagram');
      setSubtype(undefined);
      setShowOptions(true);
      setOutlineOptions([]);
      setSelectedOptionKey(null);
    }

    // PATCH-236: opening a stored infographic shows its designs, its template
    // preselected, with NO AI call (the shape is already stored).
    const storedInfographic = readStoredInfographic(initialContent);
    if (storedInfographic) {
      const options = suggestDesigns(storedInfographic.outline);
      setUiMode('diagram');
      setMode('diagram');
      setSubtype(undefined);
      setShowOptions(true);
      setOutlineOptions(options);
      setActiveOutline(storedInfographic.outline);
      // PATCH-238: preselect the stored theme (unknown/absent -> classic).
      setVisualTheme(themeById(storedInfographic.theme).id);
      // PATCH-253: preselect the stored style so the previews and panel show it.
      setVisualStyle(storedInfographic.style);
      // PATCH-241. An AntV template's suggestion key already carries `antv:`.
      setSelectedOptionKey(
        storedInfographic.template.startsWith('antv:')
          ? storedInfographic.template
          : `infographic:${storedInfographic.template}`,
      );
      setOutlineGeneratedBy(readAIGenerationAttribution(initialContent) ?? null);
      setOutlineCreatedAt(new Date().toISOString());
      visualizeAutoRanRef.current = true; // no auto-run for a stored shape
    }

    setCardColor(typeof initialMetadata?.cardColor === 'string' ? initialMetadata.cardColor : '#ffffff');
    setTopStrip(typeof initialMetadata?.topStrip === 'string' ? initialMetadata.topStrip : 'transparent');
    setTitleStyle((initialMetadata?.titleStyle as Record<string, unknown>) || {});
    setReactions(Array.isArray(initialMetadata?.reactions) ? initialMetadata.reactions as string[] : []);
    setDetachedComments(Array.isArray(initialMetadata?.detachedComments) ? initialMetadata.detachedComments as CommentDraft[] : []);
    setBadgeColor(typeof initialMetadata?.badgeColor === 'string' ? initialMetadata.badgeColor : '#facc15');
    setCommentTitle(typeof initialMetadata?.commentTitle === 'string' ? initialMetadata.commentTitle : undefined);
    setCommentTitleStyle((initialMetadata?.commentTitleStyle as CommentTitleStyle) || {});
    setCaption(typeof initialMetadata?.caption === 'string' ? initialMetadata.caption : '');
    setIsTextStyleOpen(false);
    setIsColorPanelOpen(false);
    setIsReactionPickerOpen(false);
    setIsCommentPanelOpen(false);
    setIsCaptionEditing(false);
    setActiveStyleTarget('title');
    setDetachedPopupPos(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialTitle, initialPrompt, initialContent, initialMetadata, initialVisualize]);

  const isLoading = stage === 'classifying' || stage === 'generating' || stage === 'rendering';

  // PATCH-254. The outline path (Show options and the family buttons) gets a calm
  // progress placeholder and a design skeleton instead of the generic spinner.
  // Every other mode keeps the spinner below.
  const isOutlineLoading = isLoading && mode === 'diagram' && showOptions;
  const outlineProgressText = stage === 'rendering' ? 'Drawing designs…' : 'Reading your text…';

  // PATCH-256. An outline request that failed with no designs on screen: the
  // preview area (where the user is looking) shows the message and Try again,
  // instead of silently falling back to the empty placeholder.
  const showPreviewError = showOptions && !!error && outlineOptions.length === 0 && !isLoading;

  // PATCH-252. The docked side panel's host element (callback ref) and whether
  // it is open, so the modal can widen while the panel is docked on the right.
  const [sidePanelHost, setSidePanelHost] = useState<HTMLDivElement | null>(null);
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  // PATCH-255. The window only widens while the suggestions panel is actually
  // rendered (the exact condition below, including the PATCH-254 loading case)
  // and reports itself open. Switching mode unmounts the panel but not its open
  // state, which used to strand an empty wide column on the right.
  const suggestionsMounted = showOptions && (outlineOptions.length > 0 || isOutlineLoading);
  const sidePanelVisible = sidePanelOpen && suggestionsMounted;

  // Read off the content in hand -- a fresh response, or a saved card that
  // recorded its own. Null while nothing has been generated, and the renderer
  // must then make no claim: the chooser above says what WILL run, which is a
  // different question from what did.
  const attribution = readAIGenerationAttribution(content);
  const attributionLine = attribution ? formatAIGenerationAttribution(attribution) : null;

  const modeConfig = getModeConfig(mode);
  const activeSubtype = mode === 'diagram' ? (subtype ?? getDefaultDiagramSubtype()) : undefined;
  const subtypeConfig = activeSubtype ? getDiagramSubtypeConfig(activeSubtype) : undefined;
  const placeholder = subtypeConfig?.placeholder ?? modeConfig.placeholder;
  const helperDescription = activeFamily
    ? (activeFamilyDescription ?? modeConfig.description)
    : showOptions
      ? 'Draw the same content several ways and pick one.'
      : (subtypeConfig?.description ?? modeConfig.description);
  // PATCH-237: Edit text redraws locally from the edited outline -- no AI call.
  const applyEditedOutline = (next: VisualOutline) => {
    setActiveOutline(next);
    setOutlineOptions(suggestDesigns(next, activeVisualHint ? { preferKey: activeVisualHint } : undefined));
  };

  // PATCH-257. A chart family on an outline with fewer than two real values gets
  // example numbers locally, so the Pie / Bar designs appear at once.
  const outlineValueCount = (activeOutline?.items ?? []).filter((item) => typeof item.value === 'number').length;
  const showExampleValues = activeFamily === 'chart' && outlineValueCount < 2;
  const derivedOutline = showExampleValues && activeOutline ? withExampleValues(activeOutline) : activeOutline;
  const derivedOptions = useMemo(
    () => (derivedOutline
      ? suggestDesigns(derivedOutline, activeVisualHint ? { preferKey: activeVisualHint } : undefined)
      : []),
    [derivedOutline, activeVisualHint],
  );
  const needsExampleEnvelopes = showExampleValues && derivedOutline !== activeOutline;

  // PATCH-237: Flow direction is local only; it re-derives the Flow option's code.
  const [flowDirection, setFlowDirection] = useState<'LR' | 'TD'>('LR');
  const directionOptions = (base: DesignSuggestion[]): DesignSuggestion[] =>
    base.map((option) => {
      if (option.key !== 'flow' || option.envelopeData.subtype !== 'flowchart' || !activeOutline) return option;
      return { ...option, envelopeData: { ...option.envelopeData, code: flowCode(activeOutline, flowDirection) } };
    });
  // PATCH-238: stamp the chosen theme onto every themed option (local, no AI).
  // PATCH-257. A chart drawn from example numbers uses the example designs
  // (derived from the example outline), so its tiles/preview carry real values.
  const themedOptions = (needsExampleEnvelopes ? derivedOptions : outlineOptions).map((option) => ({
    ...option,
    envelopeData: applyStyleToData(applyThemeToData(option.envelopeData, visualTheme), visualStyle),
  }));
  const displayOptions = directionOptions(themedOptions);

  // PATCH-257. The design actually shown in the preview (the one the panel will
  // select). Falling back only to a visible design -- never to an unrelated first
  // option the user cannot see -- is what makes Save trustworthy.
  const selectedOption = showOptions
    ? (
      displayOptions.find((option) => option.key === selectedOptionKey)
      ?? (activeFamily
        ? displayOptions.find((option) => familyForSubtype(option.envelopeData.subtype) === activeFamily) ?? null
        : displayOptions[0] ?? null)
    )
    : null;

  // PATCH-233: a chosen option saves exactly as a normal diagram generation of
  // that subtype would -- same envelope shape, so stored data is unchanged.
  const optionEnvelope = (option: DesignSuggestion): LoadedAIContent => ({
    mode: 'diagram',
    version: 1,
    data: applyStyleToData(applyThemeToData(option.envelopeData, visualTheme), visualStyle),
    meta: {
      renderer: option.envelopeData.renderer,
      subtype: option.envelopeData.subtype,
      prompt,
      createdAt: outlineCreatedAt ?? new Date().toISOString(),
      generatedBy: outlineGeneratedBy ?? undefined,
    },
  });
  const selectedOptionEnvelope = selectedOption ? optionEnvelope(selectedOption) : null;
  const persistedContent = showOptions
    ? serializeAIContentForPersistence(selectedOptionEnvelope)
    : serializeAIContentForPersistence(content);
  // PATCH-257. Save must follow the design actually shown in the preview: never
  // a fallback the user cannot see, and never a chart drawn from example numbers
  // (fewer than two real values).
  const chartPreviewIsExample = Boolean(
    selectedOption && isNumericChartOption(selectedOption) && outlineValueCount < 2,
  );
  const canSave = Boolean(persistedContent) && !isLoading && !chartPreviewIsExample;
  const saveDisabledReason = !showOptions || !selectedOption
    ? 'Nothing to save yet'
    : 'Make the chart or type your numbers first';

  const normalizedContent = normalizeAIContent(content);
  const photoCardData: PhotoCardData | null =
    normalizedContent.kind === 'structured' && normalizedContent.data.type === 'photo'
      ? normalizedContent.data
      : null;

  const photoCardTextStyle = photoCardData?.textStyle;
  const isPhotoCardBold = photoCardTextStyle?.fontWeight === '700' || photoCardTextStyle?.fontWeight === 'bold';
  const isPhotoCardItalic = photoCardTextStyle?.fontStyle === 'italic';
  const patchPhotoCardTextStyle = (patch: Partial<PhotoCardTextStyle>) => {
    if (!photoCardData) return;
    const nextData: PhotoCardData = { ...photoCardData, textStyle: { ...photoCardData.textStyle, ...patch } };
    const next = serializeAIContentForPersistence(nextData);
    if (next) setContent(next);
  };
  const applyPhotoCardPreset = (level: CaptionHeading) => {
    const prev = photoCardTextStyle || {};
    const selectedPreset = level === 'callout' && prev.backgroundColor
      ? { ...CAPTION_STYLE_PRESETS.callout, backgroundColor: prev.backgroundColor }
      : CAPTION_STYLE_PRESETS[level];
    patchPhotoCardTextStyle(selectedPreset);
  };

  // Whichever text the Text style button currently targets -- the post's
  // own title, or (when focused) the Photo Card's kicker/title/caption --
  // resolved once so the popup's props stay a simple pass-through below.
  const styleTarget = activeStyleTarget === 'photoCard' && photoCardData ? 'photoCard' : 'title';
  const textStylePopupProps = styleTarget === 'photoCard'
    ? {
      onSelectHeading: applyPhotoCardPreset,
      onSelectColor: (color: string) => patchPhotoCardTextStyle({ color }),
      onSelectHighlight: (color: string) => patchPhotoCardTextStyle({ backgroundColor: color }),
      currentHeading: photoCardTextStyle?.heading || 'normal',
      currentColor: photoCardTextStyle?.color,
      currentHighlight: photoCardTextStyle?.backgroundColor,
      onBold: () => patchPhotoCardTextStyle({ fontWeight: isPhotoCardBold ? '400' : '700' }),
      onItalic: () => patchPhotoCardTextStyle({ fontStyle: isPhotoCardItalic ? 'normal' : 'italic' }),
      onUnderline: () => patchPhotoCardTextStyle({ underline: !photoCardTextStyle?.underline }),
      onStrikethrough: () => patchPhotoCardTextStyle({ strikethrough: !photoCardTextStyle?.strikethrough }),
      onAlign: () => patchPhotoCardTextStyle({ textAlign: nextTextAlign(photoCardTextStyle?.textAlign || 'left') }),
      isBold: isPhotoCardBold,
      isItalic: isPhotoCardItalic,
      isUnderline: !!photoCardTextStyle?.underline,
      isStrikethrough: !!photoCardTextStyle?.strikethrough,
    }
    : {
      onSelectHeading: applyTitlePreset,
      onSelectColor: (color: string) => setTitleStyle((prev) => ({ ...prev, color })),
      onSelectHighlight: (color: string) => setTitleStyle((prev) => ({ ...prev, backgroundColor: color })),
      currentHeading: titleStyle.heading || 'normal',
      currentColor: titleStyle.color,
      currentHighlight: titleStyle.backgroundColor,
      onBold: toggleTitleBold,
      onItalic: toggleTitleItalic,
      onUnderline: toggleTitleUnderline,
      onStrikethrough: toggleTitleStrikethrough,
      onAlign: cycleTitleAlign,
      isBold: isTitleBold,
      isItalic: isTitleItalic,
      isUnderline: !!titleStyle.underline,
      isStrikethrough: !!titleStyle.strikethrough,
    };

  const stageMessage = (): string => {
    switch (stage) {
      case 'classifying':
        return 'Detecting best format...';
      case 'generating':
        return 'Generating structured content...';
      case 'rendering':
        return 'Preparing preview...';
      default:
        return '';
    }
  };

  const handleUIModeChange = (nextUiMode: UIMode) => {
    // If user manually picks a specific mode after auto-classification, track the correction
    if (autoResolved && nextUiMode !== 'auto') {
      trackAIAutoModeCorrectedByUser({
        suggestedMode: autoResolved.mode,
        suggestedSubtype: autoResolved.subtype,
        chosenMode: nextUiMode as AIMode,
        chosenSubtype: undefined,
      });
      setAutoResolved(null);
    }

    setUiMode(nextUiMode);
    setError(null);
    setErrorIsPlanLimit(false);
    // PATCH-233: changing mode invalidates any outline options.
    setShowOptions(false);
    setOutlineOptions([]);
    setSelectedOptionKey(null);
    setActiveFamily(null);
    setActiveFamilyLabel(null);
    setActiveFamilyDescription(null);
    setChartMakeSubtype(null);

    if (nextUiMode === 'auto') {
      // Don't change mode/subtype yet -- resolved at generate time
      return;
    }

    setMode(nextUiMode as AIMode);
    if (nextUiMode === 'diagram') {
      setSubtype((current) => current ?? getDefaultDiagramSubtype());
    } else {
      setSubtype(undefined);
    }
  };

  // PATCH-248. "Show options": show every design again, keeping the current
  // selection when it is still visible (nothing is fetched or cleared then).
  const showAllDesigns = () => {
    setActiveFamily(null);
    setActiveFamilyLabel(null);
    setActiveFamilyDescription(null);
    setChartMakeSubtype(null);
    setShowOptions(true);
    if (outlineOptions.length === 0) setSelectedOptionKey(null);
    setError(null);
    setErrorIsPlanLimit(false);
  };

  // PATCH-248. A subtype button opens the gallery filtered to its family. With
  // designs already on screen this is local (no fetch); before that it just
  // remembers the family so Generate draws the outline once, like Show options.
  const openFamily = (subtypeId: DiagramSubtype) => {
    const family = familyForSubtype(subtypeId);
    if (!family) return;
    setError(null);
    setErrorIsPlanLimit(false);
    setActiveFamily(family);
    setActiveFamilyLabel(getDiagramSubtypeConfig(subtypeId).label);
    setActiveFamilyDescription(getDiagramSubtypeConfig(subtypeId).description);
    setChartMakeSubtype(subtypeId === 'pie_chart' || subtypeId === 'bar_chart' ? subtypeId : null);
    setShowOptions(true);
    // PATCH-257. A subtype button selects the FIRST design of its own ordering,
    // even when the previous selection is still visible (pie -> bar must show a
    // bar, not the kept pie). The panel then picks the first of its sorted list.
    setSelectedOptionKey(null);
  };

  // PATCH-250. "Make pie/bar chart" on text without numbers asks the outline
  // route for estimated values and opens the chart designs; it never runs the
  // old single-picture generator.
  const makeChart = (chartSubtype: 'pie_chart' | 'bar_chart') => {
    setError(null);
    setErrorIsPlanLimit(false);
    setActiveFamily('chart');
    setActiveFamilyLabel(getDiagramSubtypeConfig(chartSubtype).label);
    setActiveFamilyDescription(getDiagramSubtypeConfig(chartSubtype).description);
    setChartMakeSubtype(chartSubtype);
    setShowOptions(true);
    void generate({ estimateValues: true });
  };

  // PATCH-253. Picking a preset theme clears any custom background / colours /
  // fonts, so the two panel sections never fight.
  const changeTheme = (id: VisualThemeId) => {
    setVisualTheme(id);
    setVisualStyle(undefined);
  };

  const generate = async (
    outlineOptionsBody?: OutlineRequestBody,
    componentOverride?: { subtype: DiagramSubtype },
  ) => {
    if (!prompt.trim()) return;

    setError(null);
    setErrorIsPlanLimit(false);

    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 55_000);

    // Auto mode: classify intent first, then generate with the resolved target
    const forcedSubtype = componentOverride?.subtype;
    let effectiveMode = forcedSubtype ? 'diagram' : mode;
    let effectiveSubtype = forcedSubtype ?? activeSubtype;

    if (!forcedSubtype && uiMode === 'auto') {
      setStage('classifying');
      try {
        const classifyRes = await fetch('/api/ai/classify-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // PATCH-188. Omitted when absent, never sent as undefined or ''.
          body: JSON.stringify({ prompt: prompt.trim(), ...(boardId ? { boardId } : {}) }),
          signal: controller.signal,
        });
        if (classifyRes.ok) {
          const classified: AutoResolved = await classifyRes.json();
          effectiveMode = classified.mode;
          effectiveSubtype = classified.subtype;
          setMode(classified.mode);
          setSubtype(classified.subtype);
          setAutoResolved(classified);
          trackAIAutoModeSelected({
            mode: classified.mode,
            subtype: classified.subtype,
            confidence: classified.confidence,
          });
        }
        // If classify fails, fall back to current mode (default lesson_board)
      } catch {
        // Non-fatal: continue with current mode
      }
    }

    // PATCH-233: "Show options" asks for the outline; the pictures are drawn
    // locally, so the AI draws nothing. One call, several options.
    // PATCH-248: a forced chart subtype always takes the component path below.
    if (!forcedSubtype && effectiveMode === 'diagram' && showOptions) {
      // PATCH-256. Remembered so the preview's Try again replays this request.
      lastOutlineRequestBodyRef.current = outlineOptionsBody;
      setStage('generating');
      try {
        const res = await fetch('/api/ai/generate-outline', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: prompt.trim(),
            ...(boardId ? { boardId } : {}),
            ...(outlineOptionsBody ? { options: outlineOptionsBody } : {}),
          }),
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          const planLimit = planLimitFromResponse(res.status, data);
          if (planLimit) {
            setError(planLimit.message);
            setErrorIsPlanLimit(true);
            setStage('error');
            return;
          }
          const message = getErrorMessage(data);
          if (isQuotaExceededMessage(message)) {
            throw new Error('API quota exceeded. Please try again later or upgrade your plan.');
          }
          throw new Error(message);
        }

        setStage('rendering');
        await new Promise((resolve) => setTimeout(resolve, 200));

        // PATCH-237 Addendum 1: the Apply hint must reach the ranking, and stay
        // for the session so local re-ranks keep the named design first.
        const preferKey = outlineOptionsBody?.visualHint;
        setActiveVisualHint(preferKey);
        const options = suggestDesigns(data.outline, preferKey ? { preferKey } : undefined);
        setOutlineOptions(options);
        setActiveOutline(data.outline);
        setSelectedOptionKey(options[0]?.key ?? null);
        setOutlineGeneratedBy((data.generatedBy as AIGenerationAttribution) ?? null);
        setOutlineCreatedAt(new Date().toISOString());
        setContent(null);
        setStage('done');
      } catch (err: unknown) {
        const e = err as Error;
        if (e.name === 'AbortError') {
          setError('Request timed out. Please try again.');
        } else {
          setError(e.message || 'Unknown error');
        }
        setStage('error');
      } finally {
        clearTimeout(timeout);
        abortRef.current = null;
      }
      return;
    }

    setStage('generating');

    if (isLocked) {
      trackAIRegenerationStarted({ mode: effectiveMode, subtype: effectiveSubtype });
    }

    try {
      const requestBody = buildRequestBody(prompt.trim(), effectiveMode, effectiveSubtype);
      const res = await fetch('/api/ai/generate-component', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // PATCH-188. Omitted when absent, never sent as undefined or ''.
        body: JSON.stringify({ ...requestBody, ...(boardId ? { boardId } : {}) }),
        signal: controller.signal,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // PATCH-188. A plan-limit refusal is the one failure with its own
        // message and the shared "See plans" link; every other failure keeps
        // this surface's existing text, including the quota-check branch below.
        const planLimit = planLimitFromResponse(res.status, data);
        if (planLimit) {
          setError(planLimit.message);
          setErrorIsPlanLimit(true);
          setStage('error');
          return;
        }
        const message = getErrorMessage(data);
        if (isQuotaExceededMessage(message)) {
          throw new Error('API quota exceeded. Please try again later or upgrade your plan.');
        }
        throw new Error(message);
      }

      setStage('rendering');
      await new Promise((resolve) => setTimeout(resolve, 200));

      setContent(data as LoadedAIContent);
      setStage('done');

      if (isLocked) {
        trackAIRegenerationSucceeded({ mode: effectiveMode, subtype: effectiveSubtype });
      }
    } catch (err: unknown) {
      const e = err as Error;
      if (e.name === 'AbortError') {
        setError('Request timed out. Please try again.');
      } else {
        setError(e.message || 'Unknown error');
      }
      setStage('error');
      if (isLocked) {
        trackAIRegenerationFailed({ mode: effectiveMode, subtype: effectiveSubtype, reason: (e.message || 'unknown') });
      }
    } finally {
      clearTimeout(timeout);
      abortRef.current = null;
    }
  };

  // PATCH-235: a Visualize request runs the outline exactly once per open.
  useEffect(() => {
    if (!isOpen || !initialVisualize || !showOptions) return;
    if (visualizeAutoRanRef.current) return;
    if (!prompt.trim()) return;
    visualizeAutoRanRef.current = true;
    void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialVisualize, showOptions]);

  const cancel = () => {
    abortRef.current?.abort();
    setStage(content ? 'done' : 'idle');
    setError(null);
    setErrorIsPlanLimit(false);
  };

  const handleSave = () => {
    if (!persistedContent) return;

    onSave({
      title: title.trim() || undefined,
      aiPrompt: prompt,
      aiComponentJson: persistedContent,
      metadata: {
        cardColor,
        topStrip,
        titleStyle,
        reactions,
        detachedComments,
        badgeColor,
        commentTitle,
        commentTitleStyle: Object.keys(commentTitleStyle).length > 0 ? commentTitleStyle : undefined,
        caption,
      },
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="flex max-h-[90vh] items-start gap-6" onClick={(e) => e.stopPropagation()}>
        {/* Left toolbar -- Text style/Color/Reaction/Comment/Caption, same
            detached-vertical-icon-strip placement every other post type
            (Note, Image, Clipart) uses, instead of buttons crowded into the
            header row. */}
        <div className="flex shrink-0 flex-col items-center gap-1 rounded-lg border border-gray-200 bg-white p-2 shadow-xl">
          <div className="flex shrink-0 flex-col items-center">
            <button
              type="button"
              onClick={() => openDetachedPanel('text', isTextStyleOpen)}
              className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${isTextStyleOpen ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}
              title={styleTarget === 'photoCard' ? 'Text style (Photo Card text)' : 'Text style'}
            >
              <Type className="h-5 w-5" />
            </button>
            <span className="mt-1 text-center text-[9px] leading-none text-gray-500">Text style</span>
            {isTextStyleOpen && detachedPopupPos && createPortal(
              <div
                className="fixed z-[1100] min-w-[240px] rounded-lg border border-gray-200 bg-white p-3 shadow-xl"
                style={{ left: detachedPopupPos.left, top: detachedPopupPos.top }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => setIsTextStyleOpen(false)}
                  className="absolute -right-3 -top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-md transition-all hover:text-gray-600"
                  title="Close"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <TextStylePopup
                  isOpen={isTextStyleOpen}
                  onOpenChange={setIsTextStyleOpen}
                  hideCloseButton
                  {...textStylePopupProps}
                />
              </div>,
              document.body,
            )}
          </div>

          <div className="flex shrink-0 flex-col items-center">
            <button
              type="button"
              onClick={() => openDetachedPanel('color', isColorPanelOpen)}
              className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${isColorPanelOpen ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}
              title="Color"
            >
              <Palette className="h-5 w-5" />
            </button>
            <span className="mt-1 text-center text-[9px] leading-none text-gray-500">Color</span>
            {isColorPanelOpen && detachedPopupPos && createPortal(
              <div
                className="fixed z-[1100]"
                style={{ left: detachedPopupPos.left, top: detachedPopupPos.top }}
                onClick={(e) => e.stopPropagation()}
              >
                <CardColorPanel
                  bgColor={cardColor}
                  topStrip={topStrip}
                  tabs={['bg', 'ts']}
                  onChangeTarget={(target, value) => {
                    if (target === 'bg') setCardColor(value);
                    if (target === 'ts') setTopStrip(value);
                  }}
                  onClose={() => setIsColorPanelOpen(false)}
                />
              </div>,
              document.body,
            )}
          </div>

          <div className="flex shrink-0 flex-col items-center">
            <button
              type="button"
              onClick={() => openDetachedPanel('reaction', isReactionPickerOpen)}
              className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${isReactionPickerOpen ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}
              title="Reaction"
            >
              <Smile className="h-5 w-5" />
            </button>
            <span className="mt-1 text-center text-[9px] leading-none text-gray-500">Reaction</span>
            {isReactionPickerOpen && detachedPopupPos && createPortal(
              <div
                className="fixed z-[1100]"
                style={{ left: detachedPopupPos.left, top: detachedPopupPos.top }}
                onClick={(e) => e.stopPropagation()}
              >
                <EmojiReactionPicker
                  isOpen={isReactionPickerOpen}
                  onOpenChange={setIsReactionPickerOpen}
                  onSelectEmoji={(emoji) => {
                    setReactions((prev) => [...prev, emoji]);
                    setIsReactionPickerOpen(false);
                  }}
                  inline
                />
              </div>,
              document.body,
            )}
          </div>

          <div className="relative flex shrink-0 flex-col items-center">
            <button
              type="button"
              onClick={() => openDetachedPanel('comment', isCommentPanelOpen)}
              className={`relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${isCommentPanelOpen ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}
              title="Comment"
            >
              <MessageSquare className="h-5 w-5" />
              {commentCount > 0 && (
                <span
                  className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-gray-800"
                  style={{ backgroundColor: badgeColor }}
                >
                  {commentCount}
                </span>
              )}
            </button>
            <span className="mt-1 text-center text-[9px] leading-none text-gray-500">Comment</span>
            {isCommentPanelOpen && detachedPopupPos && createPortal(
              <div
                className="fixed z-[1100]"
                style={{ left: detachedPopupPos.left, top: detachedPopupPos.top }}
                onClick={(e) => e.stopPropagation()}
              >
                <CommentPopup
                  isOpen={isCommentPanelOpen}
                  accessMode={accessMode}
                  onOpenChange={setIsCommentPanelOpen}
                  onSubmit={guardCommentMutation(accessMode, (commentText) => {
                    setDetachedComments((prev) => [...prev, {
                      id: `comment-${Date.now()}`,
                      text: commentText,
                      userId: currentUserId,
                      userName: currentUserName,
                      timestamp: Date.now(),
                    }]);
                  })}
                  onEditComment={guardCommentMutation(accessMode, (commentId, text) => {
                    setDetachedComments((prev) =>
                      prev.map((c) => (c.id === commentId ? { ...c, text } : c))
                    );
                  })}
                  onRemoveComment={guardCommentMutation(accessMode, (commentId) => {
                    setDetachedComments((prev) => prev.filter((c) => c.id !== commentId));
                  })}
                  onToggleCommentStrikethrough={guardCommentMutation(accessMode, (commentId) => {
                    setDetachedComments((prev) =>
                      prev.map((c) => (c.id === commentId ? { ...c, isStrikethrough: !c.isStrikethrough } : c))
                    );
                  })}
                  onCommentColor={guardCommentMutation(accessMode, (commentId, textColor, backgroundColor) => {
                    setDetachedComments((prev) =>
                      prev.map((c) => (c.id === commentId ? { ...c, textColor, backgroundColor } : c))
                    );
                  })}
                  comments={detachedComments}
                  currentUserId={currentUserId}
                  currentUserName={currentUserName}
                  badgeColor={badgeColor}
                  onBadgeColorChange={guardCommentMutation(accessMode, setBadgeColor)}
                  commentTitle={commentTitle}
                  commentTitleStyle={Object.keys(commentTitleStyle).length > 0 ? commentTitleStyle : undefined}
                  onCommentTitleChange={guardCommentMutation(accessMode, (nextTitle: string) => setCommentTitle(nextTitle === 'Comments' ? undefined : nextTitle))}
                  onCommentTitleStyleChange={guardCommentMutation(accessMode, (style: CommentTitleStyle) => setCommentTitleStyle(style))}
                  enableCanonicalSelectionStyling
                />
              </div>,
              document.body,
            )}
          </div>

          <div className="flex shrink-0 flex-col items-center">
            <button
              type="button"
              onClick={() => togglePanel('caption')}
              className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${isCaptionEditing ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}
              title="Caption (shown below the post, like Image posts)"
            >
              <TextCursor className="h-5 w-5" />
            </button>
            <span className="mt-1 text-center text-[9px] leading-none text-gray-500">Caption</span>
          </div>
        </div>

        <div className="relative">
          <button
            onClick={onClose}
            className="absolute -right-3 -top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-md transition-all hover:text-gray-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <div
            ref={modalRef}
            className={`flex max-h-[90vh] ${sidePanelVisible ? 'w-[1320px]' : 'w-[980px]'} max-w-[96vw] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl transition-[width] animate-in fade-in zoom-in duration-200`}
          >
        {/* Top strip -- Title lives inside it, same as the canvas card's own
            top strip, matching every other post type's edit window. AI
            components have no topStrip color concept, so this uses the same
            neutral gray every other type falls back to when unset. */}
        <div
          className="w-full flex-shrink-0 flex items-center px-3"
          style={{ minHeight: '22px', backgroundColor: 'rgba(0,0,0,0.04)' }}
        >
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onFocus={() => setActiveStyleTarget('title')}
            onSelect={(e) => {
              const el = e.currentTarget;
              if (el.selectionStart !== el.selectionEnd) openTextStyleForTitle();
            }}
            placeholder="Post name"
            className="w-full text-sm font-semibold text-gray-800 bg-transparent outline-none border-b border-transparent focus:border-blue-400 placeholder:opacity-40 placeholder:font-normal rounded px-1 -mx-1"
            style={titleInputStyle}
          />
        </div>
        <div className="flex items-center justify-between border-b bg-gray-50/50 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-purple-100 p-2">
              <Sparkles className="h-5 w-5 text-purple-600" />
            </div>
            <div className="flex flex-col">
              <h2 className="text-xl font-semibold text-gray-800">
                {isLocked ? 'Regenerate AI Component' : 'AI Component Generator'}
              </h2>
              {isLocked && (
                <span className="mt-0.5 text-xs text-purple-600">
                  Mode locked — same type will be regenerated
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="w-[360px] shrink-0 overflow-y-auto border-r bg-gray-50/30 p-6">
            <div className="space-y-5">
              {isLocked ? (
                <div className="flex items-center gap-2 rounded-xl border border-purple-200 bg-purple-50 px-4 py-3">
                  <Lock className="h-4 w-4 shrink-0 text-purple-500" />
                  <div>
                    <div className="text-sm font-semibold text-purple-900">{modeConfig.label}</div>
                    {activeSubtype && (
                      <div className="mt-0.5 text-xs text-purple-600">
                        {activeSubtype.replace('_', ' ')}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <label className="mb-3 block text-sm font-medium text-gray-700">
                      Choose a mode
                    </label>
                    <div className="grid gap-2">
                      {/* Auto mode option */}
                      <button
                        key="auto"
                        type="button"
                        onClick={() => handleUIModeChange('auto')}
                        disabled={isLoading}
                        className={`rounded-xl border px-4 py-3 text-left transition-all ${
                          uiMode === 'auto'
                            ? 'border-purple-500 bg-purple-50 shadow-sm'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                          <span>Auto</span>
                          <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">recommended</span>
                        </div>
                        <div className="mt-1 text-xs text-gray-500">Picks the best format for your prompt — shown before generating.</div>
                      </button>

                      {(Object.keys(MODE_REGISTRY) as AIMode[]).map((modeId) => {
                        const config = MODE_REGISTRY[modeId];
                        const isSelected = uiMode === modeId;

                        return (
                          <button
                            key={modeId}
                            type="button"
                            onClick={() => handleUIModeChange(modeId)}
                            disabled={isLoading}
                            className={`rounded-xl border px-4 py-3 text-left transition-all ${
                              isSelected
                                ? 'border-purple-500 bg-purple-50 shadow-sm'
                                : 'border-gray-200 bg-white hover:border-gray-300'
                            }`}
                          >
                            <div className="text-sm font-semibold text-gray-900">{config.label}</div>
                            <div className="mt-1 text-xs text-gray-500">{config.description}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Auto-resolved badge — shown after classification */}
                  {uiMode === 'auto' && autoResolved && (
                    <div className={`rounded-xl border px-4 py-3 ${
                      autoResolved.confidence === 'low'
                        ? 'border-amber-200 bg-amber-50'
                        : 'border-purple-200 bg-purple-50'
                    }`}>
                      <div className="flex items-center gap-2">
                        <Sparkles className={`h-4 w-4 shrink-0 ${autoResolved.confidence === 'low' ? 'text-amber-500' : 'text-purple-500'}`} />
                        <div>
                          <span className={`text-[11px] font-medium ${autoResolved.confidence === 'low' ? 'text-amber-600' : 'text-purple-500'}`}>
                            Auto selected
                          </span>
                          <span className={`ml-1.5 font-semibold capitalize text-sm ${autoResolved.confidence === 'low' ? 'text-amber-900' : 'text-purple-900'}`}>
                            {autoResolved.mode.replace(/_/g, ' ')}
                            {autoResolved.subtype ? ` \u2192 ${autoResolved.subtype.replace(/_/g, ' ')}` : ''}
                          </span>
                        </div>
                      </div>
                      {autoResolved.confidence === 'low' && (
                        <p className="mt-1.5 text-[11px] text-amber-600">
                          Low confidence — not sure this is the best format. Choose a mode above to override.
                        </p>
                      )}
                    </div>
                  )}

                  {uiMode !== 'auto' && mode === 'diagram' && (
                    <div>
                      <label className="mb-3 block text-sm font-medium text-gray-700">
                        Diagram subtype
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {(() => {
                          const diagramConfig = MODE_REGISTRY.diagram;
                          if (!isDiagramModeConfig(diagramConfig)) return null;
                          return (
                            <>
                              {/* PATCH-233: one outline call, several pictures. */}
                              <button
                                key="options"
                                type="button"
                                data-ai-subtype-chip="options"
                                aria-pressed={showOptions && !activeFamily}
                                onClick={showAllDesigns}
                                disabled={isLoading}
                                className={`rounded-xl border px-3 py-3 text-left transition-all ${
                                  showOptions && !activeFamily
                                    ? 'border-purple-500 bg-purple-50 shadow-sm'
                                    : 'border-gray-200 bg-white hover:border-gray-300'
                                }`}
                              >
                                <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                                  <span>Show options</span>
                                  <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">recommended</span>
                                </div>
                                <div className="mt-1 text-[11px] text-gray-500">Draw the same content several ways and pick one.</div>
                              </button>
                              {(Object.keys(diagramConfig.subtypes) as DiagramSubtype[])
                                // PATCH-236: an infographic is only produced by Show options.
                                .filter((subtypeId) => subtypeId !== 'infographic')
                                .map((subtypeId) => {
                                const config = diagramConfig.subtypes[subtypeId];
                                // PATCH-248: a clicked family button stays selected
                                // while its designs are shown; chart subtypes keep
                                // whichever of pie/bar was clicked.
                                const isSelected = activeFamily
                                  ? (subtypeId === 'pie_chart' || subtypeId === 'bar_chart'
                                    ? subtypeId === chartMakeSubtype
                                    : familyForSubtype(subtypeId) === activeFamily)
                                  : (!showOptions && activeSubtype === subtypeId);

                                return (
                                  <button
                                    key={subtypeId}
                                    type="button"
                                    data-ai-subtype-chip={subtypeId}
                                    aria-pressed={isSelected}
                                    onClick={() => openFamily(subtypeId)}
                                    disabled={isLoading}
                                    className={`rounded-xl border px-3 py-3 text-left transition-all ${
                                      isSelected
                                        ? 'border-purple-500 bg-purple-50 shadow-sm'
                                        : 'border-gray-200 bg-white hover:border-gray-300'
                                    }`}
                                  >
                                    <div className="text-sm font-semibold text-gray-900">{config.label}</div>
                                    <div className="mt-1 text-[11px] text-gray-500">{config.description}</div>
                                  </button>
                                );
                              })}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                </>
              )}

              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label className="block text-sm font-medium text-gray-700">
                    What should the AI build?
                  </label>
                  {/* The model this surface uses, changeable here rather than
                      only in Settings. It writes the Component Generation role
                      preference the server resolves per request -- for the
                      classifier and the generation alike -- so the requests
                      themselves are unchanged: no provider, model or key
                      travels with them. */}
                  <AIRoleModelChooser
                    role={AI_ROLE_COMPONENT}
                    label="Component model"
                    attributePrefix="ai-component"
                    saveErrorMessage="Could not change the model."
                    disabled={isLoading}
                    onError={setModelError}
                  />
                </div>
                {modelError && (
                  <div role="alert" className="mb-2 text-xs text-red-600">{modelError}</div>
                )}
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={placeholder}
                  className="h-40 w-full resize-none rounded-xl border border-gray-300 p-3 text-sm outline-none transition-all shadow-sm focus:border-transparent focus:ring-2 focus:ring-purple-500"
                  disabled={isLoading}
                />
                <p data-ai-prompt-helper="true" className="mt-2 text-xs text-gray-500">{helperDescription}</p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => { void generate(); }}
                  disabled={isLoading || !prompt.trim() || (uiMode !== 'auto' && mode === 'diagram' && !activeSubtype)}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 font-medium transition-all ${
                    isLoading || !prompt.trim() || (uiMode !== 'auto' && mode === 'diagram' && !activeSubtype)
                      ? 'cursor-not-allowed bg-gray-200 text-gray-400'
                      : 'bg-purple-600 text-white shadow-lg shadow-purple-200 hover:bg-purple-700 active:scale-95'
                  }`}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      {stage === 'generating' ? 'Generating...' : 'Rendering...'}
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 fill-current" />
                      {stage === 'done' || stage === 'error' ? 'Regenerate' : 'Generate'}
                    </>
                  )}
                </button>

                {isLoading && (
                  <button
                    onClick={cancel}
                    title="Cancel"
                    className="rounded-xl bg-red-50 px-3 py-3 text-red-500 transition-colors hover:bg-red-100"
                  >
                    <StopCircle className="h-5 w-5" />
                  </button>
                )}
              </div>

              {error && (
                <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm">
                  {errorIsPlanLimit
                    ? <PlanLimitNotice message={error} />
                    : <p className="text-xs text-red-600">{error}</p>}
                </div>
              )}

              {/* WAS a hardcoded "Generated by DeepSeek". It named a provider
                  nobody had read, and once the chooser above exists it would
                  have been wrong for any user who moved this role. It now
                  reports what the server said actually ran, and says nothing
                  at all until something has. */}
              <div
                className="border-t border-gray-100 pt-6 text-[11px] italic text-gray-400"
                data-ai-component-attribution=""
              >
                {attributionLine ?? 'The model that answers is named here once you generate.'}
              </div>
            </div>
          </div>

          <div className="flex flex-1 flex-col overflow-hidden bg-white p-6">
            <label className="block text-sm font-medium text-gray-700">Preview</label>

            <div className="relative mt-4 flex-1 overflow-hidden rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/50 shadow-inner">
              {isLoading && isOutlineLoading && (
                <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3">
                  {outlineOptions.length === 0 && (
                    <div
                      aria-hidden="true"
                      className="h-40 w-60 max-w-[80%] rounded-2xl bg-gray-200 animate-pulse motion-reduce:animate-none"
                    />
                  )}
                  <p data-ai-outline-progress="true" aria-live="polite" className="font-medium text-gray-600">
                    {outlineProgressText}
                  </p>
                </div>
              )}

              {isLoading && !isOutlineLoading && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/80">
                  <div className="h-12 w-12 animate-spin rounded-full border-4 border-purple-200 border-t-purple-600" />
                  <p className="font-medium text-purple-600 animate-pulse">{stageMessage()}</p>
                </div>
              )}

              {!content && !isLoading && !(showOptions && outlineOptions.length > 0) && !showPreviewError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
                    <Sparkles className="h-8 w-8 text-gray-300" />
                  </div>
                  {activeFamilyLabel && showOptions && outlineOptions.length === 0 ? (
                    <p className="text-sm text-gray-500">
                      {activeFamilyLabel} selected – write or paste your text and press Generate.
                    </p>
                  ) : (
                    <>
                      <p className="text-sm text-gray-400">Your component will appear here</p>
                      {EXAMPLE_PROMPTS[uiMode as keyof typeof EXAMPLE_PROMPTS] && (
                        <p className="mt-3 text-xs text-gray-400">
                          Try:{' '}
                          <button
                            type="button"
                            className="italic text-purple-400 hover:text-purple-600 hover:underline"
                            onClick={() => setPrompt(EXAMPLE_PROMPTS[uiMode as keyof typeof EXAMPLE_PROMPTS]!)}
                          >
                            &ldquo;{EXAMPLE_PROMPTS[uiMode as keyof typeof EXAMPLE_PROMPTS]}&rdquo;
                          </button>
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* PATCH-256. A failed outline with no designs yet shows its
                  message here, where the user is looking, plus a Try again that
                  replays the same request. */}
              {showPreviewError && error && (
                <div
                  data-ai-preview-error="true"
                  className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 px-6 text-center"
                >
                  <div className="w-full max-w-md rounded-xl border border-red-100 bg-red-50 p-4 text-sm">
                    {errorIsPlanLimit
                      ? <PlanLimitNotice message={error} />
                      : <p className="text-sm text-red-600">{error}</p>}
                  </div>
                  <button
                    type="button"
                    data-ai-preview-retry="true"
                    onClick={() => { void generate(lastOutlineRequestBodyRef.current); }}
                    className="rounded-xl bg-purple-600 px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-purple-200 transition-all hover:bg-purple-700 active:scale-95"
                  >
                    Try again
                  </button>
                </div>
              )}

              {/* PATCH-236: the Suggestions panel -- one large preview of the
                  selected design, then "Suggested" and per-category headings. */}
              {showOptions && (outlineOptions.length > 0 || isOutlineLoading) && (
                <OutlineSuggestionsPanel
                  options={displayOptions}
                  selectedKey={selectedOptionKey}
                  onSelect={setSelectedOptionKey}
                  envelopeFor={(option) => optionEnvelope(option)}
                  outline={needsExampleEnvelopes ? derivedOutline : activeOutline}
                  onEditOutline={applyEditedOutline}
                  flowDirection={flowDirection}
                  onFlowDirectionChange={setFlowDirection}
                  onApplyCustomize={(options) => { void generate(options); }}
                  theme={visualTheme}
                  onThemeChange={changeTheme}
                  visualStyle={visualStyle}
                  onVisualStyleChange={setVisualStyle}
                  familyFilter={activeFamily}
                  familyLabel={activeFamilyLabel}
                  onShowAll={showAllDesigns}
                  onMakeChart={makeChart}
                  makeChartSubtype={chartMakeSubtype ?? undefined}
                  exampleValues={showExampleValues}
                  loading={isOutlineLoading}
                  sidePanelHost={sidePanelHost}
                  onSidePanelChange={setSidePanelOpen}
                />
              )}

              {!showOptions && !!content && (
                <div className="h-full w-full overflow-auto p-4">
                  <AIContentRenderer
                    content={content}
                    editable
                    onContentChange={(nextData: AIContentData) => {
                      const next = serializeAIContentForPersistence(nextData);
                      if (next) setContent(next);
                    }}
                    onFocusField={() => setActiveStyleTarget('photoCard')}
                  />

                  {/* Reactions, then caption -- same order and spacing as
                      the Image post's own preview, below the AI content
                      (image + any text it kept) rather than floating over
                      it in a separate popup. */}
                  {reactions.length > 0 && (
                    <div className="mt-3 px-1">
                      <ReactionDisplay
                        reactions={reactions}
                        onAddClick={() => openDetachedPanel('reaction', isReactionPickerOpen)}
                        onReactionClick={(emoji) => {
                          setReactions((prev) => {
                            const index = prev.indexOf(emoji);
                            if (index === -1) return prev;
                            return [...prev.slice(0, index), ...prev.slice(index + 1)];
                          });
                        }}
                      />
                    </div>
                  )}
                  <div className="mt-3">
                    <InlineCaption
                      value={caption}
                      isEditing={isCaptionEditing}
                      onChange={setCaption}
                      onCommit={() => setIsCaptionEditing(false)}
                      placeholder="Add a caption..."
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
              <button
                onClick={onClose}
                className="rounded-xl px-6 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!canSave}
                title={canSave ? undefined : saveDisabledReason}
                className={`flex items-center gap-2 rounded-xl px-8 py-2.5 text-sm font-medium transition-all ${
                  !canSave
                    ? 'cursor-not-allowed bg-gray-100 text-gray-400'
                    : 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 hover:bg-indigo-700 active:scale-95'
                }`}
              >
                <Save className="h-4 w-4" />
                Save to Canvas
              </button>
            </div>
          </div>

          {/* PATCH-252. The docked panel host is a sibling of the preview column
              in the main row, so it sits to the RIGHT of the picture, not below
              it inside the dashed box; the panel portals into it. */}
          {sidePanelVisible && (
            <div
              ref={setSidePanelHost}
              data-ai-side-panel-host="true"
              className="relative w-[340px] shrink-0 border-l border-gray-200 bg-white"
            />
          )}
        </div>
      </div>
      </div>
    </div>
    </div>
  );
}
