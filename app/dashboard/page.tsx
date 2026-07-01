// app/dashboard/page.tsx
"use client";

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import DashboardSidebar, { Folder } from '@/components/dashboard/DashboardSidebar';
import CanvasCard from '@/components/dashboard/CanvasCard';
import { Plus, Loader2, ArrowLeft, LayoutDashboard, Clock, Star, Trash2, Folder as FolderIcon, Settings, Palette, X } from 'lucide-react';
import Link from 'next/link';
import { createTemplate1Canvas } from '@/lib/collabboard/templates/template1';
import { resolveCurrentWorkspace, type WorkspaceContext } from '@/lib/workspace/context';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import EmojiPicker from 'emoji-picker-react';
import {
    canCreateBoardForEntitlements,
    getBoardLimitForEntitlements,
    getWorkspaceEntitlements,
} from '@/lib/auth/permissions';
import type { EntitlementsContext } from '@/types/permissions';

interface Canvas {
    id: number;
    title: string;
    description: string;
    layout: string;
    created_at: string;
    updated_at: string;
    thumbnail_url?: string | null;
    last_visited_at?: string | null;
    is_favorite?: boolean;
    folder_id?: string | null;
    deleted_at?: string | null;
    metadata?: Record<string, any> | null;
}

type FilterType = 'all' | 'recent' | 'mine' | 'favorites' | 'trash';

function formatError(err: unknown) {
    if (err instanceof Error) {
        return {
            name: err.name,
            message: err.message,
            stack: err.stack,
        };
    }

    if (typeof err === 'object' && err !== null) {
        const record = err as Record<string, unknown>;
        return {
            message: typeof record.message === 'string' ? record.message : 'Unknown error object',
            code: record.code,
            details: record.details,
            hint: record.hint,
            raw: record,
        };
    }

    return { message: String(err) };
}

export default function DashboardPage() {
    const router = useRouter();
    const supabase = supabaseBrowser();
    const [canvases, setCanvases] = useState<Canvas[]>([]);
    const [folders, setFolders] = useState<Folder[]>([]);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<any>(null);
    const [workspaceContext, setWorkspaceContext] = useState<WorkspaceContext | null>(null);
    const [entitlements, setEntitlements] = useState<EntitlementsContext>({ plan: 'free', status: 'free' });

    // Filter state
    const [activeFilter, setActiveFilter] = useState<FilterType>('all');
    const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
    const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [newFolderIcon, setNewFolderIcon] = useState('📁');
    const [isCreatingFolder, setIsCreatingFolder] = useState(false);
    const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);

            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                router.push('/auth');
                return;
            }
            setUser(user);

            const resolvedWorkspace = await resolveCurrentWorkspace(supabase, user).catch((workspaceError) => {
                console.warn('Workspace resolution fallback:', formatError(workspaceError));
                return null;
            });
            setWorkspaceContext(resolvedWorkspace);
            setEntitlements(await getWorkspaceEntitlements(supabase, resolvedWorkspace?.workspaceId));

            // Load canvases
            let canvasQuery = supabase
                .from('boards')
                .select('*')
                .order('updated_at', { ascending: false });

            canvasQuery = resolvedWorkspace
                ? canvasQuery.eq('workspace_id', resolvedWorkspace.workspaceId)
                : canvasQuery.eq('user_id', user.id);

            const { data: canvasData, error: canvasError } = await canvasQuery;

            if (canvasError) {
                console.error('Error loading canvases:', formatError(canvasError));
            } else {
                setCanvases(canvasData || []);
            }

            // Load folders (wrapped in try-catch in case table doesn't exist yet)
            try {
                let folderQuery = supabase
                    .from('folders')
                    .select('*')
                    .order('position', { ascending: true });

                folderQuery = resolvedWorkspace
                    ? folderQuery.eq('workspace_id', resolvedWorkspace.workspaceId)
                    : folderQuery.eq('user_id', user.id);

                const { data: folderData, error: folderError } = await folderQuery;

                if (folderError) {
                    console.error('Error loading folders:', formatError(folderError));
                } else if (folderData) {
                    const foldersWithCount = folderData.map(f => ({
                        id: f.id,
                        name: f.name,
                        icon: f.icon,
                        color: f.color,
                        canvasCount: (canvasData || []).filter(c => c.folder_id === f.id && !c.deleted_at).length
                    }));
                    setFolders(foldersWithCount);
                }
            } catch (folderLoadError) {
                console.error('Error during folder load:', formatError(folderLoadError));
            }
        } catch (err) {
            console.error('Error loading data:', formatError(err));
        } finally {
            setLoading(false);
        }
    };

    // Filter and search canvases
    const filteredCanvases = useMemo(() => {
        let result = canvases.filter(canvas => canvas.metadata?.showInWorkspaceDashboard !== false);

        // Apply folder filter
        if (selectedFolderId) {
            result = result.filter(c => c.folder_id === selectedFolderId && !c.deleted_at);
        } else {
            switch (activeFilter) {
                case 'recent':
                    result = result
                        .filter(c => !c.deleted_at)
                        .sort((a, b) => {
                            const aDate = a.last_visited_at || a.updated_at;
                            const bDate = b.last_visited_at || b.updated_at;
                            return new Date(bDate).getTime() - new Date(aDate).getTime();
                        });
                    break;
                case 'favorites':
                    result = result.filter(c => c.is_favorite && !c.deleted_at);
                    break;
                case 'trash':
                    result = result.filter(c => c.deleted_at);
                    break;
                case 'mine':
                case 'all':
                default:
                    result = result.filter(c => !c.deleted_at);
                    break;
            }
        }

        // Apply search
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            result = result.filter(c =>
                c.title.toLowerCase().includes(query) ||
                c.description?.toLowerCase().includes(query)
            );
        }

        return result;
    }, [canvases, activeFilter, selectedFolderId, searchQuery]);

    // Recently modified (last 6)
    const recentlyModified = useMemo(() => {
        return canvases
            .filter(c => !c.deleted_at)
            .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
            .slice(0, 6);
    }, [canvases]);

    // Recently visited (last 6)
    const recentlyVisited = useMemo(() => {
        return canvases
            .filter(c => !c.deleted_at && c.last_visited_at)
            .sort((a, b) => new Date(b.last_visited_at!).getTime() - new Date(a.last_visited_at!).getTime())
            .slice(0, 6);
    }, [canvases]);

    const handleDelete = async (canvasId: string | number) => {
        try {
            // Soft delete
            const { error } = await supabase
                .from('boards')
                .update({ deleted_at: new Date().toISOString() })
                .eq('id', canvasId);

            if (error) {
                console.error('Error deleting canvas:', error);
                return;
            }

            setCanvases(prev => prev.map(c =>
                c.id === canvasId ? { ...c, deleted_at: new Date().toISOString() } : c
            ));
        } catch (err) {
            console.error('Error deleting canvas:', err);
        }
    };

    const handleToggleFavorite = async (canvasId: string | number, isFavorite: boolean) => {
        try {
            const { error } = await supabase
                .from('boards')
                .update({ is_favorite: isFavorite })
                .eq('id', canvasId);

            if (error) {
                console.error('Error updating favorite:', error);
                return;
            }

            setCanvases(prev => prev.map(c =>
                c.id === canvasId ? { ...c, is_favorite: isFavorite } : c
            ));
        } catch (err) {
            console.error('Error updating favorite:', err);
        }
    };

    const handleCreateFolder = () => {
        setNewFolderName('');
        setNewFolderIcon('📁');
        setIsEmojiPickerOpen(false);
        setIsCreateFolderOpen(true);
    };

    const handleSubmitCreateFolder = async (event?: React.FormEvent) => {
        event?.preventDefault();
        const name = newFolderName.trim();
        if (!name) return;

        try {
            setIsCreatingFolder(true);
            const { data, error } = await supabase
                .from('folders')
                .insert([{
                    name,
                    icon: newFolderIcon,
                    user_id: user.id,
                    workspace_id: workspaceContext?.workspaceId ?? null
                }])
                .select()
                .single();

            if (error) {
                console.error('Error creating folder:', error);
                return;
            }

            setFolders(prev => [
                ...prev,
                { id: data.id, name: data.name, icon: data.icon, color: data.color, canvasCount: 0 }
            ]);
            setIsCreateFolderOpen(false);
            setNewFolderName('');
            setIsEmojiPickerOpen(false);
        } catch (err) {
            console.error('Error creating folder:', err);
        } finally {
            setIsCreatingFolder(false);
        }
    };

    const handleCreateTemplate1 = async () => {
        if (!user) return;
        if (!canCreateMoreBoards) {
            router.push('/dashboard/settings/billing');
            return;
        }
        try {
            setIsCreatingTemplate(true);
            const newBoardId = await createTemplate1Canvas(user.id, workspaceContext?.workspaceId ?? null);
            router.push(`/dashboard/canvas/${newBoardId}`);
        } catch (err) {
            console.error('Error creating template:', err);
            alert('Failed to create template');
        } finally {
            setIsCreatingTemplate(false);
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push('/login');
    };

    // Get section title based on filter
    const getSectionTitle = () => {
        if (selectedFolderId) {
            const folder = folders.find(f => f.id === selectedFolderId);
            return folder?.name || 'Folder';
        }
        switch (activeFilter) {
            case 'recent': return 'Recent Canvases';
            case 'mine': return 'Made by me';
            case 'favorites': return 'Favorite Canvases';
            case 'trash': return 'Trashed Canvases';
            default: return 'All Canvases';
        }
    };

    // Should show sections (only on 'all' filter with no folder selected)
    const showSections = activeFilter === 'all' && !selectedFolderId && !searchQuery;

    // Get current filter info for header
    const getFilterInfo = () => {
        if (selectedFolderId) {
            const folder = folders.find(f => f.id === selectedFolderId);
            return { icon: FolderIcon, label: folder?.name || 'Folder' };
        }
        switch (activeFilter) {
            case 'recent': return { icon: Clock, label: 'Recents' };
            case 'mine': return { icon: Palette, label: 'Made by me' };
            case 'favorites': return { icon: Star, label: 'Favorites' };
            case 'trash': return { icon: Trash2, label: 'Trashed' };
            default: return { icon: LayoutDashboard, label: 'All Canvases' };
        }
    };

    const filterInfo = getFilterInfo();
    const FilterIcon = filterInfo.icon;
    const activeCanvasCount = canvases.filter(c => !c.deleted_at).length;
    const boardLimit = getBoardLimitForEntitlements(entitlements);
    const canCreateMoreBoards = canCreateBoardForEntitlements(entitlements, activeCanvasCount);

    const handleCreateCanvasClick = () => {
        if (!canCreateMoreBoards) {
            router.push('/dashboard/settings/billing');
            return;
        }

        router.push('/dashboard/create-canvas');
    };

    return (
        <div className="flex flex-col h-screen bg-gray-50">
            {/* Top Header Bar */}
            <header className="bg-white border-b border-gray-200 px-6 py-3 flex-shrink-0">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => {
                                setActiveFilter('all');
                                setSelectedFolderId(null);
                                setSearchQuery('');
                            }}
                            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            <span className="text-sm">Back to Dashboard</span>
                        </button>
                        <div className="h-4 w-px bg-gray-300" />
                        <div className="flex items-center gap-2">
                            <FilterIcon className="w-5 h-5 text-gray-600" />
                            <span className="font-medium text-gray-900">{filterInfo.label}</span>
                        </div>
                    </div>
                    <Link
                        href="/dashboard/settings"
                        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
                    >
                        <Settings className="w-4 h-4" />
                        <span className="text-sm">Workspace Settings</span>
                    </Link>
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden">
                {/* Sidebar */}
                    <DashboardSidebar
                    userName={user?.user_metadata?.full_name || user?.email}
                    userEmail={user?.email}
                    folders={folders}
                    activeFilter={activeFilter}
                    onFilterChange={setActiveFilter}
                    onFolderSelect={setSelectedFolderId}
                    selectedFolderId={selectedFolderId}
                    onCreateFolder={handleCreateFolder}
                    onSearch={setSearchQuery}
                    onLogout={handleLogout}
                    canvasUsage={{
                        current: activeCanvasCount,
                        limit: boardLimit
                    }}
                />

                {/* Main Content */}
                <main className="flex-1 overflow-y-auto">
                    <div className="max-w-7xl mx-auto p-8">
                        {/* Header - only show on main dashboard view */}
                        {showSections && (
                            <div className="flex items-center justify-between mb-8">
                                <div>
                                    <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
                                    <p className="text-sm text-gray-500 mt-1">
                                        {canCreateMoreBoards
                                            ? 'Manage and organize your canvases'
                                            : `Free plan limit reached. Upgrade to create more than ${boardLimit} canvases.`}
                                    </p>
                                </div>
                                <button
                                    onClick={handleCreateCanvasClick}
                                    className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium transition-colors shadow-sm ${
                                        canCreateMoreBoards
                                            ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                            : 'bg-amber-100 hover:bg-amber-200 text-amber-900'
                                    }`}
                                >
                                    <Plus className="w-5 h-5" />
                                    {canCreateMoreBoards ? 'Create Canvas' : 'Upgrade for More'}
                                </button>
                                <button
                                    onClick={handleCreateTemplate1}
                                    disabled={isCreatingTemplate || !canCreateMoreBoards}
                                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors shadow-sm disabled:opacity-50"
                                >
                                    {isCreatingTemplate ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                                    Template 1
                                </button>
                            </div>
                        )}

                        {/* Loading State */}
                        {loading ? (
                            <div className="flex items-center justify-center py-20">
                                <div className="text-center">
                                    <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
                                    <p className="text-gray-600">Loading your canvases...</p>
                                </div>
                            </div>
                        ) : canvases.length === 0 ? (
                            /* Empty State */
                            <div className="text-center py-20">
                                <div className="text-6xl mb-4">🎨</div>
                                <h2 className="text-2xl font-semibold text-gray-800 mb-2">
                                    Create Your First Canvas
                                </h2>
                                <p className="text-gray-600 mb-6 max-w-md mx-auto">
                                    Start collaborating by creating your first canvas. Choose a layout and start adding content.
                                </p>
                                <button
                                    onClick={handleCreateCanvasClick}
                                    className={`inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors ${
                                        canCreateMoreBoards
                                            ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                            : 'bg-amber-100 hover:bg-amber-200 text-amber-900'
                                    }`}
                                >
                                    <Plus className="w-5 h-5" />
                                    {canCreateMoreBoards ? 'Create Canvas' : 'Upgrade for More'}
                                </button>
                            </div>
                        ) : (
                            <>
                                {/* Sections View */}
                                {showSections ? (
                                    <div className="space-y-10">
                                        {/* Recently Modified */}
                                        {recentlyModified.length > 0 && (
                                            <section>
                                                <h2 className="text-lg font-semibold text-blue-600 mb-4">
                                                    Recently modified by you
                                                </h2>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                                                    {recentlyModified.map((canvas) => (
                                                        <CanvasCard
                                                            key={canvas.id}
                                                            id={canvas.id}
                                                            title={canvas.title}
                                                            layout={canvas.layout}
                                                            thumbnailUrl={canvas.thumbnail_url}
                                                            updatedAt={canvas.updated_at}
                                                            lastVisitedAt={canvas.last_visited_at}
                                                            isFavorite={canvas.is_favorite}
                                                            onDelete={handleDelete}
                                                            onToggleFavorite={handleToggleFavorite}
                                                        />
                                                    ))}
                                                </div>
                                            </section>
                                        )}

                                        {/* Recently Visited */}
                                        {recentlyVisited.length > 0 && (
                                            <section>
                                                <h2 className="text-lg font-semibold text-blue-600 mb-4">
                                                    Recently visited by you
                                                </h2>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                                                    {recentlyVisited.map((canvas) => (
                                                        <CanvasCard
                                                            key={canvas.id}
                                                            id={canvas.id}
                                                            title={canvas.title}
                                                            layout={canvas.layout}
                                                            thumbnailUrl={canvas.thumbnail_url}
                                                            updatedAt={canvas.updated_at}
                                                            lastVisitedAt={canvas.last_visited_at}
                                                            isFavorite={canvas.is_favorite}
                                                            onDelete={handleDelete}
                                                            onToggleFavorite={handleToggleFavorite}
                                                        />
                                                    ))}
                                                </div>
                                            </section>
                                        )}

                                        {/* All Canvases */}
                                        <section>
                                            <h2 className="text-lg font-semibold text-gray-900 mb-4">
                                                All Canvases ({filteredCanvases.length})
                                            </h2>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                                                {filteredCanvases.map((canvas) => (
                                                    <CanvasCard
                                                        key={canvas.id}
                                                        id={canvas.id}
                                                        title={canvas.title}
                                                        layout={canvas.layout}
                                                        thumbnailUrl={canvas.thumbnail_url}
                                                        updatedAt={canvas.updated_at}
                                                        lastVisitedAt={canvas.last_visited_at}
                                                        isFavorite={canvas.is_favorite}
                                                        onDelete={handleDelete}
                                                        onToggleFavorite={handleToggleFavorite}
                                                    />
                                                ))}
                                            </div>
                                        </section>
                                    </div>
                                ) : (
                                    /* Filtered/Search View */
                                    <div>
                                        <h2 className="text-lg font-semibold text-gray-900 mb-4">
                                            {getSectionTitle()} ({filteredCanvases.length})
                                        </h2>

                                        {filteredCanvases.length === 0 ? (
                                            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                                                <p className="text-gray-500">No canvases found</p>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                                                {filteredCanvases.map((canvas) => (
                                                    <CanvasCard
                                                        key={canvas.id}
                                                        id={canvas.id}
                                                        title={canvas.title}
                                                        layout={canvas.layout}
                                                        thumbnailUrl={canvas.thumbnail_url}
                                                        updatedAt={canvas.updated_at}
                                                        lastVisitedAt={canvas.last_visited_at}
                                                        isFavorite={canvas.is_favorite}
                                                        onDelete={activeFilter === 'trash' ? undefined : handleDelete}
                                                        onToggleFavorite={handleToggleFavorite}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </main>
            </div>

            <Dialog
                open={isCreateFolderOpen}
                onOpenChange={(open) => {
                    setIsCreateFolderOpen(open);
                    if (!open) {
                        setNewFolderName('');
                        setIsEmojiPickerOpen(false);
                    }
                }}
            >
                <DialogContent className="sm:max-w-[520px]">
                    <DialogHeader>
                        <DialogTitle>Create collection</DialogTitle>
                        <DialogDescription>Choose an icon and give the collection a name.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSubmitCreateFolder} className="space-y-6">
                        <div className="grid grid-cols-[64px_minmax(0,1fr)] items-start gap-4">
                            <div className="space-y-2">
                                <span className="text-xs font-semibold text-gray-500">Icon</span>
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setIsEmojiPickerOpen((prev) => !prev)}
                                        className="flex h-12 w-12 items-center justify-center rounded-lg border border-gray-200 bg-white text-2xl shadow-sm transition hover:border-blue-400"
                                    >
                                        {newFolderIcon}
                                    </button>
                                    {isEmojiPickerOpen && (
                                        <div
                                            className="absolute left-0 top-14 z-[60]"
                                            onMouseDown={(e) => e.preventDefault()}
                                        >
                                            <div className="relative">
                                                <button
                                                    type="button"
                                                    onClick={() => setIsEmojiPickerOpen(false)}
                                                    className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded hover:bg-gray-100"
                                                    title="Close"
                                                >
                                                    <X className="h-3.5 w-3.5 text-gray-500" />
                                                </button>
                                                <EmojiPicker
                                                    onEmojiClick={(emojiData) => {
                                                        setNewFolderIcon(emojiData.emoji);
                                                        setIsEmojiPickerOpen(false);
                                                    }}
                                                    width={320}
                                                    height={360}
                                                    searchPlaceHolder="Search"
                                                    previewConfig={{ showPreview: false }}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="space-y-2">
                                <span className="text-xs font-semibold text-gray-500">Collection name</span>
                                <Input
                                    value={newFolderName}
                                    onChange={(e) => setNewFolderName(e.target.value)}
                                    placeholder="Enter a collection name"
                                    autoFocus
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => setIsCreateFolderOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" loading={isCreatingFolder} disabled={!newFolderName.trim()}>
                                Create collection
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
