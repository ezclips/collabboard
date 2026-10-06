'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { LayoutType, Padlet } from '@/types/collabboard';
import {
  createApplyBoardTemplateCommand,
  type BoardTemplate,
} from '@/lib/domain/canvas/boardTemplates';
import { createPostsRepository } from '@/lib/infra/canvas/postsRepository';
import { createSectionsRepository } from '@/lib/infra/canvas/sectionsRepository';
import { templatesForLayout } from '@/lib/collabboard/templates/registry';
import {
  clearBoardTemplateRequest,
  readBoardTemplateRequest,
  writeBoardTemplateRequest,
} from '@/lib/collabboard/templates/templateRequest';

const EMPTY_SELECTION = 'empty';

export interface BoardTemplatePickerProps {
  boardId: string;
  layout: LayoutType | null | undefined;
  posts: Padlet[];
  postsLoaded: boolean;
  canEdit: boolean;
  /** The board's sections, reused by columns/grid templates. */
  sections?: { id: number; title: string; position: number }[];
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

/**
 * A root container with no title, no children and no content is a placeholder
 * (the blank container a Timeline board auto-creates on first open), not a real
 * post.
 */
function isPlaceholderPost(post: Padlet): boolean {
  const metadata = (post.metadata ?? {}) as Record<string, unknown>;
  const isContainer =
    post.type === 'container' || metadata.kind === 'container' || metadata.isContainer === true;
  if (!isContainer || metadata.parentId) return false;
  const children = Array.isArray(metadata.childPadletIds) ? metadata.childPadletIds : [];
  return (post.title ?? '').trim() === '' && (post.content ?? '').trim() === '' && children.length === 0;
}

export default function BoardTemplatePicker({
  boardId,
  layout,
  posts,
  postsLoaded,
  canEdit,
  sections,
  onApplied,
}: BoardTemplatePickerProps) {
  const group = templatesForLayout(layout);
  const [dismissed, setDismissed] = useState(false);
  const [selected, setSelected] = useState<string>(EMPTY_SELECTION);
  const [applying, setApplying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [autoTemplate, setAutoTemplate] = useState<string | null>(null);
  const [autoApplying, setAutoApplying] = useState(false);
  const autoAppliedRef = useRef(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // PATCH-301 + Addendum 1/3. A board created from a template opens with
  // `?template=<id>`. Read it once and strip it immediately (keeping other
  // params), so a reload or a share never re-applies it. The id is parked in
  // sessionStorage as a `pending` request so a Strict Mode double-run (or any
  // remount) cannot lose it. This effect is declared BEFORE the
  // reset-on-board-change effect on purpose: the request must be parked before
  // anything that could drop it runs.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('template');
    if (!requested) return;
    // Never clobber a request that is already applying.
    if (readBoardTemplateRequest(boardId) === null) {
      writeBoardTemplateRequest(boardId, requested, 'pending');
    }
    params.delete('template');
    const query = params.toString();
    window.history.replaceState(
      {},
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`,
    );
  }, [boardId]);

  useEffect(() => {
    setDismissed(readDismissed(boardId));
    setSelected(EMPTY_SELECTION);
    setApplying(false);
    setFailed(false);
    setCollapsed(false);
    setAutoTemplate(null);
    setAutoApplying(false);
    autoAppliedRef.current = false;
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

  const applyTemplate = useCallback(
    async (template: BoardTemplate) => {
      setApplying(true);
      setFailed(false);
      const replacePostIds = posts.filter(isPlaceholderPost).map((post) => post.id);
      const command = createApplyBoardTemplateCommand(
        createPostsRepository(),
        createSectionsRepository(),
      );
      const result = await command(
        { boardId, template, existingSections: sections ?? [], replacePostIds },
        { userId: null },
      );
      if (result.ok) {
        dismiss();
        onApplied?.();
      } else {
        setFailed(true);
        setApplying(false);
      }
    },
    [boardId, sections, posts, dismiss, onApplied],
  );

  const apply = useCallback(async () => {
    if (!selectedTemplate) return;
    await applyTemplate(selectedTemplate);
  }, [selectedTemplate, applyTemplate]);

  // While an apply is in flight (or after one failed) the first template posts
  // arrive through realtime and raise the post count. The panel must stay
  // mounted so "Adding…" and the failure message can still be seen; it closes
  // on success (dismiss) and only hides once the board is genuinely empty.
  const hasRealPosts = posts.some((post) => !isPlaceholderPost(post));
  const visible =
    Boolean(group) && canEdit && postsLoaded && !dismissed && (!hasRealPosts || applying || failed);

  // PATCH-301 + Addendum 1/3. Apply the requested template once, when the board
  // is empty and editable and the id belongs to this board's layout. It uses
  // the SAME path as the Apply button; success and failure behave the same.
  // Only a `pending` request is applied; it is moved to `applying` before the
  // command starts and removed when the command finishes (either way) or when
  // the request is ignored. An `applying` key is never applied again.
  useEffect(() => {
    if (!postsLoaded || !group) return;
    const request = readBoardTemplateRequest(boardId);
    if (!request || request.state !== 'pending' || autoAppliedRef.current) return;

    if (!canEdit || hasRealPosts) {
      clearBoardTemplateRequest(boardId);
      setAutoTemplate(null);
      return;
    }
    const template = group.templates.find((item) => item.id === request.id);
    if (!template) {
      clearBoardTemplateRequest(boardId);
      setAutoTemplate(null);
      return;
    }
    autoAppliedRef.current = true;
    writeBoardTemplateRequest(boardId, request.id, 'applying');
    setAutoTemplate(request.id);
    setAutoApplying(true);
    void applyTemplate(template).finally(() => {
      clearBoardTemplateRequest(boardId);
      setAutoApplying(false);
    });
  }, [boardId, group, canEdit, postsLoaded, hasRealPosts, applyTemplate, autoTemplate]);

  // Defect 4: a press outside the panel collapses it to the pill (never a
  // dismissal); Escape collapses too. Clicking the pill reopens the panel.
  useEffect(() => {
    if (!visible || !group) return;
    const onPointerDown = (event: Event) => {
      const target = event.target as Node | null;
      if (panelRef.current && target && panelRef.current.contains(target)) return;
      if (target instanceof Element && target.closest('[data-board-template-pill]')) return;
      setCollapsed(true);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCollapsed(true);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [visible, group]);

  if (autoApplying) {
    const autoName =
      group?.templates.find((item) => item.id === autoTemplate)?.name ?? 'template';
    return (
      <div
        data-board-template-auto
        className="fixed z-[1250] rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-lg"
        style={{ bottom: 120, right: 16 }}
      >
        Adding {autoName}…
      </div>
    );
  }

  if (!visible || !group) return null;

  if (collapsed) {
    return (
      <button
        type="button"
        data-board-template-pill="true"
        onClick={() => setCollapsed(false)}
        className="fixed z-[1250] rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-lg transition-colors hover:bg-gray-50"
        style={{ bottom: 120, right: 16 }}
      >
        Templates
      </button>
    );
  }

  const rowClass =
    'block w-full rounded-md px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 aria-pressed:bg-blue-50 aria-pressed:text-blue-700';
  const footerLabel =
    selected === EMPTY_SELECTION ? 'Start empty' : applying ? 'Adding…' : 'Use this template';

  return (
    <div ref={panelRef} className="fixed right-4 top-28 z-[1250] flex items-start gap-3" data-board-template-picker="true">
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
