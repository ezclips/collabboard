'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, X, Loader2, Play, Save, StopCircle, Lock } from 'lucide-react';

import AIContentRenderer from '@/components/ai/AIContentRenderer';
import type {
  AIMode,
  DiagramSubtype,
  GenerateAIContentRequest,
  LoadedAIContent,
} from '@/lib/ai/contracts';
import {
  MODE_REGISTRY,
  getDiagramSubtypeConfig,
  getModeConfig,
  isDiagramModeConfig,
} from '@/lib/ai/mode-registry';
import { normalizeAIContent } from '@/lib/ai/normalize-ai-content';
import { serializeAIContentForPersistence } from '@/lib/ai/persistence';
import {
  trackAIAutoModeCorrectedByUser,
  trackAIAutoModeSelected,
  trackAIRegenerationFailed,
  trackAIRegenerationStarted,
  trackAIRegenerationSucceeded,
} from '@/lib/ai/telemetry';

type Stage = 'idle' | 'classifying' | 'generating' | 'rendering' | 'done' | 'error';

// 'auto' is a UI-only sentinel — it is resolved to a concrete AIMode before generation
type UIMode = AIMode | 'auto';

interface AutoResolved {
  mode: AIMode;
  subtype?: DiagramSubtype;
  confidence: 'high' | 'low';
}

interface AIComponentEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    aiPrompt: string;
    aiComponentJson?: LoadedAIContent;
    aiComponentCode?: string;
    aiRawCode?: string;
  }) => void;
  initialPrompt?: string;
  initialContent?: unknown;
  // When set, mode and subtype selectors are locked (regenerate flow)
  lockedMode?: AIMode;
  lockedSubtype?: DiagramSubtype;
}

function isQuotaExceededMessage(message: string) {
  return /quota|exceeded.*quota|rate.?limit/i.test(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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
  initialPrompt = '',
  initialContent,
  lockedMode,
  lockedSubtype,
}: AIComponentEditorProps) {
  const isLocked = Boolean(lockedMode);

  const initialSelection = useMemo(
    () => inferInitialSelection(initialContent),
    [initialContent],
  );

  const [prompt, setPrompt] = useState(initialPrompt);
  const [uiMode, setUiMode] = useState<UIMode>(lockedMode ?? initialSelection.mode);
  const [mode, setMode] = useState<AIMode>(lockedMode ?? initialSelection.mode);
  const [subtype, setSubtype] = useState<DiagramSubtype | undefined>(lockedSubtype ?? initialSelection.subtype);
  const [autoResolved, setAutoResolved] = useState<AutoResolved | null>(null);
  const [content, setContent] = useState<unknown>(initialContent ?? null);
  const [stage, setStage] = useState<Stage>(initialContent ? 'done' : 'idle');
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const selection = inferInitialSelection(initialContent);
    const resolvedMode = lockedMode ?? selection.mode;
    setPrompt(initialPrompt);
    setUiMode(lockedMode ?? selection.mode);
    setMode(resolvedMode);
    setSubtype(
      lockedSubtype
        ?? (selection.mode === 'diagram' ? selection.subtype ?? getDefaultDiagramSubtype() : undefined)
    );
    setAutoResolved(null);
    setContent(initialContent ?? null);
    setStage(initialContent ? 'done' : 'idle');
    setError(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialPrompt, initialContent]);

  const isLoading = stage === 'classifying' || stage === 'generating' || stage === 'rendering';

  const modeConfig = getModeConfig(mode);
  const activeSubtype = mode === 'diagram' ? (subtype ?? getDefaultDiagramSubtype()) : undefined;
  const subtypeConfig = activeSubtype ? getDiagramSubtypeConfig(activeSubtype) : undefined;
  const placeholder = subtypeConfig?.placeholder ?? modeConfig.placeholder;
  const helperDescription = subtypeConfig?.description ?? modeConfig.description;
  const persistedContent = serializeAIContentForPersistence(content);
  const canSave = Boolean(persistedContent) && !isLoading;

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

  const generate = async () => {
    if (!prompt.trim()) return;

    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 55_000);

    // Auto mode: classify intent first, then generate with the resolved target
    let effectiveMode = mode;
    let effectiveSubtype = activeSubtype;

    if (uiMode === 'auto') {
      setStage('classifying');
      try {
        const classifyRes = await fetch('/api/ai/classify-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: prompt.trim() }),
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

    setStage('generating');

    if (isLocked) {
      trackAIRegenerationStarted({ mode: effectiveMode, subtype: effectiveSubtype });
    }

    try {
      const requestBody = buildRequestBody(prompt.trim(), effectiveMode, effectiveSubtype);
      const res = await fetch('/api/ai/generate-component', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
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

  const cancel = () => {
    abortRef.current?.abort();
    setStage(content ? 'done' : 'idle');
    setError(null);
  };

  const handleSave = () => {
    if (!persistedContent) return;

    onSave({
      aiPrompt: prompt,
      aiComponentJson: persistedContent,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        className="flex max-h-[90vh] w-[980px] max-w-[94vw] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in duration-200"
        onClick={(e) => e.stopPropagation()}
      >
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
          <button onClick={onClose} className="rounded-full p-2 transition-colors hover:bg-gray-200">
            <X className="h-5 w-5 text-gray-500" />
          </button>
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
                          return (Object.keys(diagramConfig.subtypes) as DiagramSubtype[]).map((subtypeId) => {
                          const config = diagramConfig.subtypes[subtypeId];
                          const isSelected = activeSubtype === subtypeId;

                          return (
                            <button
                              key={subtypeId}
                              type="button"
                              onClick={() => setSubtype(subtypeId)}
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
                        });
                        })()}
                      </div>
                    </div>
                  )}
                </>
              )}

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  What should the AI build?
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={placeholder}
                  className="h-40 w-full resize-none rounded-xl border border-gray-300 p-3 text-sm outline-none transition-all shadow-sm focus:border-transparent focus:ring-2 focus:ring-purple-500"
                  disabled={isLoading}
                />
                <p className="mt-2 text-xs text-gray-500">{helperDescription}</p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={generate}
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
                  <p className="text-xs text-red-600">{error}</p>
                </div>
              )}

              <div className="border-t border-gray-100 pt-6 text-[11px] italic text-gray-400">
                Generated by DeepSeek
              </div>
            </div>
          </div>

          <div className="flex flex-1 flex-col overflow-hidden bg-white p-6">
            <label className="block text-sm font-medium text-gray-700">Preview</label>

            <div className="relative mt-4 flex-1 overflow-hidden rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/50 shadow-inner">
              {isLoading && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/80">
                  <div className="h-12 w-12 animate-spin rounded-full border-4 border-purple-200 border-t-purple-600" />
                  <p className="font-medium text-purple-600 animate-pulse">{stageMessage()}</p>
                </div>
              )}

              {!content && !isLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
                    <Sparkles className="h-8 w-8 text-gray-300" />
                  </div>
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
                </div>
              )}

              {!!content && (
                <div className="h-full w-full overflow-auto p-4">
                  <AIContentRenderer content={content} />
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
        </div>
      </div>
    </div>
  );
}
