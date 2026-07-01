'use client';

import React, { useEffect, useState } from 'react';
import { Globe, Download, Users, Info, Loader2, Sparkles, CheckSquare, Square } from 'lucide-react';
import { toast } from 'sonner';

type ExportType = 'accessible' | 'all' | 'team-member';

interface ExportableBoard {
    id: string;
    title: string;
    layout: string;
    folderId: string | null;
}

export default function ExportPage() {
    const [selectedType, setSelectedType] = useState<ExportType>('accessible');
    const [exporting, setExporting] = useState(false);

    const [boards, setBoards] = useState<ExportableBoard[]>([]);
    const [folderNameById, setFolderNameById] = useState<Record<string, string>>({});
    const [selectedBoardIds, setSelectedBoardIds] = useState<Set<string>>(new Set());
    const [loadingBoards, setLoadingBoards] = useState(true);

    useEffect(() => {
        loadExportableBoards();
    }, []);

    const loadExportableBoards = async () => {
        try {
            setLoadingBoards(true);
            const response = await fetch('/api/workspace/export', {
                method: 'GET',
            });
            const rawText = await response.text();
            let body: any = {};
            try {
                body = rawText ? JSON.parse(rawText) : {};
            } catch {
                body = { rawText };
            }
            if (!response.ok) {
                console.error('Error loading boards for export:', {
                    status: response.status,
                    statusText: response.statusText,
                    body,
                });
                toast.error(body.error || body.rawText || `Failed to load boards (${response.status})`);
                return;
            }

            const loadedBoards: ExportableBoard[] = (body.boards ?? []).map((row: any) => ({
                id: row.id,
                title: row.title,
                layout: row.layout,
                folderId: row.folderId,
            }));
            setBoards(loadedBoards);
            setSelectedBoardIds(new Set(loadedBoards.map((board) => board.id)));

            const nameMap: Record<string, string> = {};
            (body.folders ?? []).forEach((folder: any) => {
                nameMap[folder.id] = folder.name;
            });
            setFolderNameById(nameMap);
        } finally {
            setLoadingBoards(false);
        }
    };

    const allSelected = boards.length > 0 && selectedBoardIds.size === boards.length;

    const toggleBoard = (boardId: string) => {
        setSelectedBoardIds((prev) => {
            const next = new Set(prev);
            if (next.has(boardId)) {
                next.delete(boardId);
            } else {
                next.add(boardId);
            }
            return next;
        });
    };

    const toggleSelectAll = () => {
        setSelectedBoardIds(allSelected ? new Set() : new Set(boards.map((board) => board.id)));
    };

    const handleExport = async () => {
        if (selectedBoardIds.size === 0) {
            toast.error('Select at least one board to export');
            return;
        }

        try {
            setExporting(true);

            const response = await fetch('/api/workspace/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scope: selectedType, boardIds: Array.from(selectedBoardIds) }),
            });

            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                toast.error(body.error || 'Failed to export workspace');
                return;
            }

            const blob = await response.blob();
            const disposition = response.headers.get('Content-Disposition') || '';
            const filenameMatch = disposition.match(/filename="([^"]+)"/);
            const filename = filenameMatch?.[1] || `workspace-export-${new Date().toISOString().split('T')[0]}.zip`;

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            toast.success('Export complete. Your download should start automatically.');
        } catch (err) {
            console.error('Error exporting:', err);
            toast.error('Failed to export workspace');
        } finally {
            setExporting(false);
        }
    };

    return (
        <div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-6">Workspace export</h1>

            <hr className="border-gray-200 mb-8" />

            {/* Export workspace data section */}
            <div className="grid grid-cols-3 gap-8 mb-8">
                <div>
                    <h2 className="text-lg font-semibold text-purple-600 mb-2">Export workspace data</h2>
                    <p className="text-sm text-gray-500">
                        Download a zip file containing the boards, padlets, and folders in your workspace.
                    </p>
                </div>

                <div className="col-span-2">
                    {/* Info Banner */}
                    <div className="flex gap-3 p-4 bg-purple-50 border border-purple-200 rounded-lg mb-6">
                        <Info className="w-5 h-5 text-purple-500 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-purple-700">
                            Export builds a .zip file and downloads it directly to your browser once it's ready.
                            For large workspaces this may take a few moments.
                        </p>
                    </div>

                    {/* Choose what to export */}
                    <p className="text-sm font-medium text-gray-700 mb-4">Choose what to export</p>

                    <div className="flex gap-4 mb-6">
                        {/* Export accessible scenes - Available */}
                        <button
                            onClick={() => setSelectedType('accessible')}
                            className={`flex-1 p-4 rounded-lg border-2 text-left transition-all ${
                                selectedType === 'accessible'
                                    ? 'border-purple-600 bg-white'
                                    : 'border-gray-200 bg-white hover:border-gray-300'
                            }`}
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex items-start gap-3">
                                    <Globe className="w-5 h-5 text-gray-400 mt-0.5" />
                                    <div>
                                        <h3 className="font-medium text-gray-900">Export accessible scenes</h3>
                                        <p className="text-sm text-gray-500 mt-1">Every board in this workspace you can currently open</p>
                                    </div>
                                </div>
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                                    selectedType === 'accessible'
                                        ? 'border-purple-600 bg-purple-600'
                                        : 'border-gray-300'
                                }`}>
                                    {selectedType === 'accessible' && (
                                        <div className="w-2 h-2 rounded-full bg-white" />
                                    )}
                                </div>
                            </div>
                        </button>

                        {/* Export all scenes - Enterprise */}
                        <div className="flex-1 p-4 rounded-lg border border-gray-200 bg-gray-50 relative opacity-60">
                            <div className="absolute -top-2 right-4">
                                <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded-full flex items-center gap-1">
                                    <Sparkles className="w-3 h-3" />
                                    Enterprise
                                </span>
                            </div>
                            <div className="flex items-start justify-between">
                                <div className="flex items-start gap-3">
                                    <Download className="w-5 h-5 text-gray-400 mt-0.5" />
                                    <div>
                                        <h3 className="font-medium text-gray-500">Export all scenes</h3>
                                        <p className="text-sm text-gray-400 mt-1">Workspace and everyone's private scenes</p>
                                    </div>
                                </div>
                                <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
                            </div>
                        </div>

                        {/* Export team-member's private scenes - Enterprise */}
                        <div className="flex-1 p-4 rounded-lg border border-gray-200 bg-gray-50 relative opacity-60">
                            <div className="flex items-start justify-between">
                                <div className="flex items-start gap-3">
                                    <Users className="w-5 h-5 text-gray-400 mt-0.5" />
                                    <div>
                                        <h3 className="font-medium text-gray-500">Export team-member's private scenes</h3>
                                        <p className="text-sm text-gray-400 mt-1">Private scenes of a specific member</p>
                                    </div>
                                </div>
                                <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
                            </div>
                        </div>
                    </div>

                    {/* Board selection */}
                    <div className="mb-6">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-sm font-medium text-gray-700">
                                Select boards to export
                                <span className="ml-2 text-gray-400 font-normal">
                                    {selectedBoardIds.size}/{boards.length}
                                </span>
                            </p>
                            {boards.length > 0 && (
                                <button
                                    onClick={toggleSelectAll}
                                    className="flex items-center gap-1.5 text-sm text-purple-600 hover:text-purple-700"
                                >
                                    {allSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                                    {allSelected ? 'Deselect all' : 'Select all'}
                                </button>
                            )}
                        </div>

                        <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-80 overflow-y-auto">
                            {loadingBoards ? (
                                <div className="p-4 flex items-center gap-2 text-sm text-gray-500">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Loading boards...
                                </div>
                            ) : boards.length === 0 ? (
                                <p className="p-4 text-sm text-gray-500">No boards found in this workspace.</p>
                            ) : (
                                boards.map((board) => (
                                    <label
                                        key={board.id}
                                        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedBoardIds.has(board.id)}
                                            onChange={() => toggleBoard(board.id)}
                                            className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-gray-900 truncate">{board.title || 'Untitled board'}</p>
                                        </div>
                                        <span className="text-xs text-gray-400 uppercase">{board.layout}</span>
                                        {board.folderId && folderNameById[board.folderId] && (
                                            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                                                {folderNameById[board.folderId]}
                                            </span>
                                        )}
                                    </label>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Export Button */}
                    <button
                        onClick={handleExport}
                        disabled={exporting || selectedBoardIds.size === 0}
                        className="px-6 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                        {exporting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Exporting...
                            </>
                        ) : (
                            `Export ${selectedBoardIds.size || ''} board${selectedBoardIds.size === 1 ? '' : 's'}`
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
