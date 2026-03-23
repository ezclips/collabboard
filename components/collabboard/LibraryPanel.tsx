'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
    X,
    Book,
    BookOpen,
    Trash2,
    FileText,
    Image as ImageIcon,
    Loader2,
    ChevronDown,
    ChevronRight,
    Edit2,
    FolderOpen,
    Download,
    Search,
    Plus,
    Link as LinkIcon,
    CheckSquare,
    Check,
    PenTool,
    MessageCircle,
    Table as TableIcon,
    CloudUpload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    fetchLibraryItems,
    deleteFromLibrary,
    addToLibrary,
    LibraryItem,
} from '@/lib/collabboard/library';
import {
    getExcalidrawLibrary,
    fetchExcalidrawLibrary,
    removeFromExcalidrawLibrary,
    addToExcalidrawLibrary,
    clearExcalidrawLibrary,
    migrateLocalStorageToDatabase,
    ExcalidrawLibraryItem,
} from '@/lib/collabboard/excalidrawLibrary';
import ExcalidrawBrowseModal from './ExcalidrawBrowseModal';
import ExternalClipartBrowserModal, { ExternalClipartItem } from './ExternalClipartBrowserModal';

interface LibraryPanelProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect?: (item: LibraryItem) => void;
    onSelectClipart?: (svgUrl: string, title: string) => void;
    onClipartClick?: (svgUrl: string, title: string) => void;
    isIconReplaceMode?: boolean;
}

function stripHtml(input?: string) {
    if (!input) return '';
    return input.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&#160;/g, ' ').trim();
}

function clampText(input: string, max = 90) {
    const s = input.trim();
    if (s.length <= max) return s;
    return s.slice(0, max - 1).trimEnd() + '…';
}

function getTypeIcon(type?: string) {
    switch (type) {
        case 'image':
            return ImageIcon;
        case 'link':
            return LinkIcon;
        case 'todo':
            return CheckSquare;
        case 'table':
            return TableIcon;
        case 'drawing':
            return PenTool;
        case 'comment':
            return MessageCircle;
        default:
            return FileText;
    }
}

function typeLabel(type?: string) {
    switch (type) {
        case 'image':
            return 'Image';
        case 'link':
            return 'Link';
        case 'todo':
            return 'To-do';
        case 'table':
            return 'Table';
        case 'drawing':
            return 'Drawing';
        case 'comment':
            return 'Comment';
        default:
            return 'Note';
    }
}

function resolvePreview(item: LibraryItem) {
    const c: any = item.content || {};
    const t = c.type || item.type || 'note';

    const title =
        item.title ||
        c.title ||
        (t === 'image' ? 'Image' : t === 'link' ? 'Link' : t === 'todo' ? 'To-do' : 'Untitled');

    // Thumbnail sources
    const thumb =
        c.metadata?.previewUrl ||
        c.metadata?.imageUrl ||
        c.file_url ||
        c.metadata?.file_url ||
        c.metadata?.linkImage ||
        c.file_url;

    // Subtitle / snippet
    let subtitle = '';
    if (t === 'link') {
        const domain = c.metadata?.linkDomain || (() => {
            try {
                const u = new URL(c.metadata?.linkUrl || c.content || '');
                return u.hostname.replace(/^www\./, '');
            } catch {
                return '';
            }
        })();
        subtitle = domain || clampText(stripHtml(c.metadata?.linkTitle || c.title || c.content || ''), 60);
    } else if (t === 'todo') {
        const tasks = c.metadata?.tasks;
        if (Array.isArray(tasks)) {
            const done = tasks.filter((x: any) => x?.completed).length;
            subtitle = `${done}/${tasks.length} done`;
        } else {
            subtitle = 'To-do list';
        }
    } else if (t === 'table') {
        subtitle = 'Spreadsheet';
    } else if (t === 'comment') {
        const comments = c.metadata?.comments;
        subtitle = Array.isArray(comments) ? `${comments.length} comments` : 'Comment';
    } else if (t === 'drawing') {
        subtitle = 'Sketch';
    } else {
        // Note/text fallback
        subtitle = clampText(stripHtml(c.content || ''), 80) || 'Empty note';
    }

    return { title, subtitle, type: t, thumb };
}

export default function LibraryPanel({
    isOpen,
    onClose,
    onSelect,
    onSelectClipart,
    onClipartClick,
    isIconReplaceMode = false
}: LibraryPanelProps) {
    const fileInputRef = React.useRef<HTMLInputElement>(null);
    const externalFileInputRef = React.useRef<HTMLInputElement>(null);

    const [activeTab, setActiveTab] = useState<'search' | 'library'>('library');

    const [personalItems, setPersonalItems] = useState<LibraryItem[]>([]);
    const [isPersonalExpanded, setIsPersonalExpanded] = useState(true);
    const [isPersonalLoading, setIsPersonalLoading] = useState(true);
    const [personalError, setPersonalError] = useState<string | null>(null);

    const [excalidrawItems, setExcalidrawItems] = useState<ExcalidrawLibraryItem[]>([]);
    const [isExcalidrawExpanded, setIsExcalidrawExpanded] = useState(true);
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

    const [isBrowseOpen, setIsBrowseOpen] = useState(false);
    const [isDraggingOverPersonal, setIsDraggingOverPersonal] = useState(false);

    const [externalCliparts, setExternalCliparts] = useState<ExternalClipartItem[]>([]);
    const [selectedExternalIds, setSelectedExternalIds] = useState<Set<string>>(new Set());
    const [isClipartModalOpen, setIsClipartModalOpen] = useState(false);

    const loadLibraries = async () => {
        setIsPersonalLoading(true);
        setPersonalError(null);
        try {
            const allItems = await fetchLibraryItems();

            // Split items into categories
            const personal = allItems.filter(i => i.type !== 'clipart');
            const external = allItems
                .filter(i => i.type === 'clipart')
                .map(i => ({
                    id: i.id,
                    svgUrl: i.content.content,
                    title: i.title,
                    source: i.content.metadata?.source || 'web',
                    createdAt: new Date(i.created_at).getTime()
                })) as ExternalClipartItem[];

            setPersonalItems(personal);
            setExternalCliparts(external);
        } catch (err) {
            console.error('Failed to load libraries:', err);
            setPersonalError('Could not load items');
        } finally {
            setIsPersonalLoading(false);
        }
    };

    const loadExcalidrawLibrary = async () => {
        // First, try to migrate any localStorage items to database
        await migrateLocalStorageToDatabase();
        // Then fetch from database
        const items = await fetchExcalidrawLibrary();
        setExcalidrawItems(items);
    };

    useEffect(() => {
        if (isOpen) {
            loadLibraries();
            loadExcalidrawLibrary();
            setSelectedExternalIds(new Set());
        }

        const handleLibraryUpdate = () => {
            loadLibraries();
            loadExcalidrawLibrary();
        };

        window.addEventListener('library-updated', handleLibraryUpdate);
        return () => window.removeEventListener('library-updated', handleLibraryUpdate);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    const handleDeletePersonal = async (e: React.MouseEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();

        console.log('[Library] Deleting item:', id);

        // Optimistic UI remove (instant)
        const prevItems = personalItems;
        setPersonalItems((prev) => prev.filter((item) => item.id !== id));

        try {
            console.log('[Library] deleting item:', id);
            await deleteFromLibrary(id);
            console.log('[Library] delete success:', id);
        } catch (err) {
            console.error('[Library] delete failed:', err);

            // Rollback UI if backend delete failed
            setPersonalItems(prevItems);

            alert(
                'Delete failed. Check console. Most common causes: not logged in, RLS policy blocking delete, or network error.'
            );
        }
    };

    const handleDeleteExcalidraw = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!confirm('Are you sure you want to remove this library?')) return;
        await removeFromExcalidrawLibrary(id);
        await loadExcalidrawLibrary();
    };

    const handleResetPersonalLibrary = async () => {
        if (!confirm('Are you sure you want to delete all items in your Personal Library?')) return;
        alert('Mass delete not yet implemented. Please delete items individually.');
    };

    const handleExportLibrary = () => {
        if (personalItems.length === 0) {
            alert('Your library is empty.');
            return;
        }
        const data = {
            version: 1,
            type: 'collabboard-library',
            items: personalItems,
            exportedAt: new Date().toISOString()
        };
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `collabboard-library-${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    const handleResetExcalidrawLibrary = async () => {
        if (!confirm('Are you sure you want to reset your External Library?')) return;
        await clearExcalidrawLibrary();
        setExcalidrawItems([]);
    };

    const handleExternalOpen = () => {
        externalFileInputRef.current?.click();
    };

    const handleExternalFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const text = await file.text();
            const json = JSON.parse(text);

            // Accept either our own export format or excalidraw library format
            const sourceItems = json.libraryItems || json.library || json.items || [];
            if (!Array.isArray(sourceItems)) throw new Error('Invalid library file format');

            const items: ExcalidrawLibraryItem[] = sourceItems.map((item: any) => ({
                id: item.id || Math.random().toString(36).slice(2),
                name: item.name || item.title || file.name.replace(/\.(json|excalidrawlib)$/i, ''),
                elements: item.elements || [],
                source: 'local-import',
                created: item.created || Date.now(),
            }));

            for (const item of items) {
                await addToExcalidrawLibrary(item);
            }
            await loadExcalidrawLibrary();
            alert(`Imported ${items.length} items.`);
        } catch (err) {
            console.error('External import failed:', err);
            alert('Failed to import library file.');
        } finally {
            if (externalFileInputRef.current) externalFileInputRef.current.value = '';
        }
    };

    const handleExportExternalLibrary = () => {
        if (excalidrawItems.length === 0) {
            alert('External library is empty.');
            return;
        }

        const data = {
            version: 1,
            type: 'collabboard-external-library',
            libraryItems: excalidrawItems.map((i) => ({
                name: i.name,
                elements: i.elements,
            })),
            exportedAt: new Date().toISOString(),
        };

        const dataStr = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(data, null, 2));
        const a = document.createElement('a');
        a.setAttribute('href', dataStr);
        a.setAttribute('download', `collabboard-external-library-${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(a);
        a.click();
        a.remove();
    };

    const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const text = await file.text();
            const libraryData = JSON.parse(text);

            const sourceItems = libraryData.libraryItems || libraryData.library || [];
            if (!Array.isArray(sourceItems)) throw new Error('Invalid library format');

            const items: ExcalidrawLibraryItem[] = sourceItems.map((item: any) => ({
                id: Math.random().toString(36).substr(2, 9),
                name: item.name || file.name.replace('.excalidrawlib', ''),
                elements: item.elements || [],
                source: 'local-import',
                created: Date.now(),
            }));

            for (const item of items) {
                await addToExcalidrawLibrary(item);
            }
            await loadExcalidrawLibrary();
            alert(`Successfully imported ${items.length} items from ${file.name}`);
        } catch (err) {
            console.error('Failed to import library:', err);
            alert('Failed to import library file. Please ensure it is a valid .excalidrawlib file.');
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDropOnPersonal = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDraggingOverPersonal(false);

        const data = e.dataTransfer.getData('application/collabboard-padlet');
        console.log('📥 Library Drop detected:', data ? 'Data found' : 'No data');
        if (!data) return;

        try {
            const padletData = JSON.parse(data);
            console.log('📋 Parsed padlet data:', padletData);

            await addToLibrary({
                type: padletData.type || 'note',
                title: padletData.title || 'Untitled',
                content: {
                    title: padletData.title || 'Untitled',
                    content: padletData.content,
                    type: padletData.type,
                    width: padletData.width || 300,
                    height: padletData.height || 200,
                    // Strip parentId/childPadletIds so re-dropped items always go through PlacementPrompt
                    metadata: (() => {
                        const { parentId: _p, childPadletIds: _c, ...m } = padletData.metadata || {};
                        return m;
                    })(),
                    // file_url is a top-level padlet field, not inside metadata
                    file_url: padletData.file_url || padletData.metadata?.imageUrl,
                    file_name: padletData.file_name || padletData.metadata?.file_name,
                    file_type: padletData.file_type || padletData.metadata?.file_type,
                },
                is_public: false,
            });

            console.log('✅ Added to library successfully');
            loadLibraries();
        } catch (err) {
            console.error('❌ Failed to add padlet to library:', err);
            alert('Failed to save item to library.');
        }
    };

    const personalPreviews = useMemo(() => {
        return personalItems.map((item) => ({
            item,
            preview: resolvePreview(item),
        }));
    }, [personalItems]);

    const handleAddExternalCliparts = async (items: ExternalClipartItem[]) => {
        // Save to Supabase
        for (const item of items) {
            try {
                await addToLibrary({
                    type: 'clipart',
                    title: item.title,
                    content: {
                        title: item.title,
                        content: item.svgUrl,
                        type: 'clipart',
                        width: 100,
                        height: 100,
                        metadata: { source: item.source }
                    },
                    is_public: false
                });
            } catch (err) {
                console.error('Failed to save clipart:', err);
            }
        }
        loadLibraries();
    };


    const handleDeleteSelectedExternal = async () => {
        if (selectedExternalIds.size === 0) return;

        // No confirm dialog here anymore - the button handles the UI verification
        // Optimistic
        setExternalCliparts(prev => prev.filter(p => !selectedExternalIds.has(p.id)));

        for (const id of selectedExternalIds) {
            try {
                await deleteFromLibrary(id);
            } catch (err) {
                console.error('Failed to delete clipart:', id, err);
            }
        }

        setSelectedExternalIds(new Set());
        loadLibraries(); // Sync
        setIsConfirmingDelete(false);
    };

    const handleDeleteOneExternal = async (id: string) => {
        const ok = confirm('Delete this clipart item?');
        if (!ok) return;

        // Optimistic
        setExternalCliparts(prev => prev.filter(p => p.id !== id));

        try {
            await deleteFromLibrary(id);
            loadLibraries();
        } catch (err) {
            console.error('Failed to delete clipart:', err);
            loadLibraries(); // Rollback
        }
    };

    if (!isOpen) return null;

    return (
        <>
            <div className="fixed top-[64px] left-[56px] h-[calc(100vh-64px)] w-80 bg-white border-r shadow-2xl z-[70000] flex flex-col animate-in slide-in-from-left duration-300">
                {/* Header with Tabs */}
                <div className="px-3 py-2 border-b flex items-center justify-between bg-white">
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                        <button
                            onClick={() => setActiveTab('search')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'search'
                                ? 'bg-white shadow-sm text-blue-600'
                                : 'text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            <Search className="w-4 h-4" />
                            Search
                        </button>
                        <button
                            onClick={() => setActiveTab('library')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'library'
                                ? 'bg-white shadow-sm text-blue-600'
                                : 'text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            <BookOpen className="w-4 h-4" />
                            Library
                        </button>
                    </div>
                    <div className="flex items-center gap-1">

                        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 text-gray-400">
                            <X className="w-4 h-4" />
                        </Button>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {activeTab === 'library' ? (
                        <div className="flex flex-col">
                            {/* Personal Library Section */}
                            <div className="border-b transition-colors bg-white">
                                <div
                                    className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors group cursor-pointer"
                                    onClick={() => setIsPersonalExpanded(!isPersonalExpanded)}
                                >
                                    <div className="flex items-center gap-2">
                                        {isPersonalExpanded ? (
                                            <ChevronDown className="w-4 h-4 text-gray-400" />
                                        ) : (
                                            <ChevronRight className="w-4 h-4 text-gray-400" />
                                        )}
                                        <span className="font-semibold text-gray-700 text-sm">Personal Library</span>
                                    </div>




                                </div>

                                {isPersonalExpanded && (
                                    <div className="px-4 pb-4">
                                        {isPersonalLoading ? (
                                            <div className="flex flex-col items-center justify-center py-6 text-gray-400">
                                                <Loader2 className="w-5 h-5 animate-spin mb-2" />
                                                <span className="text-xs">Loading items...</span>
                                            </div>
                                        ) : (
                                            <>
                                                {personalError ? (
                                                    <div className="py-6 text-center text-sm text-red-600">{personalError}</div>
                                                ) : null}

                                                {/* Always-on drop target */}
                                                <div
                                                    onDragOver={(e) => {
                                                        e.preventDefault();
                                                        e.dataTransfer.dropEffect = 'copy';
                                                        setIsDraggingOverPersonal(true);
                                                    }}
                                                    onDragLeave={() => setIsDraggingOverPersonal(false)}
                                                    onDrop={handleDropOnPersonal}
                                                    className={`rounded-lg transition-colors ${isDraggingOverPersonal ? 'bg-blue-50/50' : ''
                                                        }`}
                                                >
                                                    {personalItems.length === 0 ? (
                                                        <div
                                                            className={`min-h-[120px] py-8 text-center rounded-lg border-2 border-dashed transition-colors ${isDraggingOverPersonal
                                                                ? 'border-blue-400 bg-blue-50'
                                                                : 'border-gray-200 bg-gray-50'
                                                                }`}
                                                        >
                                                            <p className="text-xs text-gray-400 px-4">
                                                                No items added yet... Select an item on canvas to add it here.
                                                            </p>
                                                        </div>
                                                    ) : (
                                                        <div className="grid grid-cols-2 gap-2">
                                                            {personalPreviews.map(({ item, preview }) => {
                                                                const Icon = getTypeIcon(preview.type);
                                                                const hasThumb = !!preview.thumb && preview.type === 'image';

                                                                return (
                                                                    <div
                                                                        key={item.id}
                                                                        draggable
                                                                        onClick={() => onSelect?.(item)}
                                                                        onDragStart={(e) => {
                                                                            // If drag originates from a "no-drag" element, cancel it
                                                                            const target = e.target as HTMLElement;
                                                                            if (target?.closest?.('[data-no-drag="true"]')) {
                                                                                e.preventDefault();
                                                                                return;
                                                                            }

                                                                            e.dataTransfer.setData(
                                                                                'application/collabboard-library',
                                                                                JSON.stringify(item.content),
                                                                            );
                                                                            e.dataTransfer.effectAllowed = 'copyMove';
                                                                        }}
                                                                        className="rounded-lg border border-gray-100 hover:border-blue-400 hover:bg-white cursor-grab active:cursor-grabbing transition-all hover:shadow-sm group overflow-hidden bg-gray-50"
                                                                        title={preview.title}
                                                                    >
                                                                        <div className="relative">
                                                                            {/* thumb / icon */}
                                                                            <div className="h-20 w-full flex items-center justify-center bg-white">
                                                                                {hasThumb ? (
                                                                                    // eslint-disable-next-line @next/next/no-img-element
                                                                                    <img
                                                                                        src={preview.thumb}
                                                                                        alt={preview.title}
                                                                                        className="h-20 w-full object-cover"
                                                                                        draggable={false}
                                                                                    />
                                                                                ) : (
                                                                                    <div className="h-20 w-full flex items-center justify-center">
                                                                                        <Icon className="w-7 h-7 text-gray-400" />
                                                                                    </div>
                                                                                )}
                                                                            </div>

                                                                            {/* delete */}
                                                                            <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
                                                                                <button
                                                                                    type="button"
                                                                                    draggable={false}
                                                                                    data-no-drag="true"
                                                                                    onPointerDown={(e) => {
                                                                                        e.preventDefault();
                                                                                        e.stopPropagation();
                                                                                    }}
                                                                                    onClick={(e) => {
                                                                                        console.log('[Library] X button clicked for item:', item.id);
                                                                                        handleDeletePersonal(e, item.id);
                                                                                    }}
                                                                                    className="p-1 rounded bg-white/80 hover:bg-white shadow-sm hover:text-red-500"
                                                                                    aria-label="Delete"
                                                                                >
                                                                                    <X className="w-3 h-3" />
                                                                                </button>
                                                                            </div>

                                                                            {/* type badge */}
                                                                            <div className="absolute left-1 top-1">
                                                                                <div className="text-[10px] px-1.5 py-0.5 rounded bg-white/80 text-gray-600 border border-gray-200">
                                                                                    {typeLabel(preview.type)}
                                                                                </div>
                                                                            </div>
                                                                        </div>

                                                                        {/* title + subtitle */}
                                                                        <div className="p-2">
                                                                            <div className="text-xs font-semibold text-gray-800 truncate">
                                                                                {preview.title}
                                                                            </div>
                                                                            <div className="text-[11px] text-gray-500 line-clamp-2">
                                                                                {preview.subtitle}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>

                                                {personalItems.length > 0 && (
                                                    <div className="mt-2 text-[11px] text-gray-400 text-center">
                                                        Tip: drag a post here to save it — drag a saved item back onto the canvas to reuse it.
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Excalidraw Library Section */}
                            {isIconReplaceMode && (
                                <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 text-[11px] font-medium text-blue-700 flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                                    Click a clipart below to replace the icon
                                </div>
                            )}
                            <div>
                                <div
                                    className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors group cursor-pointer"
                                    onClick={() => setIsExcalidrawExpanded(!isExcalidrawExpanded)}
                                >
                                    <div className="flex items-center gap-2">
                                        {isExcalidrawExpanded ? (
                                            <ChevronDown className="w-4 h-4 text-gray-400" />
                                        ) : (
                                            <ChevronRight className="w-4 h-4 text-gray-400" />
                                        )}
                                        <span className="font-semibold text-gray-700 text-sm">External Library</span>
                                    </div>

                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                            <button
                                                className="library-menu-trigger relative z-30 h-7 w-7 flex items-center justify-center rounded-full bg-white/90 text-gray-500 hover:text-gray-800 hover:bg-white border border-gray-200/70 transition-colors shadow-sm"
                                            >
                                                <Edit2 className="w-3.5 h-3.5" />
                                            </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent
                                            side="right"
                                            align="start"
                                            sideOffset={8}
                                            className="w-56 p-1.5 rounded-xl shadow-xl border-gray-100 z-[200] bg-white"
                                        >
                                            <DropdownMenuItem
                                                className="gap-3 py-2.5 rounded-lg cursor-pointer"
                                                onClick={handleExternalOpen}
                                            >
                                                <FolderOpen className="w-4 h-4 text-gray-500" />
                                                <span className="font-medium">Open</span>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                className="gap-3 py-2.5 rounded-lg cursor-pointer"
                                                onClick={handleExportExternalLibrary}
                                            >
                                                <Download className="w-4 h-4 text-gray-500" />
                                                <span className="font-medium">Save to file...</span>
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                onClick={handleResetExcalidrawLibrary}
                                                className="gap-3 py-2.5 rounded-lg cursor-pointer text-red-600 focus:text-red-700 focus:bg-red-50"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                                <span className="font-medium">Reset library</span>
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>

                                {isExcalidrawExpanded && (
                                    <div className="px-4 pb-4">
                                        {externalCliparts.length === 0 ? (
                                            <div className="py-8 text-center bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                                                <p className="text-xs text-gray-400 px-4">
                                                    No items added yet… click “Browse libraries” to add clipart from the web.
                                                </p>
                                            </div>
                                        ) : (
                                            <>
                                                {/* actions row (only shows when selecting) */}
                                                <div className="relative z-[50] flex items-center justify-between mb-2 bg-white">
                                                    <div className="text-[11px] text-gray-500">
                                                        Selected: <span className="font-semibold">{selectedExternalIds.size}</span>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        className={`relative z-[60] pointer-events-auto h-8 rounded-xl px-3 border flex items-center gap-2 hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${isConfirmingDelete
                                                            ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100 ring-2 ring-red-100'
                                                            : 'bg-white border-gray-200'
                                                            }`}
                                                        disabled={selectedExternalIds.size === 0}
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();

                                                            if (!isConfirmingDelete) {
                                                                setIsConfirmingDelete(true);
                                                                // Auto-reset after 3s
                                                                setTimeout(() => setIsConfirmingDelete(false), 3000);
                                                                return;
                                                            }

                                                            handleDeleteSelectedExternal();
                                                        }}
                                                    >
                                                        <Trash2 className={`w-4 h-4 ${isConfirmingDelete ? 'text-red-600' : ''}`} />
                                                        {isConfirmingDelete ? 'Click again to confirm' : 'Delete selected'}
                                                    </button>
                                                </div>

                                                <div className="relative z-[10] grid grid-cols-3 gap-2 pt-1">
                                                    {externalCliparts.map((it) => {
                                                        const isSelected = selectedExternalIds.has(it.id);

                                                        return (
                                                            <div
                                                                key={it.id}
                                                                className={`relative aspect-square rounded-lg border overflow-hidden bg-white hover:shadow-sm transition-all cursor-pointer ${isSelected ? 'border-gray-400' : 'border-gray-100 hover:border-blue-400'
                                                                    }`}
                                                            >
                                                                {/* delete single */}
                                                                <button
                                                                    type="button"
                                                                    className="absolute top-1 left-1 z-20 p-1 rounded bg-white/80 hover:bg-white shadow-sm opacity-0 hover:opacity-100 group-hover:opacity-100"
                                                                    onClick={(e) => {
                                                                        e.preventDefault();
                                                                        e.stopPropagation();
                                                                        handleDeleteOneExternal(it.id);
                                                                    }}
                                                                    aria-label="Delete"
                                                                >
                                                                    <X className="w-3 h-3 text-gray-500 hover:text-red-500" />
                                                                </button>

                                                                {/* checkmark — only toggles selection for deletion */}
                                                                <div
                                                                    className={`absolute top-1 right-1 z-20 w-6 h-6 rounded-full border flex items-center justify-center transition-all cursor-pointer ${isSelected
                                                                        ? 'bg-blue-600 border-blue-600 text-white'
                                                                        : 'bg-white/90 border-gray-300 text-transparent hover:border-blue-400 hover:text-blue-300'
                                                                        }`}
                                                                    onClick={(e) => {
                                                                        e.preventDefault();
                                                                        e.stopPropagation();
                                                                        setSelectedExternalIds((prev) => {
                                                                            const next = new Set(prev);
                                                                            if (next.has(it.id)) next.delete(it.id);
                                                                            else next.add(it.id);
                                                                            return next;
                                                                        });
                                                                    }}
                                                                >
                                                                    <Check className="w-4 h-4" />
                                                                </div>

                                                                {/* preview — click to place on canvas */}
                                                                <div
                                                                    className="w-full h-full flex items-center justify-center bg-gray-50"
                                                                    onClick={() => {
                                                                        if (isIconReplaceMode && onSelectClipart) {
                                                                            onSelectClipart(it.svgUrl, it.title);
                                                                        } else if (onClipartClick) {
                                                                            onClipartClick(it.svgUrl, it.title);
                                                                        }
                                                                    }}
                                                                >
                                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                    <img src={it.svgUrl} alt={it.title} className="w-14 h-14 object-contain" draggable={false} />
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full p-8 text-center text-gray-400">
                            <Search className="w-12 h-12 mb-3 opacity-20" />
                            <p className="text-sm">Search across community boards and public assets.</p>
                            <p className="text-xs mt-2">Feature coming soon.</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t bg-gray-50 flex flex-col gap-3">
                    <Button
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-6 rounded-xl shadow-lg shadow-blue-200"
                        onClick={() => setIsClipartModalOpen(true)}
                    >
                        Browse libraries
                    </Button>

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".excalidrawlib,application/json"
                        className="hidden"
                        onChange={handleFileImport}
                    />
                    <input
                        ref={externalFileInputRef}
                        type="file"
                        accept=".json,.excalidrawlib,application/json"
                        className="hidden"
                        onChange={handleExternalFileImport}
                    />
                </div>
            </div>

            {/* Browse modal */}
            <ExcalidrawBrowseModal isOpen={isBrowseOpen} onClose={() => setIsBrowseOpen(false)} />

            {/* External Clipart Browser */}
            <ExternalClipartBrowserModal
                isOpen={isClipartModalOpen}
                onClose={() => setIsClipartModalOpen(false)}
                onAddSelected={handleAddExternalCliparts}
            />
        </>
    );
}
