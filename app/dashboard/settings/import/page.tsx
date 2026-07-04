'use client';

import React, { useState, useRef } from 'react';
import { Upload, FileArchive, AlertCircle, CheckCircle2, Loader2, FileUp } from 'lucide-react';
import { toast } from 'sonner';

interface ImportPreview {
    exportedFromWorkspaceName: string;
    exportedAt: string;
    folders: { count: number; names: string[] };
    boards: { count: number; names: string[]; items: Array<{ localId: string; title: string }> };
    padlets: { count: number };
    sections: { count: number };
}

interface ImportSummary {
    foldersImported: number;
    boardsImported: number;
    padletsImported: number;
    boardSectionsImported: number;
}

export default function ImportPage() {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [file, setFile] = useState<File | null>(null);
    const [previewing, setPreviewing] = useState(false);
    const [preview, setPreview] = useState<ImportPreview | null>(null);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [boardNameOverrides, setBoardNameOverrides] = useState<Record<string, string>>({});

    const [importing, setImporting] = useState(false);
    const [summary, setSummary] = useState<ImportSummary | null>(null);
    const [importError, setImportError] = useState<string | null>(null);

    const resetFile = () => {
        setFile(null);
        setPreview(null);
        setPreviewError(null);
        setSummary(null);
        setImportError(null);
        setBoardNameOverrides({});
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) return;

        if (!selectedFile.name.endsWith('.zip')) {
            toast.error('Please select a workspace export .zip file');
            return;
        }

        setFile(selectedFile);
        setPreview(null);
        setPreviewError(null);
        setSummary(null);
        setImportError(null);

        try {
            setPreviewing(true);
            const formData = new FormData();
            formData.append('file', selectedFile);

            const response = await fetch('/api/workspace/import/preview', {
                method: 'POST',
                body: formData,
            });
            const body = await response.json().catch(() => ({}));

            if (!response.ok) {
                setPreviewError(body.error || 'Failed to read this archive');
                return;
            }

            const nextPreview = body as ImportPreview;
            setPreview(nextPreview);
            setBoardNameOverrides(
                Object.fromEntries(nextPreview.boards.items.map((board) => [board.localId, board.title])),
            );
        } catch (err) {
            console.error('Error previewing import:', err);
            setPreviewError('Failed to read this archive');
        } finally {
            setPreviewing(false);
        }
    };

    const handleConfirmImport = async () => {
        if (!file) return;

        try {
            setImporting(true);
            setImportError(null);

            const formData = new FormData();
            formData.append('file', file);
            formData.append('boardNameOverrides', JSON.stringify(boardNameOverrides));

            const response = await fetch('/api/workspace/import', {
                method: 'POST',
                body: formData,
            });

            const body = await response.json().catch(() => ({}));

            if (!response.ok) {
                setImportError(body.error || 'Failed to import workspace');
                toast.error(body.error || 'Failed to import workspace');
                return;
            }

            setSummary(body as ImportSummary);
            toast.success(
                `Imported ${body.boardsImported} boards, ${body.padletsImported} padlets, ${body.boardSectionsImported} sections, ${body.foldersImported} folders`,
            );
        } catch (err) {
            console.error('Error importing:', err);
            setImportError('Failed to import workspace');
            toast.error('Failed to import workspace');
        } finally {
            setImporting(false);
        }
    };

    return (
        <div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">Workspace Import</h1>
            <p className="text-gray-500 mb-8">
                Import a workspace export .zip file created from the export page.
            </p>

            {/* File Upload Area */}
            <section className="mb-8">
                <div
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
                        file
                            ? 'border-purple-300 bg-purple-50'
                            : 'border-gray-300 hover:border-gray-400 bg-gray-50'
                    }`}
                >
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".zip"
                        onChange={handleFileSelect}
                        className="hidden"
                    />

                    {file ? (
                        <div className="flex flex-col items-center">
                            <FileArchive className="w-12 h-12 text-purple-600 mb-3" />
                            <p className="font-medium text-gray-900">{file.name}</p>
                            <p className="text-sm text-gray-500 mt-1">
                                {(file.size / 1024).toFixed(1)} KB
                            </p>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    resetFile();
                                }}
                                className="mt-3 text-sm text-purple-600 hover:text-purple-700"
                            >
                                Choose a different file
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center">
                            <FileUp className="w-12 h-12 text-gray-400 mb-3" />
                            <p className="font-medium text-gray-900">Click to upload a file</p>
                            <p className="text-sm text-gray-500 mt-1">
                                .zip files exported from CollabBoard
                            </p>
                        </div>
                    )}
                </div>
            </section>

            {/* Previewing */}
            {previewing && (
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-8">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Reading archive...
                </div>
            )}

            {/* Preview error (fails before any writes) */}
            {previewError && (
                <section className="mb-8">
                    <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                        <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                        <div>
                            <h3 className="font-medium text-red-800">This archive can&apos;t be imported</h3>
                            <p className="text-sm text-red-700 mt-1">{previewError}</p>
                        </div>
                    </div>
                </section>
            )}

            {/* Preview summary */}
            {preview && !summary && (
                <section className="mb-8">
                    <h2 className="text-lg font-medium text-gray-900 mb-4">Import preview</h2>
                    <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
                        <p className="text-sm text-gray-500 mb-4">
                            Exported from <span className="font-medium text-gray-700">{preview.exportedFromWorkspaceName}</span> on{' '}
                            {new Date(preview.exportedAt).toLocaleDateString()}
                        </p>
                        <div className="grid grid-cols-4 gap-4">
                            <div className="text-center p-4 bg-gray-50 rounded-lg">
                                <div className="text-2xl font-bold text-gray-900">{preview.boards.count}</div>
                                <div className="text-sm text-gray-500">Boards</div>
                            </div>
                            <div className="text-center p-4 bg-gray-50 rounded-lg">
                                <div className="text-2xl font-bold text-gray-900">{preview.padlets.count}</div>
                                <div className="text-sm text-gray-500">Padlets</div>
                            </div>
                            <div className="text-center p-4 bg-gray-50 rounded-lg">
                                <div className="text-2xl font-bold text-gray-900">{preview.sections.count}</div>
                                <div className="text-sm text-gray-500">Sections</div>
                            </div>
                            <div className="text-center p-4 bg-gray-50 rounded-lg">
                                <div className="text-2xl font-bold text-gray-900">{preview.folders.count}</div>
                                <div className="text-sm text-gray-500">Folders</div>
                            </div>
                        </div>
                    </div>

                    {preview.boards.names.length > 0 && (
                        <details className="mb-4">
                            <summary className="text-sm text-purple-600 hover:text-purple-700 cursor-pointer">
                                View board names ({preview.boards.names.length})
                            </summary>
                            <ul className="mt-2 text-sm text-gray-600 list-disc list-inside max-h-48 overflow-y-auto">
                                {preview.boards.names.map((name, i) => (
                                    <li key={i}>{name || 'Untitled board'}</li>
                                ))}
                            </ul>
                        </details>
                    )}

                    {preview.boards.items.length > 0 && (
                        <div className="mb-4 rounded-lg border border-gray-200 p-4">
                            <h3 className="font-medium text-gray-900 mb-3">
                                {preview.boards.items.length === 1 ? 'Canvas name before import' : 'Board names before import'}
                            </h3>
                            <div className="space-y-3">
                                {preview.boards.items.map((board) => (
                                    <div key={board.localId}>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            {preview.boards.items.length === 1 ? 'Canvas name' : `Board: ${board.title}`}
                                        </label>
                                        <input
                                            type="text"
                                            value={boardNameOverrides[board.localId] ?? board.title}
                                            onChange={(e) =>
                                                setBoardNameOverrides((prev) => ({
                                                    ...prev,
                                                    [board.localId]: e.target.value,
                                                }))
                                            }
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {preview.folders.names.length > 0 && (
                        <details className="mb-4">
                            <summary className="text-sm text-purple-600 hover:text-purple-700 cursor-pointer">
                                View folder names ({preview.folders.names.length})
                            </summary>
                            <ul className="mt-2 text-sm text-gray-600 list-disc list-inside max-h-48 overflow-y-auto">
                                {preview.folders.names.map((name, i) => (
                                    <li key={i}>{name}</li>
                                ))}
                            </ul>
                        </details>
                    )}

                    <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                        <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                        <div>
                            <h3 className="font-medium text-amber-800">Before you import</h3>
                            <p className="text-sm text-amber-700 mt-1">
                                This will create new boards and content in your workspace. Existing content will not be affected or overwritten.
                            </p>
                        </div>
                    </div>
                </section>
            )}

            {/* Result summary */}
            {summary && (
                <section className="mb-8">
                    <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                        <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                        <div>
                            <h3 className="font-medium text-green-800">Import complete</h3>
                            <p className="text-sm text-green-700 mt-1">
                                Imported {summary.boardsImported} boards, {summary.padletsImported} padlets,{' '}
                                {summary.boardSectionsImported} sections, and {summary.foldersImported} folders.
                            </p>
                        </div>
                    </div>
                </section>
            )}

            {/* Import error (from the write step) */}
            {importError && (
                <section className="mb-8">
                    <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                        <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                        <div>
                            <h3 className="font-medium text-red-800">Import failed</h3>
                            <p className="text-sm text-red-700 mt-1">{importError}</p>
                        </div>
                    </div>
                </section>
            )}

            {/* Action buttons */}
            {file && (
                <div className="flex justify-end gap-3">
                    {summary && (
                        <button
                            onClick={resetFile}
                            className="px-6 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                        >
                            Import another file
                        </button>
                    )}
                    {preview && !summary && (
                        <button
                            onClick={handleConfirmImport}
                            disabled={importing}
                            className="px-6 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                        >
                            {importing ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Importing...
                                </>
                            ) : (
                                <>
                                    <Upload className="w-4 h-4" />
                                    Confirm Import
                                </>
                            )}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
