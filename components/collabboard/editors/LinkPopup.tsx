"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Link, ExternalLink, Copy, Trash2, X, Check } from 'lucide-react';

interface LinkPopupProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (url: string) => void;
    onRemoveLink: () => void;
    initialUrl?: string;
}

export default function LinkPopup({
    isOpen,
    onOpenChange,
    onSubmit,
    onRemoveLink,
    initialUrl = '',
}: LinkPopupProps) {
    const [url, setUrl] = useState('');
    const [isEditMode, setIsEditMode] = useState(false);
    const [copied, setCopied] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // Determine if we're editing an existing link or adding a new one
    const hasExistingLink = initialUrl.trim().length > 0;

    useEffect(() => {
        if (isOpen) {
            setUrl(initialUrl);
            setIsEditMode(false);
            setCopied(false);

            // Focus input after a brief delay (only when adding new link or editing)
            if (!hasExistingLink) {
                setTimeout(() => {
                    inputRef.current?.focus();
                    inputRef.current?.select();
                }, 50);
            }
        }
    }, [isOpen, initialUrl, hasExistingLink]);

    const preventFocusLoss = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const formatUrl = (rawUrl: string): string => {
        const trimmed = rawUrl.trim();
        if (!trimmed) return '';
        if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
            return 'https://' + trimmed;
        }
        return trimmed;
    };

    const getDisplayUrl = (fullUrl: string): string => {
        try {
            const urlObj = new URL(fullUrl);
            const display = urlObj.hostname + urlObj.pathname;
            // Truncate if too long
            if (display.length > 35) {
                return display.substring(0, 32) + '...';
            }
            return display;
        } catch {
            // If not a valid URL, just truncate
            if (fullUrl.length > 35) {
                return fullUrl.substring(0, 32) + '...';
            }
            return fullUrl;
        }
    };

    const handleSubmit = () => {
        const trimmedUrl = url.trim();

        if (!trimmedUrl) {
            onRemoveLink();
            onOpenChange(false);
            setUrl('');
            return;
        }

        const finalUrl = formatUrl(trimmedUrl);
        onSubmit(finalUrl);
        onOpenChange(false);
        setUrl('');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSubmit();
        } else if (e.key === 'Escape') {
            if (isEditMode && hasExistingLink) {
                // Cancel edit, go back to view mode
                setIsEditMode(false);
                setUrl(initialUrl);
            } else {
                onOpenChange(false);
            }
        }
    };

    const handleOpenLink = () => {
        const finalUrl = formatUrl(url);
        if (finalUrl) {
            window.open(finalUrl, '_blank', 'noopener,noreferrer');
        }
    };

    const handleCopyLink = async () => {
        const finalUrl = formatUrl(url);
        if (finalUrl) {
            try {
                await navigator.clipboard.writeText(finalUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            } catch (err) {
                console.error('Failed to copy:', err);
            }
        }
    };

    const handleRemoveLink = () => {
        onRemoveLink();
        onOpenChange(false);
        setUrl('');
    };

    const handleStartEdit = () => {
        setIsEditMode(true);
        setTimeout(() => {
            inputRef.current?.focus();
            inputRef.current?.select();
        }, 50);
    };

    if (!isOpen) return null;

    // VIEW MODE: Show existing link with action buttons
    if (hasExistingLink && !isEditMode) {
        return (
            <div
                className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full pl-2"
                onMouseDown={preventFocusLoss}
            >
                <div className="bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden min-w-[280px]">
                    {/* Header */}
                    <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
                        <div className="flex items-center gap-2">
                            <Link className="w-4 h-4 text-gray-500" />
                            <span className="text-xs font-medium text-gray-600">Link</span>
                        </div>
                        <button
                            onClick={() => onOpenChange(false)}
                            className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    </div>

                    {/* URL Display */}
                    <div className="px-3 py-3">
                        <div
                            className="text-sm text-blue-600 hover:text-blue-700 cursor-pointer truncate"
                            onClick={handleOpenLink}
                            title={url}
                        >
                            {getDisplayUrl(url)}
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1 px-2 py-2 border-t border-gray-100 bg-gray-50">
                        <button
                            onClick={handleOpenLink}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
                            title="Open link in new tab"
                        >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Open</span>
                        </button>
                        <button
                            onClick={handleCopyLink}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
                            title="Copy link"
                        >
                            {copied ? (
                                <>
                                    <Check className="w-3.5 h-3.5 text-green-500" />
                                    <span className="text-green-600">Copied</span>
                                </>
                            ) : (
                                <>
                                    <Copy className="w-3.5 h-3.5" />
                                    <span>Copy</span>
                                </>
                            )}
                        </button>
                        <button
                            onClick={handleStartEdit}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
                            title="Edit link"
                        >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                            <span>Edit</span>
                        </button>
                        <button
                            onClick={handleRemoveLink}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-red-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors ml-auto"
                            title="Remove link"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remove</span>
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ADD/EDIT MODE: Show input field
    return (
        <div
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full pl-2"
            onMouseDown={preventFocusLoss}
        >
            <div className="bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden min-w-[280px]">
                {/* Header */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
                    <div className="flex items-center gap-2">
                        <Link className="w-4 h-4 text-gray-500" />
                        <span className="text-xs font-medium text-gray-600">
                            {isEditMode ? 'Edit Link' : 'Add Link'}
                        </span>
                    </div>
                    <button
                        onClick={() => {
                            if (isEditMode && hasExistingLink) {
                                setIsEditMode(false);
                                setUrl(initialUrl);
                            } else {
                                onOpenChange(false);
                            }
                        }}
                        className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600"
                    >
                        <X className="w-3 h-3" />
                    </button>
                </div>

                {/* Input Field */}
                <div className="p-3">
                    <input
                        ref={inputRef}
                        type="text"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Paste or type a URL"
                        className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent placeholder-gray-400"
                    />
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 bg-gray-50">
                    <button
                        onClick={handleRemoveLink}
                        className="text-xs text-gray-500 hover:text-red-500 transition-colors"
                    >
                        {hasExistingLink ? 'Remove Link' : 'Cancel'}
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!url.trim()}
                        className="px-4 py-1.5 text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-lg transition-colors"
                    >
                        {isEditMode ? 'Update' : 'Apply'}
                    </button>
                </div>
            </div>
        </div>
    );
}
