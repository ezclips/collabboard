'use client';

import React, { useCallback, useEffect, useState } from 'react';
import type { LayoutType } from '@/types/collabboard';
import {
  createApplyBoardTemplateCommand,
  type BoardTemplate,
} from '@/lib/domain/canvas/boardTemplates';
import { createPostsRepository } from '@/lib/infra/canvas/postsRepository';
import { templatesForLayout } from '@/lib/collabboard/templates/registry';

const EMPTY_SELECTION = 'empty';

export interface BoardTemplatePickerProps {
  boardId: string;
  layout: LayoutType | null | undefined;
  postCount: number;
  postsLoaded: boolean;
  canEdit: boolean;
  onApplied?: () => void;
}

function dismissedKey(boardId: string): string {
  return `fable.templatePicker.dismissed.${boardId}`;
}

/** Every storage access is guarded: without storage the picker simply shows again. */
function readDismissed(boardId: string): boolean {
  try {
    return window.localStorage.getItem(dismissedKey(boardId)) !== null;
  } catch {
    return false;
  }
}

export default function BoardTemplatePicker({
  boardId,
  layout,
  postCount,
  postsLoaded,
  canEdit,
  onApplied,
}: BoardTemplatePickerProps) {
  const group = templatesForLayout(layout);
  const [dismissed, setDismissed] = useState(false);
  const [selected, setSelected] = useState<string>(EMPTY_SELECTION);
  const [applying, setApplying] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setDismissed(readDismissed(boardId));
    setSelected(EMPTY_SELECTION);
    setApplying(false);
    setFailed(false);
  }, [boardId]);

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(dismissedKey(boardId), '1');
    } catch {
      // Without storage the picker simply shows again next visit.
    }
    setDismissed(true);
  }, [boardId]);

  const selectedTemplate: BoardTemplate | undefined =
    selected === EMPTY_SELECTION ? undefined : group?.templates.find((template) => template.id === selected);

  const apply = useCallback(async () => {
    if (!selectedTemplate) return;
    setApplying(true);
    setFailed(false);
    const command = createApplyBoardTemplateCommand(createPostsRepository());
    const result = await command({ boardId, template: selectedTemplate }, { userId: null });
    if (result.ok) {
      dismiss();
      onApplied?.();
    } else {
      setFailed(true);
      setApplying(false);
    }
  }, [boardId, selectedTemplate, dismiss, onApplied]);

  // While an apply is in flight (or after one failed) the first template posts
  // arrive through realtime and raise postCount. The panel must stay mounted so
  // "Adding…" and the failure message can still be seen; it closes on success
  // (dismiss) and only hides once the board is genuinely empty again.
  const visible =
    Boolean(group) && canEdit && postsLoaded && !dismissed && (postCount === 0 || applying || failed);
  if (!visible || !group) return null;

  const rowClass =
    'block w-full rounded-md px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 aria-pressed:bg-blue-50 aria-pressed:text-blue-700';
  const footerLabel =
    selected === EMPTY_SELECTION ? 'Start empty' : applying ? 'Adding…' : 'Use this template';

  return (
    <div className="fixed right-4 top-28 z-[1250] flex items-start gap-3" data-board-template-picker="true">
      {selectedTemplate?.previewUrl && (
        <img
          src={selectedTemplate.previewUrl}
          alt={`${selectedTemplate.name} preview`}
          data-board-template-preview="true"
          className="max-w-[40vw] rounded-xl border border-gray-200 bg-white shadow-lg"
        />
      )}
      <div
        className="bg-white"
        style={{
          width: 280,
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.12)',
        }}
      >
        <div className="flex items-center justify-between px-4 pb-2 pt-3">
          <h2 className="text-sm font-semibold text-gray-900">Choose a template</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={dismiss}
            className="flex h-6 w-6 items-center justify-center rounded text-lg leading-none text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            ×
          </button>
        </div>
        <p className="px-4 pb-1 text-xs font-medium uppercase tracking-wide text-gray-400">{group.label}</p>
        <div className="space-y-1 px-2 pb-2">
          <button
            type="button"
            data-board-template-row="empty"
            aria-pressed={selected === EMPTY_SELECTION}
            onClick={() => setSelected(EMPTY_SELECTION)}
            className={rowClass}
          >
            Empty board
          </button>
          {group.templates.map((template) => (
            <button
              key={template.id}
              type="button"
              data-board-template-row={template.id}
              aria-pressed={selected === template.id}
              onClick={() => setSelected(template.id)}
              className={rowClass}
            >
              {template.name}
            </button>
          ))}
        </div>
        {failed && (
          <p role="alert" className="px-4 pb-2 text-xs text-red-600">
            The template could not be added. Nothing was changed — try again.
          </p>
        )}
        <div className="px-4 pb-3">
          <button
            type="button"
            data-board-template-apply="true"
            disabled={applying}
            onClick={selected === EMPTY_SELECTION ? dismiss : apply}
            className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {footerLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
