"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { X, Save, CircleHelp, Move, ZoomIn } from 'lucide-react';
import { getExcalidrawLibrary } from '@/lib/collabboard/excalidrawLibrary';

// Dynamically import the wrapper that contains all Excalidraw-specific code
// This is necessary to prevent "window is not defined" errors during SSR
const ExcalidrawWrapper = dynamic(
    () => import('./ExcalidrawWrapper'),
    { ssr: false, loading: () => <div className="flex items-center justify-center h-full text-gray-400">Loading editor...</div> }
);

interface DrawingEditorProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: {
        drawingData: string;
        drawingAppState: string;
        drawingFiles: string; // JSON serialized binary files
        previewUrl?: string;
    }) => void;
    initialData?: {
        drawingData?: string;
        drawingAppState?: string;
        drawingFiles?: string;
    };
    readOnly?: boolean;
}

export default function DrawingEditor({
    isOpen,
    onClose,
    onSave,
    initialData,
    readOnly = false,
}: DrawingEditorProps) {
    // Use refs to store current state without causing re-renders
    const elementsRef = useRef<any[]>([]);
    const appStateRef = useRef<any>(null);
    const filesRef = useRef<any>({});
    const helpRef = useRef<HTMLDivElement>(null);

    // Track if initial data has been loaded
    const [initialElements, setInitialElements] = useState<any[]>([]);
    const [initialAppState, setInitialAppState] = useState<any>(null);
    const [initialFiles, setInitialFiles] = useState<any>(null);
    const [libraryItems, setLibraryItems] = useState<any[]>([]); // New state
    const [key, setKey] = useState(0);
    const [showHelp, setShowHelp] = useState(false);

    // Parse initial data only when opening
    useEffect(() => {
        if (isOpen) {
            let elements: any[] = [];
            let appState: any = null;
            let files: any = {};

            // Load Excalidraw Community Library items
            const communityItems = getExcalidrawLibrary();
            // Flatten the nested elements structure for Excalidraw
            const flattenedLibrary = communityItems.flatMap(item =>
                item.elements.map(el => ({
                    ...el,
                    // Optional: add some metadata to help identify source
                    metadata: { ...el.metadata, source: item.name }
                }))
            );
            setLibraryItems(flattenedLibrary);

            if (initialData?.drawingData) {
                try {
                    elements = JSON.parse(initialData.drawingData);
                    if (initialData.drawingAppState) {
                        const parsedState = JSON.parse(initialData.drawingAppState);
                        // Sanitize appState: remove collaborators to avoid Map vs Object issues
                        // and unwanted session data
                        const { collaborators, ...rest } = parsedState;
                        appState = rest;
                    }
                    if (initialData.drawingFiles) {
                        try {
                            files = JSON.parse(initialData.drawingFiles);
                        } catch (e) {
                            console.error("Failed to parse initial drawing files", e);
                        }
                    }
                } catch (e) {
                    console.error("Failed to parse initial drawing data", e);
                }
            }

            elementsRef.current = elements;
            appStateRef.current = appState;
            filesRef.current = files;
            setInitialElements(elements);
            setInitialAppState(appState);
            setInitialFiles(files);
            setKey(prev => prev + 1);
        }
    }, [isOpen, initialData?.drawingData, initialData?.drawingAppState, initialData?.drawingFiles]);

    // Memoized onChange handler that only updates refs
    const handleChange = useCallback((elements: readonly any[], appState: any, files: any) => {
        elementsRef.current = elements.filter(el => !el.isDeleted);
        appStateRef.current = appState;
        filesRef.current = files;
    }, []);

    const handleSaveAndClose = async () => {
        let previewUrl = "";
        const elements = elementsRef.current;
        const appState = appStateRef.current;
        const files = filesRef.current;

        try {
            if (elements.length > 0) {
                // Dynamically import exportToSvg only on the client
                const { exportToSvg } = await import("@excalidraw/excalidraw");

                const svg = await exportToSvg({
                    elements: elements,
                    appState: {
                        ...appState,
                        exportWithDarkMode: false,
                        exportBackground: true,
                        viewBackgroundColor: "#ffffff",
                    },
                    files: files,
                });

                const svgString = new XMLSerializer().serializeToString(svg);
                previewUrl = `data:image/svg+xml;base64,${btoa(svgString)}`;
            }
        } catch (e) {
            console.error("Failed to generate drawing preview", e);
        }

        onSave({
            drawingData: JSON.stringify(elements),
            drawingAppState: JSON.stringify(appState),
            drawingFiles: JSON.stringify(files),
            previewUrl,
        });
        onClose();
    };

    const handleOverlayClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            handleSaveAndClose();
        }
    };

    // Close help when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (showHelp && helpRef.current && !helpRef.current.contains(event.target as Node)) {
                setShowHelp(false);
            }
        };

        if (showHelp) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showHelp]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50"
            onClick={handleOverlayClick}
        >
            <div
                className="relative bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden w-[90vw] h-[90vh]"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header toolbar */}
                <div className="flex items-center justify-between px-6 py-3 border-b bg-gray-50">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center text-red-600">
                            <svg
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <path d="M12 19l7-7 3 3-7 7-3-3z"></path>
                                <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path>
                                <path d="M2 2l7.5 1.5"></path>
                                <path d="M7 11l5-5"></path>
                            </svg>
                        </div>
                        <h2 className="text-lg font-semibold text-gray-800">
                            {readOnly ? "View Drawing" : "Sketch & Draw"}
                        </h2>
                    </div>

                    <div className="flex items-center gap-2">
                        {!readOnly && (
                            <button
                                onClick={handleSaveAndClose}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm"
                            >
                                <Save size={18} />
                                Save Changes
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500"
                            title="Close"
                        >
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* Custom Help Dialog for View Mode */}
                {readOnly && showHelp && (
                    <div ref={helpRef} className="absolute top-[60px] left-[70px] z-[50] w-96 max-h-[70vh] bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 flex flex-col">
                        <div className="px-5 py-3 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 flex-shrink-0">
                            <h3 className="font-semibold text-gray-800 text-base">View</h3>
                            <button onClick={() => setShowHelp(false)} className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-md hover:bg-gray-100">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-4 space-y-1 text-sm text-gray-600 overflow-y-auto custom-scrollbar">
                            {/* Shortcut Rows */}
                            {[
                                { label: "Zoom in", keys: ["Ctrl", "+"] },
                                { label: "Zoom out", keys: ["Ctrl", "-"] },
                                { label: "Reset zoom", keys: ["Ctrl", "0"] },
                                { label: "Zoom to fit all elements", keys: ["Shift", "1"] },
                                { label: "Zoom to selection", keys: ["Shift", "2"] },
                                { label: "Move page up/down", keys: ["PgUp/PgDn"] },
                                { label: "Move page left/right", keys: ["Shift", "PgUp/PgDn"] },
                                { label: "Zen mode", keys: ["Alt", "Z"] },
                                { label: "Snap to objects", keys: ["Alt", "S"] },
                                { label: "Toggle grid", keys: ["Ctrl", "'"] },
                                { label: "View mode", keys: ["Alt", "R"] },
                                { label: "Toggle light/dark theme", keys: ["Alt", "Shift", "D"] },
                                { label: "Canvas & Shape properties", keys: ["Alt", "/"] },
                                { label: "Find on canvas", keys: ["Ctrl", "F"] },
                                { label: "Command palette", keys: ["Ctrl", "/"], altKeys: ["Ctrl", "Shift", "P"] },
                            ].map((item, idx) => (
                                <div key={idx} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50/50 px-1 rounded transition-colors group">
                                    <span className="text-gray-700 group-hover:text-gray-900">{item.label}</span>
                                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                        {item.keys.map((k, kIdx) => (
                                            <kbd key={kIdx} className="px-2 py-1 bg-gray-50 border border-gray-300 rounded text-xs text-gray-600 font-sans min-w-[28px] text-center shadow-sm">
                                                {k}
                                            </kbd>
                                        ))}
                                        {item.altKeys && (
                                            <>
                                                <span className="text-[10px] text-gray-300 mx-0.5">or</span>
                                                {item.altKeys.map((k, kIdx) => (
                                                    <kbd key={kIdx} className="px-2 py-1 bg-gray-50 border border-gray-300 rounded text-xs text-gray-600 font-sans min-w-[28px] text-center shadow-sm">
                                                        {k}
                                                    </kbd>
                                                ))}
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-[10px] text-gray-400 text-center flex-shrink-0">
                            Keyboard shortcuts for viewing mode
                        </div>
                    </div>
                )}

                {/* Excalidraw Container */}
                <div className="flex-1 relative bg-gray-50">
                    <div className="absolute inset-0">
                        <ExcalidrawWrapper
                            excalidrawKey={key}
                            initialData={{
                                elements: initialElements,
                                appState: {
                                    ...initialAppState,
                                    viewBackgroundColor: "#ffffff",
                                    theme: "light",
                                },
                                files: initialFiles,
                                scrollToContent: true,
                                libraryItems: libraryItems,
                            }}
                            onChange={handleChange}
                            readOnly={readOnly}
                            onShowHelp={() => setShowHelp(true)}
                        />
                    </div>
                </div>

                {readOnly && (
                    <style>{`
                        /* Hide the Help button in read-only mode - comprehensive selectors */
                        .excalidraw button[aria-label="Help"],
                        .excalidraw button[title="Help"],
                        .excalidraw .HelpButton,
                        .excalidraw [class*="HelpButton"],
                        .excalidraw .help-icon,
                        .excalidraw .App-menu .dropdown-menu-button[aria-label="Help"],
                        .excalidraw .layer-ui__wrapper button[aria-label="Help"],
                        .excalidraw .App-bottom-bar button:last-child,
                        .excalidraw .island button[aria-label="Help"] {
                            display: none !important;
                        }
                        /* Hide the Help dialog/modal entirely */
                        .excalidraw .HelpDialog,
                        .excalidraw [class*="HelpDialog"],
                        .excalidraw .Modal[aria-label*="Help"],
                        .excalidraw .Dialog--HelpDialog,
                        .excalidraw .Modal--HelpDialog,
                        .excalidraw div[role="dialog"][aria-label*="help" i],
                        .excalidraw div[role="dialog"][aria-label*="Help"],
                        .excalidraw .layer-ui__wrapper .Modal {
                            display: none !important;
                        }
                    `}</style>
                )}

                {/* Footer info */}
                <div className="px-6 py-2 border-t bg-gray-50 text-xs text-gray-400 flex justify-between items-center">
                    <span>
                        {readOnly
                            ? "Scroll/Pinch to zoom • Drag to pan"
                            : "Changes are saved locally until you click Save"
                        }
                    </span>
                </div>
            </div>
        </div >
    );
}
