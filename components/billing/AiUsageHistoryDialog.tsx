'use client';

/**
 * PATCH-344. "AI usage": where the workspace's AI credits went. Read through the
 * actor's own client (RLS decides), so a board the viewer cannot open is never
 * named. No personal data about other members: the "Who" column says You or
 * Another member.
 *
 * Fixed header/footer with a scrolling middle, so the dialog never grows past
 * the screen (the PATCH-342 Addendum 2 pattern).
 */
import React, { useCallback, useEffect, useState } from 'react';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { fetchAiUsageHistory, type AiUsageHistoryEntry } from '@/lib/infra/billing/fetchAiUsageHistory';

const DATE_TIME_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function bucketLabel(bucket: 'allowance' | 'grant'): string {
  return bucket === 'grant' ? 'Welcome credits' : 'Monthly';
}

function BoardCell({ entry }: { entry: AiUsageHistoryEntry }) {
  if (!entry.boardGone) return <>{entry.boardTitle ?? '—'}</>;
  return (
    <span className="text-slate-400">
      {entry.boardId === null ? 'Deleted board' : "A board you can't open"}
    </span>
  );
}

export function AiUsageHistoryDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [entries, setEntries] = useState<AiUsageHistoryEntry[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  const load = useCallback(async (before: string | null) => {
    setLoading(true);
    if (before === null) setError(null);
    else setLoadMoreError(null);
    try {
      const page = await fetchAiUsageHistory({ before });
      setEntries((current) => (before ? [...current, ...page.entries] : page.entries));
      setNextBefore(page.nextBefore);
    } catch (err) {
      if (before === null) {
        setError(err instanceof Error ? err.message : 'Usage history is unavailable right now.');
      } else {
        // PATCH-344 Addendum 1 (P3). A failed Load more must not throw away the
        // rows already shown: keep them, show a small inline error and leave the
        // button for a retry. Only a failed FIRST page is a full-dialog error.
        setLoadMoreError("Couldn't load more. Try again.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setEntries([]);
    setNextBefore(null);
    setError(null);
    setLoadMoreError(null);
    void load(null);
  }, [isOpen, load]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        data-ai-usage-history="true"
        className="max-w-2xl max-h-[calc(100vh-48px)]"
        style={{ display: 'flex', flexDirection: 'column', maxHeight: 'calc(100dvh - 48px)' }}
      >
        <DialogHeader className="flex-none">
          <DialogTitle>AI usage</DialogTitle>
          <DialogDescription>Where your workspace&rsquo;s AI credits went.</DialogDescription>
        </DialogHeader>

        <div data-ai-usage-body="true" className="min-h-0 flex-1 overflow-y-auto">
          {error ? (
            <p data-ai-usage-error="true" className="text-sm text-red-600">{error}</p>
          ) : loading && entries.length === 0 ? (
            <p data-ai-usage-loading="true" className="text-sm text-slate-500">Loading…</p>
          ) : entries.length === 0 ? (
            <p data-ai-usage-empty="true" className="text-sm text-slate-500">No AI credits used yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="py-2 pr-3 font-medium">Date &amp; time</th>
                  <th className="py-2 pr-3 font-medium">Feature</th>
                  <th className="py-2 pr-3 font-medium">Board</th>
                  <th className="py-2 pr-3 font-medium">Who</th>
                  <th className="py-2 pr-3 font-medium">Credits</th>
                  <th className="py-2 font-medium">Bucket</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} data-ai-usage-row={entry.id} className="border-t border-slate-100">
                    <td className="py-2 pr-3 whitespace-nowrap">{DATE_TIME_FORMAT.format(new Date(entry.createdAt))}</td>
                    <td className="py-2 pr-3">{entry.featureLabel}</td>
                    <td className="py-2 pr-3"><BoardCell entry={entry} /></td>
                    <td className="py-2 pr-3">{entry.byYou ? 'You' : 'Another member'}</td>
                    <td className="py-2 pr-3">{entry.credits}</td>
                    <td className="py-2">{bucketLabel(entry.bucket)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div data-ai-usage-footer="true" className="flex-none space-y-2 pt-2">
          {nextBefore && !error ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                data-ai-usage-load-more="true"
                onClick={() => { void load(nextBefore); }}
                disabled={loading}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {loading ? 'Loading…' : 'Load more'}
              </button>
              {loadMoreError ? (
                <span data-ai-usage-load-more-error="true" className="text-xs text-red-600">
                  {loadMoreError}
                </span>
              ) : null}
            </div>
          ) : null}
          <p className="text-xs text-slate-400">
            AI that runs on your own API key doesn&rsquo;t use credits and isn&rsquo;t listed here.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default AiUsageHistoryDialog;
