'use client';

import React, { useEffect, useRef, useState } from 'react';
import { X, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { addToExcalidrawLibrary, ExcalidrawLibraryItem } from '@/lib/collabboard/excalidrawLibrary';

interface ExcalidrawBrowseModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImport?: (item: ExcalidrawLibraryItem) => void;
}

export default function ExcalidrawBrowseModal({ isOpen, onClose, onImport }: ExcalidrawBrowseModalProps) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!isOpen) return;

        // Listen for postMessage from the iframe
        const handleMessage = (event: MessageEvent) => {
            // Only accept messages from Excalidraw Libraries
            if (event.origin !== 'https://libraries.excalidraw.com') return;

            // Handle library selection/import
            // Note: Excalidraw's libraries site might send data in a specific format
            // If we use the official site, we might need to handle their specific events
            // For now, this is a placeholder for the logic discussed in the plan
            if (event.data?.type === 'library-item-selected' || event.data?.type === 'excalidraw-library-import') {
                const libraryItem: ExcalidrawLibraryItem = {
                    id: Math.random().toString(36).substr(2, 9),
                    name: event.data.name || 'Imported Library',
                    elements: event.data.elements || [],
                    source: 'https://libraries.excalidraw.com',
                    created: Date.now(),
                };
                // Save to database (async, but we don't need to await in event handler)
                addToExcalidrawLibrary(libraryItem).catch(console.error);
                onImport?.(libraryItem);
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [isOpen, onImport]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[80000] bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full h-full max-w-5xl flex flex-col overflow-hidden animate-in zoom-in duration-200">
                {/* Header */}
                <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                            <ExternalLink className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h2 className="font-bold text-gray-900">Excalidraw Libraries</h2>
                            <p className="text-xs text-gray-500">Import community-made components and templates</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <a
                            href="https://libraries.excalidraw.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-2"
                        >
                            Open Website <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
                            <X className="w-5 h-5" />
                        </Button>
                    </div>
                </div>

                {/* Iframe Content */}
                <div className="flex-1 relative bg-gray-100">
                    {isLoading && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-10">
                            <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
                            <p className="mt-4 text-gray-600 font-medium">Connecting to Excalidraw...</p>
                        </div>
                    )}
                    <iframe
                        ref={iframeRef}
                        src="https://libraries.excalidraw.com/?theme=light&sort=default"
                        className="w-full h-full border-0"
                        onLoad={() => setIsLoading(false)}
                        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                        title="Excalidraw Libraries"
                    />
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t bg-gray-50 flex items-center justify-between">
                    <p className="text-sm text-gray-500 italic">
                        Tip: Most libraries will automatically import when you click on them.
                    </p>
                    <Button onClick={onClose} variant="default" className="bg-gray-900 hover:bg-black text-white px-8">
                        Done
                    </Button>
                </div>
            </div>
        </div>
    );
}
