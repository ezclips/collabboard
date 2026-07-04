'use client';

import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

interface OrphanedRefFinding {
  padletId: string;
  boardId: string;
  boardTitle: string;
  padletTitle: string;
  field:
    | 'parentId'
    | 'coverChildId'
    | 'coverPadletId'
    | 'coverChildPadletId'
    | 'childPadletIds'
    | 'sectionId';
  danglingValue: string;
}

interface BoardReport {
  boardId: string;
  boardTitle: string;
  findings: OrphanedRefFinding[];
}

interface ReportResponse {
  workspaceName: string;
  totalFindings: number;
  byBoard: BoardReport[];
}

interface CleanupSummary {
  padletsUpdated: number;
  findingsResolved: number;
}

function formatPadletTitle(title: string) {
  return title.trim() || '(untitled padlet)';
}

function FindingsTable({
  boards,
  onPreviewCleanup,
  cleanupLoading,
}: {
  boards: BoardReport[];
  onPreviewCleanup?: (boardId: string) => void;
  cleanupLoading?: boolean;
}) {
  return (
    <div className="space-y-6">
      {boards.map((board) => (
        <section key={board.boardId} className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="mb-4">
            <h2 className="text-lg font-medium text-gray-900">{board.boardTitle || 'Untitled board'}</h2>
            <p className="mt-1 text-sm text-gray-500">
              {board.findings.length} orphaned reference{board.findings.length === 1 ? '' : 's'} on board {board.boardId}
            </p>
          </div>

          {onPreviewCleanup && (
            <div className="mb-4">
              <button
                onClick={() => onPreviewCleanup(board.boardId)}
                disabled={cleanupLoading}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Preview cleanup for this board
              </button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Padlet</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Padlet ID</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Field</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Dangling value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {board.findings.map((finding, index) => (
                  <tr key={`${finding.padletId}-${finding.field}-${finding.danglingValue}-${index}`}>
                    <td className="px-3 py-2 text-gray-900">{formatPadletTitle(finding.padletTitle)}</td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-600">{finding.padletId}</td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-700">{finding.field}</td>
                    <td className="px-3 py-2 font-mono text-xs text-red-700">{finding.danglingValue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

export default function DataHygienePage() {
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cleanupPreview, setCleanupPreview] = useState<ReportResponse | null>(null);
  const [cleanupError, setCleanupError] = useState<string | null>(null);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupTargetBoardIds, setCleanupTargetBoardIds] = useState<string[] | null>(null);
  const [cleanupSummary, setCleanupSummary] = useState<CleanupSummary | null>(null);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/workspace/data-hygiene/report', {
        method: 'GET',
        cache: 'no-store',
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error || 'Failed to load orphaned-reference report.');
        setReport(null);
        return;
      }
      setReport(body as ReportResponse);
      setCleanupSummary(null);
    } catch (loadError) {
      console.error('Failed to load orphaned-reference report:', loadError);
      setError('Failed to load orphaned-reference report.');
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const previewCleanup = useCallback(async (boardIds?: string[]) => {
    setCleanupLoading(true);
    setCleanupError(null);
    setCleanupSummary(null);
    try {
      const response = await fetch('/api/workspace/data-hygiene/clean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dryRun: true,
          boardIds,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setCleanupError(body.error || 'Failed to preview cleanup.');
        setCleanupPreview(null);
        setCleanupTargetBoardIds(null);
        return;
      }
      setCleanupPreview(body as ReportResponse);
      setCleanupTargetBoardIds(boardIds ?? null);
    } catch (previewError) {
      console.error('Failed to preview cleanup:', previewError);
      setCleanupError('Failed to preview cleanup.');
      setCleanupPreview(null);
      setCleanupTargetBoardIds(null);
    } finally {
      setCleanupLoading(false);
    }
  }, []);

  const confirmCleanup = useCallback(async () => {
    setCleanupLoading(true);
    setCleanupError(null);
    try {
      const response = await fetch('/api/workspace/data-hygiene/clean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dryRun: false,
          boardIds: cleanupTargetBoardIds ?? undefined,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setCleanupError(body.error || 'Failed to run cleanup.');
        return;
      }
      setCleanupSummary(body as CleanupSummary);
      setCleanupPreview(null);
      setCleanupTargetBoardIds(null);
      toast.success(
        `Resolved ${body.findingsResolved} orphaned reference${body.findingsResolved === 1 ? '' : 's'} across ${body.padletsUpdated} padlet${body.padletsUpdated === 1 ? '' : 's'}.`,
      );
      await loadReport();
    } catch (confirmError) {
      console.error('Failed to run cleanup:', confirmError);
      setCleanupError('Failed to run cleanup.');
    } finally {
      setCleanupLoading(false);
    }
  }, [cleanupTargetBoardIds, loadReport]);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Data Hygiene</h1>
          <p className="text-gray-500">
            Review orphaned padlet and section references in the current workspace before running cleanup.
          </p>
        </div>
        <button
          onClick={() => void loadReport()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh report
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
          <div>
            <h2 className="font-medium text-red-800">Report failed</h2>
            <p className="mt-1 text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {loading && !report && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading orphaned-reference report...
        </div>
      )}

      {report && (
        <>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="text-sm text-gray-500">Workspace</div>
            <div className="mt-1 text-lg font-medium text-gray-900">{report.workspaceName}</div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-lg bg-gray-50 p-4">
                <div className="text-2xl font-bold text-gray-900">{report.totalFindings}</div>
                <div className="text-sm text-gray-500">Total orphaned references</div>
              </div>
              <div className="rounded-lg bg-gray-50 p-4">
                <div className="text-2xl font-bold text-gray-900">{report.byBoard.length}</div>
                <div className="text-sm text-gray-500">Boards affected</div>
              </div>
            </div>
            {report.totalFindings > 0 && (
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  onClick={() => void previewCleanup()}
                  disabled={cleanupLoading}
                  className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                >
                  {cleanupLoading && !cleanupPreview ? 'Preparing cleanup...' : 'Preview cleanup for all affected boards'}
                </button>
              </div>
            )}
          </div>

          {report.totalFindings === 0 ? (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
              No orphaned padlet or section references were found in this workspace.
            </div>
          ) : (
            <FindingsTable
              boards={report.byBoard}
              onPreviewCleanup={(boardId) => void previewCleanup([boardId])}
              cleanupLoading={cleanupLoading}
            />
          )}
        </>
      )}

      {(cleanupError || cleanupPreview || cleanupSummary) && (
        <section className="space-y-4">
          {cleanupError && (
            <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-600" />
              <div>
                <h2 className="font-medium text-red-800">Cleanup failed</h2>
                <p className="mt-1 text-sm text-red-700">{cleanupError}</p>
              </div>
            </div>
          )}

          {cleanupPreview && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <h2 className="text-lg font-medium text-amber-900">Cleanup preview</h2>
              <p className="mt-1 text-sm text-amber-800">
                This will remove {cleanupPreview.totalFindings} orphaned reference{cleanupPreview.totalFindings === 1 ? '' : 's'} from{' '}
                {cleanupPreview.byBoard.length} board{cleanupPreview.byBoard.length === 1 ? '' : 's'}.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  onClick={() => void confirmCleanup()}
                  disabled={cleanupLoading}
                  className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {cleanupLoading ? 'Cleaning up...' : 'Confirm cleanup'}
                </button>
                <button
                  onClick={() => {
                    setCleanupPreview(null);
                    setCleanupTargetBoardIds(null);
                    setCleanupError(null);
                  }}
                  disabled={cleanupLoading}
                  className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
              {cleanupPreview.byBoard.length > 0 && (
                <div className="mt-6">
                  <FindingsTable boards={cleanupPreview.byBoard} />
                </div>
              )}
            </div>
          )}

          {cleanupSummary && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
              Cleanup complete: updated {cleanupSummary.padletsUpdated} padlet{cleanupSummary.padletsUpdated === 1 ? '' : 's'} and
              resolved {cleanupSummary.findingsResolved} orphaned reference{cleanupSummary.findingsResolved === 1 ? '' : 's'}.
            </div>
          )}
        </section>
      )}
    </div>
  );
}
