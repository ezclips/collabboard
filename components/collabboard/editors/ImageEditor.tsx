import React, { useState, useEffect, useRef } from 'react';
import { X, Search, Image as ImageIcon, Loader2, Upload, Check, RotateCw, RotateCcw, FlipHorizontal, Square } from 'lucide-react';
import { ColorPickerContent } from '../ColorPicker';
import { isDocumentImportable } from '@/lib/imports/documentImport';
import { storeUploadedImage } from '@/lib/infra/collabboard/imageEditStorage';
import { UPLOAD_LIMITS, tooLargeMessage } from '@/lib/domain/storage/uploadLimits';
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
    /**
     * PATCH-218. The board this upload belongs to. Used to store an uploaded
     * file in `padlet-files` under the board's own folder.
     */
    boardId?: string;
    /**
     * PATCH-216. Present ONLY where a picked document can become a readable
     * Knowledge document. When given, import mode offers the choice between a
     * link card and a readable document.
     */
    onImportAsDocument?: (importData: ImportData) => void;
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
    boardId,
    onImportAsDocument,
    onSave,
    initialData,
    defaultTab = 'search',
    editMode = false,
}: ImageEditorProps) {
    const isImportMode = initialData?.source === 'import';
    const isEditMode = (editMode || !!initialData?.imageUrl) && !isImportMode;
    /**
     * PATCH-216. The choice exists only in import mode, for a supported file,
     * when the host gave a way to add it as a document. "Link to the original"
     * is the default.
     */
    const importData = initialData?.importData;
    const canImportAsDocument =
        isImportMode && !!onImportAsDocument && !!importData && isDocumentImportable(importData.mimeType);
    const [importChoice, setImportChoice] = useState<'link' | 'document'>('link');
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
    /**
     * PATCH-218. The File the current preview came from, if it came from an
     * uploaded file. It is uploaded to Storage on save; a Pexels or imported
     * picture has none and keeps the URL it already carries.
     */
    const [uploadedFile, setUploadedFile] = useState<File | null>(null);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    // The blob: URL of the preview, revoked when it is replaced or unmounted.
    const objectUrlRef = useRef<string | null>(null);

    const revokeObjectUrl = () => {
        if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = null;
        }
    };

    useEffect(() => () => { revokeObjectUrl(); }, []);

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

    /**
     * PATCH-216 FIX. Reset the import choice in its OWN effect, keyed on the
     * dialog OPENING and on the item's identity -- NOT on `initialData`.
     *
     * `CanvasModals` rebuilds `initialData` inline on every render, so the
     * canvas's constant re-renders (realtime, presence) changed that object's
     * identity while the dialog was open. Resetting the choice there wiped
     * "Add as a readable document" back to "Link" a moment after the user
     * picked it, and the click made an image card instead. Keying on the
     * import item's identity resets only when a DIFFERENT item is being
     * imported.
     */
    useEffect(() => {
        if (isOpen) setImportChoice('link');
    }, [isOpen, importData?.provider, importData?.itemId]);

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

        // PATCH-216. "Add as a readable document": hand the import to the host
        // and close. NO image card is created -- `onSave` is deliberately not
        // called on this branch.
        if (canImportAsDocument && importChoice === 'document' && importData) {
            onImportAsDocument?.(importData);
            onClose();
            return;
        }

        if (isImportMode && initialData?.importData) {
            onSave({
                imageUrl: previewUrl,
                caption,
                source: 'import',
                cardColor,
                topStrip: topStrip || 'transparent',
                importData: initialData.importData,
            });
        } else if (uploadedFile) {
            /**
             * PATCH-218. An uploaded picture is stored as a FILE, and only its
             * URL is saved -- never the base64 data URL. A failure keeps the
             * dialog open with an inline message and does NOT save.
             */
            if (!boardId) {
                setUploadError('Could not upload the image.');
                return;
            }
            setUploadError(null);
            setUploading(true);
            try {
                const stored = await storeUploadedImage({ boardId, file: uploadedFile });
                if (!stored.ok) {
                    setUploadError(stored.message);
                    return;
                }
                onSave({
                    imageUrl: stored.url,
                    caption,
                    photographer: manualPhotographer,
                    photographerUrl: undefined,
                    source: 'upload',
                    cardColor,
                    topStrip: topStrip || 'transparent',
                });
            } finally {
                setUploading(false);
            }
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



    /**
     * PATCH-218. Accept a chosen or dropped file: validate type and size at
     * once, and preview it with a blob: URL. An invalid file leaves NO preview.
     */
    const acceptFile = (file: File) => {
        const tooBig = file.size > UPLOAD_LIMITS.image;
        if (!file.type.startsWith('image/')) {
            setUploadError('Please choose an image file.');
            return;
        }
        if (tooBig) {
            setUploadError(tooLargeMessage(file.size, UPLOAD_LIMITS.image, 'images'));
            return;
        }
        setUploadError(null);
        revokeObjectUrl();
        const url = URL.createObjectURL(file);
        objectUrlRef.current = url;
        setPreviewUrl(url);
        setUploadedFile(file);
        setSelectedImage(null);
        setManualPhotographer('Uploaded Image');
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) acceptFile(file);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer?.files?.[0];
        if (file) acceptFile(file);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-[1000] flex items-center justify-center p-4 backdrop-blur-sm" role="dialog" aria-modal="true" data-ui="image-editor-modal" onClick={onClose}>
            <div className="relative w-full max-w-4xl h-[80vh]" onClick={(e) => e.stopPropagation()}>
                <button onClick={onClose} className="absolute -right-3 -top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-md transition-all hover:text-gray-600">
                    <X className="h-3.5 w-3.5" />
                </button>
                <div className="bg-white rounded-xl shadow-2xl h-full flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="flex items-center justify-between p-4 border-b">
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <ImageIcon className="w-6 h-6 text-purple-600" />
                        {isImportMode ? 'Import Preview' : initialData?.imageUrl ? 'Edit Image' : 'Add Image'}
                    </h2>
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
                                    Free images
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
                                    Upload your own
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
                                <div
                                    data-image-dropzone="true"
                                    onDragOver={(e) => {
                                        // Required so the browser allows a drop.
                                        e.preventDefault();
                                        setIsDragging(true);
                                    }}
                                    onDragLeave={() => setIsDragging(false)}
                                    onDrop={handleDrop}
                                    className={`h-full flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 transition-colors ${
                                        isDragging ? 'border-purple-500 bg-purple-50' : 'border-gray-300 bg-gray-50'
                                    }`}
                                >
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
                                    {uploadError ? (
                                        <p role="alert" className="mt-3 text-xs text-red-600">{uploadError}</p>
                                    ) : null}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="bg-gray-50 p-4 border-t">
                    {canImportAsDocument && (
                        <fieldset className="mb-3 space-y-2">
                            <label htmlFor="import-choice-link" className="flex items-start gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    id="import-choice-link"
                                    name="import-choice"
                                    className="mt-0.5"
                                    checked={importChoice === 'link'}
                                    onChange={() => setImportChoice('link')}
                                />
                                <span>
                                    <span className="block text-sm font-medium text-gray-800">Link to the original</span>
                                    <span className="block text-xs text-gray-500">
                                        A card with a preview that opens the file in {initialData?.importData?.provider === 'google-drive' ? 'Google Drive' : 'OneDrive'}
                                    </span>
                                </span>
                            </label>
                            <label htmlFor="import-choice-document" className="flex items-start gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    id="import-choice-document"
                                    name="import-choice"
                                    className="mt-0.5"
                                    checked={importChoice === 'document'}
                                    onChange={() => setImportChoice('document')}
                                />
                                <span>
                                    <span className="block text-sm font-medium text-gray-800">Add as a readable document</span>
                                    <span className="block text-xs text-gray-500">
                                        A copy is added to this board, so the wiki and the board AI can read it
                                    </span>
                                </span>
                            </label>
                        </fieldset>
                    )}
                    <div className="flex justify-between items-center gap-3">
                        <div className="flex-1">
                            {isImportMode && importChoice === 'link' && (
                                <span className="text-xs text-gray-400">Clicking this post will open the original file</span>
                            )}
                        </div>
                        <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg font-medium">Cancel</button>
                        <button
                            onClick={handleSave}
                            disabled={!previewUrl || uploading}
                            className={`px-6 py-2 text-white rounded-lg font-bold shadow-sm ${previewUrl && !uploading ? 'bg-purple-600 hover:bg-purple-700' : 'bg-gray-300 cursor-not-allowed'}`}
                        >
                            {uploading
                                ? 'Uploading…'
                                : canImportAsDocument && importChoice === 'document'
                                    ? 'Add as document'
                                    : isImportMode ? 'Add to Canvas' : isEditMode ? 'Save Changes' : 'Add Image'}
                        </button>
                    </div>
                </div>
            </div>
            </div>
        </div>
    );
}
