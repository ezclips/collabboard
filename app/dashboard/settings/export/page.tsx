'use client';

import React, { useState, useEffect } from 'react';
import { Globe, Download, Users, Info, Loader2, Sparkles } from 'lucide-react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { toast } from 'sonner';
import { resolveCurrentWorkspace } from '@/lib/workspace/context';

type ExportType = 'accessible' | 'all' | 'team-member';

interface ExportHistory {
    id: string;
    type: ExportType;
    status: 'pending' | 'completed' | 'failed';
    created_at: string;
    download_url?: string;
    expires_at?: string;
}

export default function ExportPage() {
    const supabase = createClientComponentClient();
    const [selectedType, setSelectedType] = useState<ExportType>('accessible');
    const [exporting, setExporting] = useState(false);
    const [exportHistory, setExportHistory] = useState<ExportHistory[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadExportHistory();
    }, []);

    const loadExportHistory = async () => {
        try {
            setLoading(true);
            // Try to load export history from database
            // For now, just show empty state
            setExportHistory([]);
        } catch (err) {
            console.error('Error loading export history:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleExport = async () => {
        try {
            setExporting(true);
            
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const workspaceContext = await resolveCurrentWorkspace(supabase, user);

            // Fetch all user data for export
            const exportData: any = {
                exportedAt: new Date().toISOString(),
                exportType: selectedType,
                version: '1.0'
            };

            // Fetch boards/scenes
            let boardsQuery = supabase
                .from('boards')
                .select('*')
                .is('deleted_at', null);

            boardsQuery = workspaceContext
                ? boardsQuery.eq('workspace_id', workspaceContext.workspaceId)
                : boardsQuery.eq('user_id', user.id);

            const { data: boards } = await boardsQuery;
            exportData.boards = boards || [];
            exportData.scenes = exportData.boards;

            // Fetch padlets
            if (boards && boards.length > 0) {
                const boardIds = boards.map(b => b.id);
                const { data: padlets } = await supabase
                    .from('padlets')
                    .select('*')
                    .in('board_id', boardIds);
                exportData.padlets = padlets || [];
            }

            // Fetch folders/collections
            let foldersQuery = supabase
                .from('folders')
                .select('*');

            foldersQuery = workspaceContext
                ? foldersQuery.eq('workspace_id', workspaceContext.workspaceId)
                : foldersQuery.eq('user_id', user.id);

            const { data: folders } = await foldersQuery;
            exportData.folders = folders || [];
            exportData.collections = exportData.folders;

            // Generate and download ZIP file
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `workspace-export-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            toast.success('Export completed! Your download should start automatically.');
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
                        You can export your workspace to a zip file. The zip file will contain all the scenes in your workspace.
                    </p>
                </div>

                <div className="col-span-2">
                    {/* Info Banner */}
                    <div className="flex gap-3 p-4 bg-purple-50 border border-purple-200 rounded-lg mb-6">
                        <Info className="w-5 h-5 text-purple-500 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-purple-700">
                            The export process may take some time, depending on the size of your workspace. You will receive an email with a download link when the export is ready.
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
                                        <p className="text-sm text-gray-500 mt-1">Public, and your own private scenes</p>
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

                    {/* Export Button */}
                    <button
                        onClick={handleExport}
                        disabled={exporting}
                        className="px-6 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                        {exporting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Exporting...
                            </>
                        ) : (
                            'Export'
                        )}
                    </button>
                </div>
            </div>

            <hr className="border-gray-200 my-8" />

            {/* Workspace export history section */}
            <div className="grid grid-cols-3 gap-8">
                <div>
                    <h2 className="text-lg font-semibold text-purple-600 mb-2">
                        Workspace export history
                        <span className="ml-2 text-gray-400 font-normal">{exportHistory.length}</span>
                    </h2>
                    <p className="text-sm text-gray-500">
                        View the history of your workspace exports. Download links are valid for 7 days.
                    </p>
                </div>

                <div className="col-span-2">
                    {exportHistory.length === 0 ? (
                        <p className="text-gray-500">No exports found for this workspace.</p>
                    ) : (
                        <div className="space-y-3">
                            {exportHistory.map((item) => (
                                <div 
                                    key={item.id}
                                    className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200"
                                >
                                    <div>
                                        <p className="font-medium text-gray-900">
                                            {item.type === 'accessible' ? 'Accessible scenes' : 
                                             item.type === 'all' ? 'All scenes' : 'Team-member scenes'}
                                        </p>
                                        <p className="text-sm text-gray-500">
                                            {new Date(item.created_at).toLocaleDateString()} at {new Date(item.created_at).toLocaleTimeString()}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {item.status === 'pending' && (
                                            <span className="text-sm text-yellow-600">Processing...</span>
                                        )}
                                        {item.status === 'completed' && item.download_url && (
                                            <a
                                                href={item.download_url}
                                                className="px-3 py-1 bg-purple-100 text-purple-700 rounded-lg text-sm font-medium hover:bg-purple-200 transition-colors"
                                            >
                                                Download
                                            </a>
                                        )}
                                        {item.status === 'failed' && (
                                            <span className="text-sm text-red-600">Failed</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
