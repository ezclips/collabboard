'use client';

import React, { useState, useRef } from 'react';
import { Upload, FileJson, AlertCircle, Check, Loader2, FileUp } from 'lucide-react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { toast } from 'sonner';
import { resolveCurrentWorkspace } from '@/lib/workspace/context';

interface ImportPreview {
    boards: number;
    padlets: number;
    folders: number;
    settings: boolean;
}

export default function ImportPage() {
    const supabase = createClientComponentClient();
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<ImportPreview | null>(null);
    const [importing, setImporting] = useState(false);
    const [importOptions, setImportOptions] = useState({
        overwriteExisting: false,
        importFolders: true,
        importSettings: false
    });

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) return;

        if (!selectedFile.name.endsWith('.json')) {
            toast.error('Please select a JSON file');
            return;
        }

        setFile(selectedFile);

        // Parse and preview
        try {
            const text = await selectedFile.text();
            const data = JSON.parse(text);

            setPreview({
                boards: data.boards?.length || data.scenes?.length || 0,
                padlets: data.padlets?.length || 0,
                folders: data.folders?.length || data.collections?.length || 0,
                settings: !!data.settings
            });
        } catch (err) {
            toast.error('Invalid JSON file');
            setFile(null);
            setPreview(null);
        }
    };

    const handleImport = async () => {
        if (!file) return;

        try {
            setImporting(true);

            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const workspaceContext = await resolveCurrentWorkspace(supabase, user);

            const text = await file.text();
            const data = JSON.parse(text);
            const importedFolders = data.folders || data.collections || [];
            const importedBoards = data.boards || data.scenes || [];

            let importedCount = { boards: 0, padlets: 0, folders: 0 };
            const folderIdMap: Record<string, string> = {};

            // Import folders first
            if (importOptions.importFolders && importedFolders.length) {
                
                for (const folder of importedFolders) {
                    const { id: oldId, user_id, created_at, updated_at, ...folderData } = folder;
                    
                    const { data: newFolder, error } = await supabase
                        .from('folders')
                        .insert({ ...folderData, user_id: user.id, workspace_id: workspaceContext?.workspaceId ?? null })
                        .select()
                        .single();

                    if (!error && newFolder) {
                        folderIdMap[oldId] = newFolder.id;
                        importedCount.folders++;
                    }
                }
            }

            // Import boards
            if (importedBoards.length) {
                for (const board of importedBoards) {
                    const { id: oldId, user_id, created_at, updated_at, folder_id, ...boardData } = board;
                    const nextFolderId = folder_id ? folderIdMap[folder_id] || null : null;
                    
                    const { data: newBoard, error } = await supabase
                        .from('boards')
                        .insert({
                            ...boardData,
                            user_id: user.id,
                            workspace_id: workspaceContext?.workspaceId ?? null,
                            folder_id: nextFolderId,
                        })
                        .select()
                        .single();

                    if (!error && newBoard) {
                        importedCount.boards++;

                        // Import padlets for this board
                        const boardPadlets = data.padlets?.filter((p: any) => p.board_id === oldId) || [];
                        for (const padlet of boardPadlets) {
                            const { id: padletOldId, board_id, created_at, updated_at, ...padletData } = padlet;
                            
                            const { error: padletError } = await supabase
                                .from('padlets')
                                .insert({ ...padletData, board_id: newBoard.id });

                            if (!padletError) {
                                importedCount.padlets++;
                            }
                        }
                    }
                }
            }

            toast.success(`Imported ${importedCount.boards} boards, ${importedCount.padlets} padlets, ${importedCount.folders} folders`);
            
            // Reset
            setFile(null);
            setPreview(null);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        } catch (err) {
            console.error('Error importing:', err);
            toast.error('Failed to import data');
        } finally {
            setImporting(false);
        }
    };

    return (
        <div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">Workspace Import</h1>
            <p className="text-gray-500 mb-8">
                Import data from a previous export or another workspace.
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
                        accept=".json"
                        onChange={handleFileSelect}
                        className="hidden"
                    />
                    
                    {file ? (
                        <div className="flex flex-col items-center">
                            <FileJson className="w-12 h-12 text-purple-600 mb-3" />
                            <p className="font-medium text-gray-900">{file.name}</p>
                            <p className="text-sm text-gray-500 mt-1">
                                {(file.size / 1024).toFixed(1)} KB
                            </p>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setFile(null);
                                    setPreview(null);
                                    if (fileInputRef.current) {
                                        fileInputRef.current.value = '';
                                    }
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
                                JSON files exported from CollabBoard
                            </p>
                        </div>
                    )}
                </div>
            </section>

            {/* Preview */}
            {preview && (
                <section className="mb-8">
                    <h2 className="text-lg font-medium text-gray-900 mb-4">Import Preview</h2>
                    <div className="bg-white rounded-lg border border-gray-200 p-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="text-center p-4 bg-gray-50 rounded-lg">
                                <div className="text-2xl font-bold text-gray-900">{preview.boards}</div>
                                <div className="text-sm text-gray-500">Boards</div>
                            </div>
                            <div className="text-center p-4 bg-gray-50 rounded-lg">
                                <div className="text-2xl font-bold text-gray-900">{preview.padlets}</div>
                                <div className="text-sm text-gray-500">Padlets</div>
                            </div>
                            <div className="text-center p-4 bg-gray-50 rounded-lg">
                                <div className="text-2xl font-bold text-gray-900">{preview.folders}</div>
                                <div className="text-sm text-gray-500">Folders</div>
                            </div>
                            <div className="text-center p-4 bg-gray-50 rounded-lg">
                                <div className="text-2xl font-bold text-gray-900">
                                    {preview.settings ? <Check className="w-6 h-6 mx-auto text-green-600" /> : '—'}
                                </div>
                                <div className="text-sm text-gray-500">Settings</div>
                            </div>
                        </div>
                    </div>
                </section>
            )}

            {/* Import Options */}
            {preview && (
                <section className="mb-8">
                    <h2 className="text-lg font-medium text-gray-900 mb-4">Import Options</h2>
                    <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-200">
                        <label className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50">
                            <div>
                                <h3 className="font-medium text-gray-900">Import folders</h3>
                                <p className="text-sm text-gray-500">Recreate the folder structure from the export</p>
                            </div>
                            <input
                                type="checkbox"
                                checked={importOptions.importFolders}
                                onChange={(e) => setImportOptions(prev => ({
                                    ...prev,
                                    importFolders: e.target.checked
                                }))}
                                className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                            />
                        </label>
                        <label className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50">
                            <div>
                                <h3 className="font-medium text-gray-900">Import workspace settings</h3>
                                <p className="text-sm text-gray-500">Override your current workspace name and logo</p>
                            </div>
                            <input
                                type="checkbox"
                                checked={importOptions.importSettings}
                                onChange={(e) => setImportOptions(prev => ({
                                    ...prev,
                                    importSettings: e.target.checked
                                }))}
                                disabled={!preview.settings}
                                className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500 disabled:opacity-50"
                            />
                        </label>
                    </div>
                </section>
            )}

            {/* Warning */}
            {preview && (
                <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg mb-8">
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                        <h3 className="font-medium text-amber-800">Before you import</h3>
                        <p className="text-sm text-amber-700 mt-1">
                            This will create new boards and content in your workspace. Existing content will not be affected or overwritten.
                        </p>
                    </div>
                </div>
            )}

            {/* Import Button */}
            {preview && (
                <div className="flex justify-end">
                    <button
                        onClick={handleImport}
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
                                Start Import
                            </>
                        )}
                    </button>
                </div>
            )}
        </div>
    );
}
