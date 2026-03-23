"use client";

import React, { useState, useEffect } from 'react';
import { X, Copy, Check, Link2, Calendar, Lock, Eye, Edit3, MessageSquare } from 'lucide-react';

type ShareTarget = 'post' | 'board' | 'post-in-board';

interface ShareModalProps {
    isOpen: boolean;
    onClose: () => void;
    boardId?: string | number;
    padletId?: string;
    itemTitle?: string;
}

const PERMISSION_OPTIONS = [
    { value: 'view', label: 'View only', icon: Eye, description: 'Can see content but not edit' },
    { value: 'comment', label: 'Can comment', icon: MessageSquare, description: 'Can view and add comments' },
    { value: 'edit', label: 'Can edit', icon: Edit3, description: 'Full editing access' },
];

const SHARE_TARGET_OPTIONS: { value: ShareTarget; label: string; description: string }[] = [
    { value: 'post', label: 'Post only', description: 'Opens just this post in a standalone view' },
    { value: 'board', label: 'Full board', description: 'Opens the entire board' },
    { value: 'post-in-board', label: 'Post in board', description: 'Opens the board with this post highlighted' },
];

const EXPIRATION_OPTIONS = [
    { value: '', label: 'Never expires' },
    { value: '1', label: '1 day' },
    { value: '7', label: '7 days' },
    { value: '30', label: '30 days' },
    { value: '90', label: '90 days' },
];

export default function ShareModal({
    isOpen,
    onClose,
    boardId,
    padletId,
    itemTitle = 'this item',
}: ShareModalProps) {
    const [shareLink, setShareLink] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Settings
    const [permission, setPermission] = useState('view');
    const [shareTarget, setShareTarget] = useState<ShareTarget>('post-in-board');
    const [expirationDays, setExpirationDays] = useState('');
    const [usePassword, setUsePassword] = useState(false);
    const [password, setPassword] = useState('');

    // Reset state when modal opens
    useEffect(() => {
        if (isOpen) {
            setShareLink(null);
            setCopied(false);
            setError(null);
            setPermission('view');
            setShareTarget('post-in-board');
            setExpirationDays('');
            setUsePassword(false);
            setPassword('');
        }
    }, [isOpen]);

    const generateShareLink = async () => {
        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch('/api/share-link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    boardId,
                    padletId,
                    permission,
                    shareTarget,
                    expirationDays: expirationDays ? parseInt(expirationDays) : null,
                    password: usePassword && password ? password : null,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to create share link');
            }

            setShareLink(data.shareUrl);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const copyToClipboard = async () => {
        if (!shareLink) return;

        try {
            await navigator.clipboard.writeText(shareLink);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            setError('Failed to copy to clipboard');
        }
    };

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] p-4"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                        <Link2 className="w-5 h-5 text-blue-500" />
                        <h2 className="text-lg font-semibold text-gray-800">Share</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-5 space-y-5">
                    {/* Permission selector */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Permission level
                        </label>
                        <div className="space-y-2">
                            {PERMISSION_OPTIONS.map((option) => {
                                const Icon = option.icon;
                                return (
                                    <label
                                        key={option.value}
                                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${permission === option.value
                                            ? 'border-blue-500 bg-blue-50'
                                            : 'border-gray-200 hover:border-gray-300'
                                            }`}
                                    >
                                        <input
                                            type="radio"
                                            name="permission"
                                            value={option.value}
                                            checked={permission === option.value}
                                            onChange={(e) => setPermission(e.target.value)}
                                            className="sr-only"
                                        />
                                        <Icon className={`w-4 h-4 ${permission === option.value ? 'text-blue-500' : 'text-gray-400'}`} />
                                        <div className="flex-1">
                                            <div className={`text-sm font-medium ${permission === option.value ? 'text-blue-700' : 'text-gray-700'}`}>
                                                {option.label}
                                            </div>
                                            <div className="text-xs text-gray-500">{option.description}</div>
                                        </div>
                                    </label>
                                );
                            })}
                        </div>
                    </div>

                    {/* Share target */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Open link as
                        </label>
                        <div className="space-y-2">
                            {SHARE_TARGET_OPTIONS.map((option) => (
                                <label
                                    key={option.value}
                                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${shareTarget === option.value
                                        ? 'border-blue-500 bg-blue-50'
                                        : 'border-gray-200 hover:border-gray-300'
                                        }`}
                                >
                                    <input
                                        type="radio"
                                        name="shareTarget"
                                        value={option.value}
                                        checked={shareTarget === option.value}
                                        onChange={(e) => setShareTarget(e.target.value as ShareTarget)}
                                        className="sr-only"
                                    />
                                    <div className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${shareTarget === option.value ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`} />
                                    <div className="flex-1">
                                        <div className={`text-sm font-medium ${shareTarget === option.value ? 'text-blue-700' : 'text-gray-700'}`}>
                                            {option.label}
                                        </div>
                                        <div className="text-xs text-gray-500">{option.description}</div>
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Expiration */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            <Calendar className="w-4 h-4 inline mr-1 text-gray-400" />
                            Link expiration
                        </label>
                        <select
                            value={expirationDays}
                            onChange={(e) => setExpirationDays(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            {EXPIRATION_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Password protection */}
                    <div>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={usePassword}
                                onChange={(e) => setUsePassword(e.target.checked)}
                                className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                            />
                            <Lock className="w-4 h-4 text-gray-400" />
                            <span className="text-sm font-medium text-gray-700">Password protect</span>
                        </label>
                        {usePassword && (
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Enter password"
                                className="mt-2 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        )}
                    </div>

                    {/* Error message */}
                    {error && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                            {error}
                        </div>
                    )}

                    {/* Generated link display */}
                    {shareLink && (
                        <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={shareLink}
                                    readOnly
                                    className="flex-1 bg-transparent text-sm text-gray-600 outline-none truncate"
                                />
                                <button
                                    onClick={copyToClipboard}
                                    className={`flex items-center gap-1 px-3 py-1 rounded text-xs border transition-colors ${copied
                                            ? 'border-green-400 bg-green-50 text-green-600'
                                            : 'border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50'
                                        }`}
                                >
                                    {copied ? (
                                        <>
                                            <Check className="w-3 h-3" />
                                            Copied!
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="w-3 h-3" />
                                            Copy
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="px-3 py-1 text-xs text-gray-500 border border-gray-300 rounded hover:border-gray-400 hover:bg-gray-50 transition-colors"
                    >
                        Cancel
                    </button>
                    {!shareLink ? (
                        <button
                            onClick={generateShareLink}
                            disabled={isLoading || (usePassword && !password)}
                            className="px-3 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:border-gray-400 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {isLoading ? 'Creating...' : 'Create Link'}
                        </button>
                    ) : (
                        <button
                            onClick={() => setShareLink(null)}
                            className="px-3 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:border-gray-400 hover:bg-gray-50 transition-colors"
                        >
                            Create New Link
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
