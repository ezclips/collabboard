"use client";

import React, { useState, useEffect, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, ChevronDown, Wand2 } from 'lucide-react';
import { parseMermaidToExcalidraw } from '@excalidraw/mermaid-to-excalidraw';

interface CustomMermaidModalProps {
    isOpen: boolean;
    onClose: () => void;
    onInsert: (elements: any[], files?: any) => void;
}
const MERMAID_TEMPLATES: Record<string, { label: string; syntax: string }> = {
    flowchart: {
        label: 'Flowchart',
        syntax: `graph TD
    A[Christmas] -->|Get money| B(Go shopping)
    B --> C{Let me think}
    C -->|One| D[Laptop]
    C -->|Two| E[iPhone]
    C -->|Three| F[Car]`,
    },
    sequence: {
        label: 'Sequence Diagram',
        syntax: `sequenceDiagram
    Alice->>John: Hello John, how are you?
    John-->>Alice: Great!
    Alice-)John: See you later!`,
    },
    class: {
        label: 'Class Diagram',
        syntax: `classDiagram
    note "From Duck till Zebra"
    Animal <|-- Duck
    note for Duck "can fly\\ncan swim\\ncan dive\\ncan help in debugging"
    Animal <|-- Fish
    Animal <|-- Zebra
    Animal : +int age
    Animal : +String gender
    Animal : +isMammal()
    Animal : +mate()
    class Duck{
        +String beakColor
        +swim()
        +quack()
    }
    class Fish{
        -int sizeInFeet
        -canEat()
    }
    class Zebra{
        +bool is_wild
        +run()
    }`,
    },
};

export default function CustomMermaidModal({ isOpen, onClose, onInsert }: CustomMermaidModalProps) {
    const [syntax, setSyntax] = useState(MERMAID_TEMPLATES.flowchart.syntax);
    const [error, setError] = useState<string | null>(null);
    const [elements, setElements] = useState<any[]>([]);
    const [files, setFiles] = useState<any>(null);
    const [previewApi, setPreviewApi] = useState<any>(null);
    const [ExcalidrawPreview, setExcalidrawPreview] = useState<any>(null);
    const [convertToExcalidrawElementsFn, setConvertToExcalidrawElementsFn] = useState<((elements: any[]) => any[]) | null>(null);
    const elementsRef = useRef<any[]>([]);
    const filesRef = useRef<any>(null);
    const isMountedRef = useRef(false);
    const scrollTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            if (scrollTimeoutRef.current !== null) {
                window.clearTimeout(scrollTimeoutRef.current);
            }
        };
    }, []);

    // Load Excalidraw dynamically for the preview window
    useEffect(() => {
        if (isOpen && !ExcalidrawPreview) {
            import('@excalidraw/excalidraw').then((mod) => {
                if (!isMountedRef.current) return;
                setExcalidrawPreview(() => mod.Excalidraw);
                setConvertToExcalidrawElementsFn(() => mod.convertToExcalidrawElements);
            });
        }
    }, [isOpen, ExcalidrawPreview]);

    useEffect(() => {
        if (isOpen) return;
        setPreviewApi(null);
    }, [isOpen]);

    // Update preview when syntax changes
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (!syntax.trim()) {
                setElements([]);
                elementsRef.current = [];
                setError(null);
                return;
            }

            try {
                if (!convertToExcalidrawElementsFn) return;
                const result = await parseMermaidToExcalidraw(syntax, {
                    themeVariables: { fontSize: '20px' },
                });

                // Extra safety: deeply enforce background and stroke colors on raw parser output
                const sanitizeElements = (elements: any[]) => elements.map(el => ({
                    ...el,
                    backgroundColor: el.backgroundColor || "transparent",
                    strokeColor: el.strokeColor || "#000000"
                }));

                const safeElements = sanitizeElements(result.elements);

                // Convert skeletons to full Excalidraw elements
                const fullElements = convertToExcalidrawElementsFn(safeElements);

                if (!isMountedRef.current) return;
                setElements(fullElements);
                elementsRef.current = fullElements;
                const newFiles = result.files || null;
                setFiles(newFiles);
                filesRef.current = newFiles;
                setError(null);

                if (previewApi) {
                    previewApi.updateScene({
                        elements: fullElements,
                    });
                    // Register image files so Excalidraw can render them
                    if (newFiles) {
                        previewApi.addFiles(
                            Object.values(newFiles)
                        );
                    }
                }
            } catch (err: any) {
                if (!isMountedRef.current) return;
                setError(err.message || 'Invalid Mermaid syntax');
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [syntax, previewApi, convertToExcalidrawElementsFn]);

    useEffect(() => {
        if (!previewApi || elements.length === 0) return;
        if (scrollTimeoutRef.current !== null) {
            window.clearTimeout(scrollTimeoutRef.current);
        }
        // Defer viewport fit until after preview commit to avoid calling into Excalidraw too early.
        scrollTimeoutRef.current = window.setTimeout(() => {
            if (!isMountedRef.current) return;
            previewApi.scrollToContent(previewApi.getSceneElements(), {
                fitToViewport: true,
            });
        }, 120);
        return () => {
            if (scrollTimeoutRef.current !== null) {
                window.clearTimeout(scrollTimeoutRef.current);
            }
        };
    }, [previewApi, elements]);

    const handleTemplateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const template = MERMAID_TEMPLATES[e.target.value];
        if (template) {
            setSyntax(template.syntax);
        }
    };

    const handleInsert = () => {
        if (elements.length > 0) {
            onInsert(elements, files);
            onClose();
        }
    };

    return (
        <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[1000] backdrop-blur-sm" />
                <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[95vw] h-[90vh] max-w-6xl bg-white rounded-xl shadow-2xl z-[1001] flex flex-col overflow-hidden">
                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-violet-100 text-violet-600 rounded-lg">
                                <Wand2 size={20} />
                            </div>
                            <div>
                                <Dialog.Title className="text-lg font-bold text-gray-900">
                                    Insert Mermaid Diagram
                                </Dialog.Title>
                                <p className="text-xs text-gray-500">Transform text into visual diagrams</p>
                            </div>
                        </div>

                        <Dialog.Close asChild>
                            <button className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-400 hover:text-gray-600">
                                <X size={20} />
                            </button>
                        </Dialog.Close>
                    </div>

                    <div className="flex-1 flex overflow-hidden">
                        {/* Left: Editor */}
                        <div className="w-1/2 flex flex-col border-r border-gray-100 p-6 gap-4">
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-semibold text-gray-700">Select Template</label>
                                <div className="relative">
                                    <select
                                        onChange={handleTemplateChange}
                                        className="w-full appearance-none bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all cursor-pointer pr-10"
                                    >
                                        {Object.entries(MERMAID_TEMPLATES).map(([key, value]) => (
                                            <option key={key} value={key}>{value.label}</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                </div>
                            </div>

                            <div className="flex-1 flex flex-col gap-2">
                                <label className="text-sm font-semibold text-gray-700">Mermaid Syntax</label>
                                <div className="flex-1 relative">
                                    <textarea
                                        value={syntax}
                                        onChange={(e) => setSyntax(e.target.value)}
                                        spellCheck={false}
                                        className="w-full h-full p-4 font-mono text-sm bg-gray-900 text-gray-100 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-violet-500/50 transition-all shadow-inner"
                                        placeholder="Enter Mermaid code here..."
                                    />
                                    {error && (
                                        <div className="absolute bottom-4 left-4 right-4 p-3 bg-red-500/10 border border-red-500/50 backdrop-blur-md rounded-md">
                                            <p className="text-xs font-medium text-red-500">{error}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Right: Preview */}
                        <div className="w-1/2 flex flex-col bg-gray-50/30">
                            <div className="px-6 py-4 flex items-center justify-between">
                                <span className="text-sm font-semibold text-gray-700">Preview</span>
                                <span className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Auto-updates</span>
                            </div>
                            <div className="flex-1 mx-6 mb-6 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden relative">
                                {ExcalidrawPreview ? (
                                    <ExcalidrawPreview
                                        excalidrawAPI={(api: any) => {
                                            if (!isMountedRef.current) return;
                                            setPreviewApi(api);
                                            if (elementsRef.current.length > 0) {
                                                api.updateScene({
                                                    elements: elementsRef.current,
                                                });
                                                if (filesRef.current) {
                                                    api.addFiles(
                                                        Object.values(filesRef.current)
                                                    );
                                                }
                                            }
                                        }}
                                        viewModeEnabled={true}
                                        theme="light"
                                    />
                                ) : (
                                    <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                                        Loading preview engine...
                                    </div>
                                )}
                                {elements.length === 0 && !error && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-white/80 pointer-events-none transition-opacity">
                                        <p className="text-sm text-gray-400 font-medium italic">Type some valid Mermaid syntax to see a preview</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3">
                        <button
                            onClick={onClose}
                            className="px-5 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded-lg transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            disabled={elements.length === 0}
                            onClick={handleInsert}
                            className={`px-6 py-2 rounded-lg text-sm font-bold shadow-lg transition-all flex items-center gap-2 ${elements.length > 0
                                ? 'bg-violet-600 text-white hover:bg-violet-700 active:scale-95 shadow-violet-200'
                                : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
                                }`}
                        >
                            Insert Diagram
                            <Wand2 size={16} />
                        </button>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
