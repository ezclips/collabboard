'use client';

// PATCH-326/328. Import a calendar (.ics) into the board, or CONNECT it so the
// board keeps itself in step.
//
// The parser runs on the SERVER (a link must never be fetched from the browser
// and .ics handling belongs in one place). This modal asks the route for the
// events, then turns them into cards in the BROWSER, so all-day stays all-day
// and a timed event is written in the user's own time zone. A CONNECTED
// calendar is synced by the server instead, and only its host is ever shown.
//
// THE LINK IS A SECRET. It is held in this component's state only, sent once to
// the route, and never written anywhere else.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Calendar, Link2, RefreshCw, Upload, X } from 'lucide-react';
import type { Card, Column, Row } from '@/types/kanban-canvas';
import type { ImportedEvent } from '@/lib/kanban/icsImport';
import { eventToCardFields } from '@/lib/kanban/calendarEventMapping';
import { useKanban, useKanbanData, useKanbanPersistence, useKanbanReadonly } from './store';
import { useKanbanI18n } from './useKanbanI18n';
import { ConfirmModal } from './ConfirmModal';

/** The largest .ics body the server accepts. Refused before reading here too. */
const MAX_ICS_BYTES = 2 * 1024 * 1024;
const PREVIEW_LIST_MAX = 50;

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function eventStartLabel(event: ImportedEvent): string {
  if (event.allDay) return event.startDate ?? '';
  if (!event.startIso) return '';
  return eventToCardFields(event, browserTimeZone()).startDate;
}

export function eventEndLabel(event: ImportedEvent): string {
  if (event.allDay) return event.endDate ?? event.startDate ?? '';
  if (!event.startIso) return '';
  return eventToCardFields(event, browserTimeZone()).endDate;
}

/**
 * One imported event as a Card. The field mapping is the SHARED one, so the
 * browser and the server's sync cannot drift.
 */
export function mapEventToCard(
  event: ImportedEvent,
  context: { readonly columnId: string; readonly rowId?: string; readonly order: number },
): Card {
  const fields = eventToCardFields(event, browserTimeZone());
  return {
    id: crypto.randomUUID(),
    label: fields.label,
    ...(fields.description ? { description: fields.description } : {}),
    columnId: context.columnId,
    rowId: context.rowId,
    order: context.order,
    priority: undefined,
    progress: 0,
    start_date: fields.startDate,
    end_date: fields.endDate,
  };
}

export interface CalendarCardBuild {
  readonly cards: Card[];
  readonly skipped: number;
}

function cardIdentity(card: Pick<Card, 'label' | 'start_date' | 'end_date'>): string {
  return `${card.label}\u0000${card.start_date ?? ''}\u0000${card.end_date ?? ''}`;
}

/**
 * Events → cards for one column, skipping any that are already on the board.
 *
 * A duplicate is the SAME LABEL, start date and end date -- the same rule
 * re-importing relies on, and the reason an import can be run twice without
 * doubling the board.
 */
export function buildCalendarCards(
  events: readonly ImportedEvent[],
  input: {
    readonly columns: readonly Column[];
    readonly rows: readonly Row[];
    readonly existingCards: readonly Card[];
    readonly columnId: string;
  },
): CalendarCardBuild {
  const firstRow = [...input.rows].sort((a, b) => (a.order || 0) - (b.order || 0))[0];
  const inColumn = input.existingCards.filter((card) => card.columnId === input.columnId);
  let nextOrder = inColumn.reduce((max, card) => Math.max(max, card.order ?? 0), -1) + 1;

  const seen = new Set(input.existingCards.map(cardIdentity));
  const cards: Card[] = [];
  let skipped = 0;

  for (const event of events) {
    const card = mapEventToCard(event, { columnId: input.columnId, rowId: firstRow?.id, order: nextOrder });
    const identity = cardIdentity(card);
    if (seen.has(identity)) {
      skipped += 1;
      continue;
    }
    seen.add(identity);
    cards.push(card);
    nextOrder += 1;
  }

  return { cards, skipped };
}

interface ConnectedCalendar {
  readonly id: string;
  readonly urlHost: string;
  readonly targetColumnId: string | null;
  readonly lastSyncedAt: string | null;
  readonly lastError: string | null;
  readonly cardCount: number;
}

/** "5 min ago" / "2 hours ago" / "3 days ago" from an ISO instant. */
export function formatUpdatedAgo(iso: string, now: Date = new Date()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, Math.floor((now.getTime() - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export interface CalendarImportModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

/**
 * Closed means CLOSED: the store hooks live in the body below, so a closed
 * modal reads nothing from the board (and a host that renders it beside other
 * controls is not forced to provide the store while it is shut).
 */
export function CalendarImportModal({ isOpen, onClose }: CalendarImportModalProps) {
  if (!isOpen) return null;
  return <CalendarImportModalBody onClose={onClose} />;
}

function CalendarImportModalBody({ onClose }: { readonly onClose: () => void }) {
  const { canvasId } = useKanban();
  const data = useKanbanData();
  const actions = useKanbanPersistence();
  const readonly = useKanbanReadonly();
  const { t } = useKanbanI18n();

  const [mode, setMode] = useState<'file' | 'link'>('file');
  const [url, setUrl] = useState('');
  const [keepUpdated, setKeepUpdated] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{ events: ImportedEvent[]; truncated: boolean } | null>(null);
  const [columnId, setColumnId] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [subscriptions, setSubscriptions] = useState<readonly ConnectedCalendar[]>([]);
  const [busySubscriptionId, setBusySubscriptionId] = useState<string | null>(null);
  const [pendingDisconnect, setPendingDisconnect] = useState<ConnectedCalendar | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const apiBase = canvasId ? `/api/boards/${encodeURIComponent(canvasId)}` : '';

  const sortedColumns = useMemo(
    () => [...data.columns].sort((a, b) => (a.order || 0) - (b.order || 0)),
    [data.columns],
  );

  useEffect(() => {
    setError(null);
    setPreview(null);
    setProgress(null);
    setUrl('');
    setMode('file');
    setKeepUpdated(true);
  }, []);

  useEffect(() => {
    if (columnId.length > 0 && sortedColumns.some((column) => column.id === columnId)) return;
    setColumnId(sortedColumns[0]?.id ?? '');
  }, [columnId, sortedColumns]);

  const loadSubscriptions = useCallback(async () => {
    if (!apiBase) return;
    try {
      const response = await fetch(`${apiBase}/calendar-subscriptions`, { method: 'GET' });
      if (!response.ok) return;
      const body = await response.json().catch(() => null);
      if (Array.isArray(body)) setSubscriptions(body as ConnectedCalendar[]);
    } catch {
      // A list that cannot be read simply stays as it was.
    }
  }, [apiBase]);

  useEffect(() => {
    void loadSubscriptions();
  }, [loadSubscriptions]);

  const build = useMemo<CalendarCardBuild | null>(() => {
    if (!preview || columnId.length === 0) return null;
    return buildCalendarCards(preview.events, {
      columns: data.columns,
      rows: data.rows,
      existingCards: data.cards,
      columnId,
    });
  }, [preview, columnId, data.columns, data.rows, data.cards]);

  const range = useMemo(() => {
    if (!preview || preview.events.length === 0) return null;
    const from = eventStartLabel(preview.events[0]);
    const to = preview.events.reduce(
      (max, event) => (eventEndLabel(event) > max ? eventEndLabel(event) : max),
      eventEndLabel(preview.events[0]),
    );
    return { from, to };
  }, [preview]);

  if (readonly) return null;

  const loadPreview = async (payload: { icsText?: string; url?: string }): Promise<void> => {
    if (!apiBase || loading) return;
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      const response = await fetch(`${apiBase}/calendar-import`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => null) as
        | { events?: ImportedEvent[]; truncated?: boolean; error?: string }
        | null;
      if (!response.ok) {
        setError(typeof body?.error === 'string' ? body.error : t('calendarReadFailed'));
        return;
      }
      const events = Array.isArray(body?.events) ? body.events : [];
      setPreview({ events, truncated: body?.truncated === true });
      if (events.length === 0) setError(t('noEventsFound'));
    } catch {
      setError(t('calendarReadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    if (file.size > MAX_ICS_BYTES) {
      setError(t('calendarTooLarge'));
      return;
    }
    const text = await file.text();
    await loadPreview({ icsText: text });
  };

  const handleImport = async (): Promise<void> => {
    if (!build || progress || build.cards.length === 0) return;
    const cards = build.cards;
    setProgress({ done: 0, total: cards.length });
    let imported = 0;
    let failed = 0;
    for (let index = 0; index < cards.length; index += 1) {
      try {
        await actions.addCard(cards[index]);
        imported += 1;
      } catch {
        failed += 1;
      }
      setProgress({ done: index + 1, total: cards.length });
    }
    setProgress(null);
    onClose();
    if (failed > 0) {
      toast.warning(t('importedSomeFailed', { imported, failed }));
    } else {
      toast.success(t('importedCount', { count: imported }));
    }
  };

  const connectSubscription = async (): Promise<void> => {
    if (!apiBase || !columnId || url.trim().length === 0 || loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiBase}/calendar-subscriptions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), columnId, timeZone: browserTimeZone() }),
      });
      const body = await response.json().catch(() => null) as { added?: number; error?: string } | null;
      if (!response.ok) {
        setError(typeof body?.error === 'string' ? body.error : t('calendarReadFailed'));
        return;
      }
      toast.success(t('calendarConnectedToast', { count: body?.added ?? 0 }));
      await actions.refetchFromServer();
      onClose();
    } catch {
      setError(t('calendarReadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const updateNow = async (subscription: ConnectedCalendar): Promise<void> => {
    if (!apiBase || busySubscriptionId) return;
    setBusySubscriptionId(subscription.id);
    try {
      const response = await fetch(`${apiBase}/calendar-subscriptions/${subscription.id}/sync`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ timeZone: browserTimeZone() }),
      });
      const body = await response.json().catch(() => null) as
        | { added?: number; updated?: number; removed?: number; error?: string }
        | null;
      if (!response.ok) {
        setError(typeof body?.error === 'string' ? body.error : t('calendarReadFailed'));
        return;
      }
      const added = body?.added ?? 0;
      const updated = body?.updated ?? 0;
      const removed = body?.removed ?? 0;
      if (added === 0 && updated === 0 && removed === 0) {
        toast.success(t('calendarUpToDate'));
      } else {
        toast.success(t('calendarUpdatedToast', { added, updated, removed }));
      }
      await actions.refetchFromServer();
      await loadSubscriptions();
    } catch {
      setError(t('calendarReadFailed'));
    } finally {
      setBusySubscriptionId(null);
    }
  };

  const disconnect = async (subscription: ConnectedCalendar): Promise<void> => {
    if (!apiBase) return;
    try {
      const response = await fetch(`${apiBase}/calendar-subscriptions/${subscription.id}`, { method: 'DELETE' });
      if (!response.ok) {
        setError(t('calendarReadFailed'));
        return;
      }
      await actions.refetchFromServer();
      await loadSubscriptions();
    } catch {
      setError(t('calendarReadFailed'));
    }
  };

  const confirmAction = (): void => {
    if (preview && mode === 'link' && keepUpdated) {
      void connectSubscription();
      return;
    }
    void handleImport();
  };

  return (
    <div
      data-calendar-import-modal="true"
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-label={t('importCalendar')}
    >
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl">
        <div className="mb-3 flex items-center gap-2">
          <Calendar size={18} className="text-slate-600" />
          <h2 className="text-base font-semibold text-slate-800">{t('importCalendar')}</h2>
          <button
            type="button"
            data-calendar-import-close="true"
            className="ml-auto rounded p-1 text-gray-500 hover:bg-gray-100"
            aria-label={t('close')}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        {subscriptions.length > 0 ? (
          <div data-calendar-connected-list="true" className="mb-3 rounded-lg border border-gray-200 p-2">
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-500">
              {t('connectedCalendars')}
            </p>
            {subscriptions.map((subscription) => (
              <div key={subscription.id} data-calendar-connected={subscription.id} className="flex items-center gap-2 py-1 text-[12px]">
                <span className="min-w-0 flex-1 truncate text-slate-700">{subscription.urlHost}</span>
                <span className="shrink-0 text-gray-500">
                  {subscription.lastError
                    ? subscription.lastError
                    : subscription.lastSyncedAt
                      ? t('updatedAgo', { time: formatUpdatedAgo(subscription.lastSyncedAt) })
                      : ''}
                </span>
                <button
                  type="button"
                  data-calendar-update-now={subscription.id}
                  disabled={busySubscriptionId === subscription.id}
                  className="shrink-0 rounded border border-gray-300 px-1.5 py-0.5 text-[11px] hover:bg-gray-50 disabled:opacity-50"
                  onClick={() => { void updateNow(subscription); }}
                >
                  <RefreshCw size={11} className="mr-0.5 inline" />{t('updateNow')}
                </button>
                <button
                  type="button"
                  data-calendar-disconnect={subscription.id}
                  className="shrink-0 rounded border border-gray-300 px-1.5 py-0.5 text-[11px] text-red-600 hover:bg-red-50"
                  onClick={() => setPendingDisconnect(subscription)}
                >
                  {t('disconnect')}
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mb-3 flex gap-1 rounded-lg bg-gray-100 p-1 text-[12px]">
          <button
            type="button"
            data-calendar-import-tab="file"
            className={`flex-1 rounded-md px-2 py-1 ${mode === 'file' ? 'bg-white shadow-sm' : 'text-gray-600'}`}
            onClick={() => setMode('file')}
          >
            <Upload size={13} className="mr-1 inline" />{t('uploadIcsFile')}
          </button>
          <button
            type="button"
            data-calendar-import-tab="link"
            className={`flex-1 rounded-md px-2 py-1 ${mode === 'link' ? 'bg-white shadow-sm' : 'text-gray-600'}`}
            onClick={() => setMode('link')}
          >
            <Link2 size={13} className="mr-1 inline" />{t('calendarLink')}
          </button>
        </div>

        {mode === 'file' ? (
          <div className="mb-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".ics,text/calendar"
              data-calendar-import-file="true"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                void handleFile(file);
              }}
            />
            <button
              type="button"
              className="w-full rounded-lg border border-dashed border-gray-300 px-3 py-4 text-[12px] text-gray-600 hover:bg-gray-50"
              onClick={() => fileInputRef.current?.click()}
            >
              {t('uploadIcsFile')}
            </button>
          </div>
        ) : (
          <div className="mb-3 space-y-2">
            <input
              type="url"
              data-calendar-import-url="true"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-[12px]"
            />
            <p className="text-[11px] leading-snug text-gray-500">{t('calendarLinkHelpGoogle')}</p>
            <p className="text-[11px] leading-snug text-gray-500">{t('calendarLinkHelpOutlook')}</p>
            <p className="text-[11px] leading-snug text-gray-500">{t('calendarLinkHelpApple')}</p>
            <p className="text-[11px] leading-snug text-gray-500">{t('calendarLinkNotSaved')}</p>
            <label className="flex items-center gap-2 text-[12px] text-slate-700">
              <input
                type="checkbox"
                data-calendar-keep-updated="true"
                checked={keepUpdated}
                onChange={(event) => setKeepUpdated(event.target.checked)}
              />
              {t('keepCalendarUpdated')}
            </label>
          </div>
        )}

        {error ? (
          <p data-calendar-import-error="true" role="alert" className="mb-2 text-[12px] text-red-600">
            {error}
          </p>
        ) : null}

        {preview ? (
          <div className="mb-3 space-y-2">
            {range && preview.events.length > 0 ? (
              <p data-calendar-import-range="true" className="text-[12px] text-slate-700">
                {t('eventsRange', { count: preview.events.length, from: range.from, to: range.to })}
              </p>
            ) : null}
            {build && build.skipped > 0 ? (
              <p data-calendar-import-skipped="true" className="text-[12px] text-amber-700">
                {t('alreadyOnBoard', { count: build.skipped })}
              </p>
            ) : null}
            {preview.truncated ? (
              <p data-calendar-import-truncated="true" className="text-[12px] text-amber-700">
                {t('calendarTruncated')}
              </p>
            ) : null}
            <ul data-calendar-import-list="true" className="max-h-40 overflow-auto rounded border border-gray-200 text-[12px]">
              {preview.events.slice(0, PREVIEW_LIST_MAX).map((event, index) => (
                <li key={index} className="flex gap-2 border-b border-gray-100 px-2 py-1 last:border-b-0">
                  <span className="shrink-0 tabular-nums text-gray-500">{eventStartLabel(event)}</span>
                  <span className="min-w-0 truncate text-slate-700">{event.title}</span>
                </li>
              ))}
            </ul>
            {sortedColumns.length > 0 ? (
              <label className="flex items-center gap-2 text-[12px] text-slate-700">
                {t('chooseColumn')}
                <select
                  data-calendar-import-column="true"
                  value={columnId}
                  onChange={(event) => setColumnId(event.target.value)}
                  className="rounded border border-gray-300 px-2 py-1 text-[12px]"
                >
                  {sortedColumns.map((column) => (
                    <option key={column.id} value={column.id}>{column.label}</option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          {progress ? (
            <span data-calendar-import-progress="true" className="mr-auto text-[12px] text-slate-600">
              {t('importingProgress', { done: progress.done, total: progress.total })}
            </span>
          ) : null}
          <button
            type="button"
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-[12px] text-gray-700 hover:bg-gray-50"
            onClick={onClose}
          >
            {t('cancel')}
          </button>
          {!preview && mode === 'link' ? (
            <button
              type="button"
              data-calendar-import-preview="true"
              disabled={loading || url.trim().length === 0}
              className="rounded-lg bg-slate-800 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-slate-700 disabled:opacity-50"
              onClick={() => { void loadPreview({ url: url.trim() }); }}
            >
              {t('preview')}
            </button>
          ) : null}
          {preview && build ? (
            <button
              type="button"
              data-calendar-import-confirm="true"
              disabled={loading || progress !== null || build.cards.length === 0}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-blue-500 disabled:opacity-50"
              onClick={confirmAction}
            >
              {t('importCount', { count: build.cards.length })}
            </button>
          ) : null}
        </div>
      </div>

      <ConfirmModal
        isOpen={pendingDisconnect !== null}
        onClose={() => setPendingDisconnect(null)}
        onConfirm={() => { if (pendingDisconnect) void disconnect(pendingDisconnect); }}
        title={t('disconnect')}
        message={t('disconnectCalendarMessage', {
          host: pendingDisconnect?.urlHost ?? '',
          count: pendingDisconnect?.cardCount ?? 0,
        })}
        confirmText={t('disconnect')}
      />
    </div>
  );
}

export default CalendarImportModal;
