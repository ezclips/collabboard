import React, { useState, useEffect, useRef } from 'react';
import { X, Search, Image as ImageIcon, Loader2, Upload, Check, RotateCw, RotateCcw, FlipHorizontal, Square } from 'lucide-react';
import { ColorPickerContent } from '../ColorPicker';
import 'react-image-crop/dist/ReactCrop.css';

interface PexelsPhoto {
    id: number;
    width: number;
    height: number;
    url: string;
    photographer: string;
    photographer_url: string;
    src: {
        original: string;
        large2x: string;
        large: string;
        medium: string;
        small: string;
        portrait: string;
        landscape: string;
        tiny: string;
    };
    alt: string;
}

const BACKGROUND_COLORS = [
    "#ffffff",
    "#f3f4f6",
    "#fee2e2",
    "#ffedd5",
    "#fef3c7",
    "#dcfce7",
    "#dbeafe",
    "#e0e7ff",
    "#f3e8ff",
    "#fce7f3",
];

const TOP_STRIP_COLORS = [
    "transparent",
    "#ef4444",
    "#f97316",
    "#eab308",
    "#22c55e",
    "#3b82f6",
    "#8b5cf6",
    "#ec4899",
    "#6b7280",
    "#1f2937",
];

interface ImportData {
    provider: 'google-drive' | 'microsoft-onedrive';
    itemId: string;
    openUrl: string;
    mimeType: string;
    fileName: string;
    kind: 'image' | 'document';
    sizeBytes?: number;
}

interface ImageEditorProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: {
        imageUrl: string;
        caption?: string;
        photographer?: string;
        photographerUrl?: string;
        source: 'pexels' | 'upload' | 'import';
        cardColor?: string;
        topStrip?: string;
        importData?: ImportData;
    }) => void;
    initialData?: {
        imageUrl?: string;
        caption?: string;
        photographer?: string;
        photographerUrl?: string;
        source?: 'pexels' | 'upload' | 'import';
        cardColor?: string;
        topStrip?: string;
        importData?: ImportData;
    };
    defaultTab?: 'search' | 'upload';
    editMode?: boolean;
}

export default function ImageEditor({
    isOpen,
    onClose,
    onSave,
    initialData,
    defaultTab = 'search',
    editMode = false,
}: ImageEditorProps) {
    const isImportMode = initialData?.source === 'import';
    const isEditMode = (editMode || !!initialData?.imageUrl) && !isImportMode;
    const [activeTab, setActiveTab] = useState<'search' | 'upload'>(defaultTab as any || 'search');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<PexelsPhoto[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedImage, setSelectedImage] = useState<PexelsPhoto | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string>(initialData?.imageUrl || '');
    const [caption, setCaption] = useState(initialData?.caption || '');
    const [cardColor, setCardColor] = useState(initialData?.cardColor || '#ffffff');
    const [topStrip, setTopStrip] = useState(initialData?.topStrip || null);
    const [activeColorTab, setActiveColorTab] = useState<'background' | 'topstrip'>('background');
    const [manualPhotographer, setManualPhotographer] = useState(initialData?.photographer || '');

    // Helper to normalize topStrip values


    useEffect(() => {
        if (isOpen) {
            // Only allow 'transform' tab if we have an image
            setActiveTab(defaultTab === 'upload' ? 'upload' : 'search');

            if (initialData?.imageUrl) {
                setPreviewUrl(initialData.imageUrl);
                setCaption(initialData.caption || '');
                setCardColor(initialData.cardColor || '#ffffff');
                setTopStrip(initialData.topStrip || null);
                setManualPhotographer(initialData.photographer || '');
            } else {
                setPreviewUrl('');
                setCaption('');
                setSearchResults([]);
                setSearchQuery('');
                setSelectedImage(null);
            }
        }
    }, [isOpen, initialData, defaultTab]);

    const handleSearch = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!searchQuery.trim()) return;

        setLoading(true);
        try {
            const res = await fetch(`/api/pexels?query=${encodeURIComponent(searchQuery)}`);
            const data = await res.json();
            if (data.photos) {
                setSearchResults(data.photos);
            }
        } catch (error) {
            console.error("Search failed", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectImage = (photo: PexelsPhoto) => {
        setSelectedImage(photo);
        setPreviewUrl(photo.src.large);
        setManualPhotographer(photo.photographer);
    };

    const handleSave = async () => {
        if (!previewUrl) return;

        if (isImportMode && initialData?.importData) {
            onSave({
                imageUrl: previewUrl,
                caption,
                source: 'import',
                cardColor,
                topStrip: topStrip || 'transparent',
                importData: initialData.importData,
            });
        } else {
            onSave({
                imageUrl: previewUrl,
                caption,
                photographer: selectedImage ? selectedImage.photographer : manualPhotographer,
                photographerUrl: selectedImage ? selectedImage.photographer_url : undefined,
                source: selectedImage ? 'pexels' : 'upload',
                cardColor,
                topStrip: topStrip || 'transparent',
            });
        }
        onClose();
    };



    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const result = e.target?.result as string;
                setPreviewUrl(result);
                setSelectedImage(null);
                setManualPhotographer('Uploaded Image');
            };
            reader.readAsDataURL(file);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-[1000] flex items-center justify-center p-4 backdrop-blur-sm" role="dialog" aria-modal="true" data-ui="image-editor-modal">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="flex items-center justify-between p-4 border-b">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <ImageIcon className="w-6 h-6 text-purple-600" />
                        {isImportMode ? 'Import Preview' : initialData?.imageUrl ? 'Edit Image' : 'Add Image'}
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    <div className="w-1/3 bg-gray-50 border-r p-4 flex flex-col gap-4 overflow-y-auto">
                        <div>
                            {/* Card Style Label */}
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Card Style</label>

                            {/* Copied Container Editor Panel Structure (Inline Version) */}
                            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                                <div className="p-4 flex flex-col gap-4">
                                    {/* Mode Toggle */}
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Image Color</span>
                                        <div className="flex bg-gray-100 p-1 rounded-lg gap-1">
                                            <button
                                                onClick={() => setActiveColorTab("background")}
                                                className={`w-8 h-8 flex items-center justify-center text-xs font-bold rounded-md transition-all ${activeColorTab === "background"
                                                    ? "bg-white text-gray-900 shadow-sm"
                                                    : "text-gray-500 hover:text-gray-700"
                                                    }`}
                                                title="Background Color"
                                            >
                                                BG
                                            </button>
                                            <button
                                                onClick={() => setActiveColorTab("topstrip")}
                                                className={`w-8 h-8 flex items-center justify-center text-xs font-bold rounded-md transition-all ${activeColorTab === "topstrip"
                                                    ? "bg-white text-gray-900 shadow-sm"
                                                    : "text-gray-500 hover:text-gray-700"
                                                    }`}
                                                title="Top Strip Color"
                                            >
                                                TS
                                            </button>
                                        </div>
                                    </div>

                                    {/* Advanced Color Picker */}
                                    <ColorPickerContent
                                        color={activeColorTab === "background" ? cardColor : (topStrip || 'transparent')}
                                        onChange={(c) => activeColorTab === "background" ? setCardColor(c) : setTopStrip(c)}
                                        hasOpacity={true}
                                        presets={activeColorTab === "background" ? BACKGROUND_COLORS : TOP_STRIP_COLORS}
                                    />
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 block">Caption</label>
                            <textarea
                                className="w-full p-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none text-sm"
                                rows={3}
                                placeholder="Add a caption..."
                                value={caption}
                                onChange={(e) => setCaption(e.target.value)}
                            />
                        </div>

                        <div className="flex-1 min-h-[200px] border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center overflow-hidden bg-gray-100 relative group">
                            {previewUrl ? (
                                <>
                                    <img src={previewUrl} alt="Preview" className="w-full h-full object-contain" />
                                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white p-2 text-xs truncate">
                                        {manualPhotographer && `Photo by ${manualPhotographer}`}
                                    </div>
                                </>
                            ) : (
                                <div className="text-center text-gray-400 p-4">
                                    <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                    <p className="text-sm">No image selected</p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex-1 flex flex-col bg-white">
                        {/* Tab Headers - hidden in import mode */}
                        {isImportMode && (
                            <div className="flex items-center gap-2 px-4 py-3 border-b bg-blue-50">
                                <div className="w-2 h-2 rounded-full bg-blue-500" />
                                <p className="text-sm text-blue-700 font-medium">
                                    Imported from {initialData?.importData?.provider === 'google-drive' ? 'Google Drive' : 'Microsoft OneDrive'}
                                </p>
                                {initialData?.importData?.openUrl && (
                                    <a
                                        href={initialData.importData.openUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="ml-auto text-xs text-blue-600 hover:text-blue-800 underline"
                                    >
                                        Open original
                                    </a>
                                )}
                            </div>
                        )}
                        {!isImportMode && !isEditMode && <div className="flex border-b">
                            <button
                                onClick={() => setActiveTab('search')}
                                className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'search'
                                    ? 'text-purple-600 border-b-2 border-purple-600'
                                    : 'text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                <div className="flex items-center justify-center gap-2">
                                    <Search className="w-4 h-4" />
                                    Search Pexels
                                </div>
                            </button>
                            <button
                                onClick={() => setActiveTab('upload')}
                                className={`flex-1 py-3 text-sm font-medium transition-colors ${activeTab === 'upload'
                                    ? 'text-purple-600 border-b-2 border-purple-600'
                                    : 'text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                <div className="flex items-center justify-center gap-2">
                                    <Upload className="w-4 h-4" />
                                    Upload File
                                </div>
                            </button>
                        </div>}

                        <div className="flex-1 overflow-y-auto p-4">
                            {isImportMode ? (
                                <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 gap-3 p-6">
                                    <img
                                        src={previewUrl}
                                        alt="Import preview"
                                        className="max-h-48 max-w-full object-contain rounded-lg shadow border border-gray-200"
                                    />
                                    <p className="text-sm font-medium text-gray-700">{initialData?.importData?.fileName}</p>
                                    <p className="text-xs text-gray-400">{initialData?.importData?.mimeType}</p>
                                </div>
                            ) : isEditMode ? (
                                <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 gap-4 p-6">
                                    <img
                                        src={previewUrl}
                                        alt="Current image"
                                        className="max-h-56 max-w-full object-contain rounded-lg shadow border border-gray-200"
                                    />
                                    <p className="text-sm text-gray-700 font-medium">Editing current image</p>
                                    <p className="text-xs text-gray-500">Use the left panel to adjust style and caption, then save.</p>
                                </div>
                            ) : activeTab === 'search' ? (
                                <div className="flex flex-col h-full">
                                    {/* Search Input */}
                                    <form onSubmit={handleSearch} className="flex gap-2 mb-4">
                                        <div className="relative flex-1">
                                            <input
                                                type="text"
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                placeholder="Search free photos..."
                                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                            />
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                        </div>
                                        <button
                                            type="submit"
                                            disabled={loading}
                                            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 font-medium"
                                        >
                                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Search'}
                                        </button>
                                    </form>

                                    {/* Results Grid */}
                                    <div className="flex-1 overflow-y-auto">
                                        {loading ? (
                                            <div className="flex items-center justify-center h-full">
                                                <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
                                            </div>
                                        ) : searchResults.length > 0 ? (
                                            <div className="grid grid-cols-3 gap-3">
                                                {searchResults.map((photo) => (
                                                    <div
                                                        key={photo.id}
                                                        onClick={() => handleSelectImage(photo)}
                                                        className={`relative aspect-square cursor-pointer rounded-lg overflow-hidden group ${selectedImage?.id === photo.id
                                                            ? 'ring-4 ring-purple-600'
                                                            : 'hover:ring-2 hover:ring-purple-300'
                                                            }`}
                                                    >
                                                        <img
                                                            src={photo.src.medium}
                                                            alt={photo.alt}
                                                            className="w-full h-full object-cover"
                                                        />
                                                        {selectedImage?.id === photo.id && (
                                                            <div className="absolute inset-0 bg-purple-600/30 flex items-center justify-center">
                                                                <Check className="w-8 h-8 text-white" />
                                                            </div>
                                                        )}
                                                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-1 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                                                            {photo.photographer}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center justify-center h-full text-gray-400">
                                                <Search className="w-12 h-12 mb-3 opacity-30" />
                                                <p className="text-sm">Search for free stock photos from Pexels</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                /* Upload Tab */
                                <div className="h-full flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 p-8">
                                    <div className="bg-white p-4 rounded-full shadow-sm mb-4">
                                        <Upload className="w-8 h-8 text-purple-600" />
                                    </div>
                                    <h3 className="text-lg font-medium text-gray-900 mb-2">Upload from your device</h3>
                                    <p className="text-sm text-gray-500 mb-6 text-center max-w-xs">
                                        Drag and drop your image here, or click to browse files.
                                    </p>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        id="file-upload"
                                        onChange={handleFileUpload}
                                    />
                                    <label
                                        htmlFor="file-upload"
                                        className="bg-white border text-gray-700 hover:bg-gray-50 px-4 py-2 rounded-lg font-medium cursor-pointer shadow-sm"
                                    >
                                        Choose File
                                    </label>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="bg-gray-50 p-4 border-t flex justify-between items-center gap-3">
                    <div className="flex-1">
                        {isImportMode && (
                            <span className="text-xs text-gray-400">Clicking this post will open the original file</span>
                        )}
                    </div>
                    <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg font-medium">Cancel</button>
                    <button
                        onClick={handleSave}
                        disabled={!previewUrl}
                        className={`px-6 py-2 text-white rounded-lg font-bold shadow-sm ${previewUrl ? 'bg-purple-600 hover:bg-purple-700' : 'bg-gray-300 cursor-not-allowed'}`}
                    >
                        {isImportMode ? 'Add to Canvas' : isEditMode ? 'Save Changes' : 'Add Image'}
                    </button>
                </div>
            </div>
        </div>
    );
}
