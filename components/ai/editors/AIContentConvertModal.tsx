'use client';

import React, { useEffect, useState } from 'react';
import { ArrowRight, RefreshCw, Save, X } from 'lucide-react';

import AIContentRenderer from '@/components/ai/AIContentRenderer';
import type {
  AIMode,
  DiagramSubtype,
  LoadedAIContent,
  StoredAIContent,
} from '@/lib/ai/contracts';
import type { ConversionTarget } from '@/lib/ai/conversion-matrix';
import { getConversionTargets } from '@/lib/ai/conversion-matrix';
import { serializeAIContentForPersistence } from '@/lib/ai/persistence';
import {
  trackAIConversionFailed,
  trackAIConversionStarted,
  trackAIConversionSucceeded,
} from '@/lib/ai/telemetry';

export interface AIContentConvertModalProps {
  isOpen: boolean;
  onClose: () => void;
  envelope: StoredAIContent;
  initialPrompt?: string;
  onSave: (data: { aiPrompt: string; aiComponentJson: LoadedAIContent }) => void;
}

type ConvertPhase =
  | { kind: 'select' }
  | { kind: 'converting' }
  | { kind: 'preview'; result: StoredAIContent }
  | { kind: 'error'; message: string };

function getSourceSubtype(envelope: StoredAIContent): DiagramSubtype | undefined {
  if (envelope.mode !== 'diagram') return undefined;
  const subtype = (envelope.data as unknown as Record<string, unknown>).subtype;
  return typeof subtype === 'string' ? (subtype as DiagramSubtype) : undefined;
}

function getSourceLabel(envelope: StoredAIContent): string {
  const mode = envelope.mode;
  const subtype = getSourceSubtype(envelope);
  if (subtype) return `${mode} / ${subtype.replace('_', ' ')}`;
  return mode.replace('_', ' ');
}

function getTargetLabel(target: ConversionTarget): string {
  if (target.subtype) return target.label;
  return target.mode.replace('_', ' ');
}

export default function AIContentConvertModal({
  isOpen,
  onClose,
  envelope,
  initialPrompt = '',
  onSave,
}: AIContentConvertModalProps) {
  const [phase, setPhase] = useState<ConvertPhase>({ kind: 'select' });
  const [selectedTarget, setSelectedTarget] = useState<ConversionTarget | null>(null);
  const [instruction, setInstruction] = useState('');

  const sourceSubtype = getSourceSubtype(envelope);
  const allowedTargets = getConversionTargets(envelope.mode, sourceSubtype);

  // Reset when opened
  useEffect(() => {
    if (isOpen) {
      setPhase({ kind: 'select' });
      setInstruction('');
      setSelectedTarget(allowedTargets.length === 1 ? allowedTargets[0] : null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleConvert() {
    if (!selectedTarget) return;

    const targetMode = selectedTarget.mode;
    const targetSubtype = selectedTarget.subtype;

    trackAIConversionStarted({
      sourceMode: envelope.mode,
      sourceSubtype,
      targetMode,
      targetSubtype,
    });

    setPhase({ kind: 'converting' });

    try {
      const res = await fetch('/api/ai/convert-component', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceEnvelope: envelope,
          targetMode,
          targetSubtype,
          instruction: instruction.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Conversion failed.' }));
        const msg = typeof body?.error === 'string' ? body.error : 'Conversion failed.';
        trackAIConversionFailed({
          sourceMode: envelope.mode,
          sourceSubtype,
          targetMode,
          targetSubtype,
          reason: msg,
        });
        setPhase({ kind: 'error', message: msg });
        return;
      }

      const result: StoredAIContent = await res.json();
      trackAIConversionSucceeded({
        sourceMode: envelope.mode,
        sourceSubtype,
        targetMode,
        targetSubtype,
      });
      setPhase({ kind: 'preview', result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Conversion failed.';
      trackAIConversionFailed({
        sourceMode: envelope.mode,
        sourceSubtype,
        targetMode,
        targetSubtype: selectedTarget.subtype,
        reason: msg,
      });
      setPhase({ kind: 'error', message: msg });
    }
  }

  function handleSave() {
    if (phase.kind !== 'preview') return;
    const persisted = serializeAIContentForPersistence(phase.result);
    if (!persisted) return;
    onSave({ aiPrompt: initialPrompt, aiComponentJson: persisted });
    onClose();
  }

  function handleRetry() {
    setPhase({ kind: 'select' });
  }

  const isConverting = phase.kind === 'converting';
  const hasPreview = phase.kind === 'preview';
  const hasError = phase.kind === 'error';
  const canConvert = !!selectedTarget && !isConverting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="relative flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        style={{ maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Convert Content</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Source: <span className="font-medium capitalize text-gray-700">{getSourceLabel(envelope)}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1">
          {/* Left pane — controls */}
          <div className="flex w-80 shrink-0 flex-col gap-5 overflow-y-auto border-r border-gray-100 px-6 py-5">

            {/* Target selector */}
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Convert to</p>
              <p className="text-xs text-gray-400">Only compatible formats are shown. Preview the result before saving.</p>
              {allowedTargets.length === 0 ? (
                <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
                  No compatible conversion targets for this content type.
                </p>
              ) : (
                <div className="space-y-2">
                  {allowedTargets.map((target) => {
                    const key = `${target.mode}:${target.subtype ?? ''}`;
                    const isSelected = selectedTarget?.mode === target.mode && selectedTarget?.subtype === target.subtype;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          if (!isConverting && !hasPreview) setSelectedTarget(target);
                        }}
                        disabled={isConverting || hasPreview}
                        className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${
                          isSelected
                            ? 'border-indigo-400 bg-indigo-50'
                            : 'border-gray-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40'
                        } disabled:cursor-default disabled:opacity-60`}
                      >
                        <div className="text-sm font-semibold capitalize text-gray-900">
                          {getTargetLabel(target)}
                        </div>
                        <div className="mt-0.5 text-xs text-gray-500 capitalize">
                          {target.mode.replace('_', ' ')}
                          {target.subtype ? ` — ${target.subtype.replace('_', ' ')}` : ''}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Optional instruction */}
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Extra instruction <span className="font-normal normal-case text-gray-400">(optional)</span>
              </p>
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                disabled={isConverting || hasPreview}
                placeholder="e.g. focus on the top 5 items only"
                rows={3}
                className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-xs outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-300 disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>

            {/* Error message */}
            {hasError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-xs font-medium text-red-700">Conversion failed</p>
                <p className="mt-1 text-xs text-red-600">{phase.message}</p>
              </div>
            )}

            {/* Spacer */}
            <div className="flex-1" />

            {/* Action buttons */}
            <div className="space-y-2 pt-2">
              {!hasPreview && (
                <button
                  type="button"
                  onClick={hasError ? handleRetry : handleConvert}
                  disabled={!canConvert && !hasError}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isConverting ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Converting…
                    </>
                  ) : hasError ? (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      Try again
                    </>
                  ) : (
                    <>
                      <ArrowRight className="h-4 w-4" />
                      Convert
                    </>
                  )}
                </button>
              )}

              {hasPreview && (
                <>
                  <button
                    type="button"
                    onClick={handleSave}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
                  >
                    <Save className="h-4 w-4" />
                    Save converted
                  </button>
                  <button
                    type="button"
                    onClick={handleRetry}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Try again
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Right pane — preview */}
          <div className="flex flex-1 flex-col overflow-y-auto">
            {/* Source preview header */}
            <div className="grid shrink-0 grid-cols-2 border-b border-gray-100">
              <div className="border-r border-gray-100 px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Before</p>
              </div>
              <div className="px-4 py-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                  {hasPreview ? 'After' : 'Preview will appear here'}
                </p>
              </div>
            </div>

            <div className="grid flex-1 grid-cols-2 divide-x divide-gray-100">
              {/* Source */}
              <div className="overflow-auto p-4">
                <AIContentRenderer content={envelope} />
              </div>

              {/* Converted */}
              <div className="overflow-auto p-4">
                {isConverting && (
                  <div className="flex h-full items-center justify-center">
                    <div className="flex flex-col items-center gap-3 text-center">
                      <RefreshCw className="h-8 w-8 animate-spin text-indigo-400" />
                      <p className="text-sm text-gray-500">Converting…</p>
                    </div>
                  </div>
                )}
                {hasPreview && (
                  <AIContentRenderer content={phase.result} />
                )}
                {!isConverting && !hasPreview && (
                  <div className="flex h-full items-center justify-center">
                    <p className="text-sm text-gray-400">
                      {selectedTarget
                        ? `Select Convert to see the ${getTargetLabel(selectedTarget)} preview`
                        : 'Choose a target format'}
                    </p>
                  </div>
                )}
                {hasError && (
                  <div className="flex h-full items-center justify-center">
                    <p className="text-sm text-gray-400">Conversion failed. Try again.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
