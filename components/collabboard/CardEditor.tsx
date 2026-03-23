'use client';

import React, { useState, useEffect } from 'react';
import { X, FileText, Settings, AlignLeft, Bold, Italic, Link, List } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CardEditorProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    initialContent: string;
    initialMetadata: any;
    onSave: (data: { title: string; content: string; metadata: any }) => void;
    readOnly?: boolean;
}

export default function CardEditor({
    isOpen,
    onClose,
    title: initialTitle,
    initialContent,
    initialMetadata,
    onSave,
    readOnly = false,
}: CardEditorProps) {
    const [title, setTitle] = useState(initialTitle);
    const [content, setContent] = useState(initialContent);
    const [metadata, setMetadata] = useState(initialMetadata || {});
    const [description, setDescription] = useState(initialMetadata?.description || '');

    useEffect(() => {
        if (isOpen) {
            // Check if title matches icon name (auto-generated)
            let effectiveTitle = initialTitle;
            const svgUrl = initialMetadata?.svgUrl;

            if (svgUrl && initialTitle) {
                try {
                    // Extract filename from URL or path
                    const filename = svgUrl.split('/').pop()?.replace('.svg', '') || '';
                    if (filename && initialTitle.toLowerCase() === filename.toLowerCase()) {
                        effectiveTitle = ''; // Clear title if it matches icon name
                    }
                } catch (e) {
                    // Ignore parsing errors
                }
            }

            setTitle(effectiveTitle);
            setContent(initialContent);
            setMetadata(initialMetadata || {});
            setDescription(initialMetadata?.description || '');
        }
    }, [isOpen, initialTitle, initialContent, initialMetadata]);

    const wordCount = content.replace(/<[^>]*>/g, '').trim().split(/\s+/).filter(Boolean).length;

    const handleSave = () => {
        if (readOnly) {
            onClose();
            return;
        }
        onSave({
            title,
            content,
            metadata: {
                ...metadata,
                description,
            },
        });
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleSave} />

            <div className="relative w-full max-w-4xl h-[90vh] bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col">
                {/* Header */}
                <div className="px-8 py-6 border-b flex items-center justify-between bg-gray-50/50">
                    <div className="flex items-center gap-6 flex-1">
                        {!readOnly ? (
                            <>
                                <div
                                    className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-inner shrink-0"
                                    style={{ backgroundColor: metadata?.iconBgColor || '#ec4899' }}
                                >
                                    {metadata?.svgUrl && (
                                        <img
                                            src={metadata.svgUrl}
                                            alt=""
                                            className="w-10 h-10 object-contain"
                                        />
                                    )}
                                </div>

                                <div className="flex-1">
                                    <input
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        className="w-full text-2xl font-bold bg-transparent border-none outline-none text-gray-900 placeholder:text-gray-300"
                                        placeholder="Add a title here..."
                                        readOnly={readOnly}
                                    />
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-sm font-medium text-gray-500">{wordCount} words</span>
                                        <span className="text-gray-300">•</span>
                                        <span className="text-sm font-medium text-gray-500">
                                            {metadata?.counterType === 'cards' ? 'List Card' : 'Document Card'}
                                        </span>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="flex items-center gap-3">
                                <FileText className="w-6 h-6 text-gray-500" />
                                <span className="text-lg font-semibold text-gray-700">View Document</span>
                            </div>
                        )}
                    </div>

                    <Button variant="ghost" size="icon" onClick={handleSave} className="h-10 w-10 rounded-full hover:bg-gray-200">
                        <X className="w-6 h-6 text-gray-500" />
                    </Button>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-8 lg:px-24">
                    <div className="max-w-3xl mx-auto h-full flex flex-col">
                        {/* Toolbar - Only show in Edit mode */}
                        {!readOnly && (
                            <div className="flex items-center gap-4 mb-8 py-2 border-y border-gray-100 sticky top-0 bg-white z-10 overflow-x-auto no-scrollbar">
                                <Button variant="ghost" size="sm" className="text-gray-400 hover:text-gray-900"><Bold className="w-4 h-4" /></Button>
                                <Button variant="ghost" size="sm" className="text-gray-400 hover:text-gray-900"><Italic className="w-4 h-4" /></Button>
                                <Button variant="ghost" size="sm" className="text-gray-400 hover:text-gray-900"><Link className="w-4 h-4" /></Button>
                                <div className="w-px h-4 bg-gray-200" />
                                <Button variant="ghost" size="sm" className="text-gray-400 hover:text-gray-900"><List className="w-4 h-4" /></Button>
                                <Button variant="ghost" size="sm" className="text-gray-400 hover:text-gray-900"><AlignLeft className="w-4 h-4" /></Button>
                            </div>
                        )}

                        {/* Editor Area */}
                        <textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            className="flex-1 w-full resize-none text-lg text-gray-800 bg-transparent border-none outline-none placeholder:text-gray-200 font-serif leading-relaxed"
                            placeholder={readOnly ? "No content." : "Start writing..."}
                            readOnly={readOnly}
                        />
                    </div>
                </div>

                {/* Footer - Only show in Edit mode */}
                {!readOnly && (
                    <div className="px-8 py-6 border-t bg-gray-50/50">
                        <div className="max-w-3xl mx-auto italic">
                            <input
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="w-full bg-transparent border-none outline-none text-gray-500 placeholder:text-gray-300 text-sm"
                                placeholder="Add a description..."
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
