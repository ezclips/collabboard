'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, CheckSquare, StickyNote, Link2, Image, Table2, ExternalLink, Check } from 'lucide-react';
import crypto from 'crypto';

interface SharePageClientProps {
    token: string;
    shareTarget: string;
    boardId: string | null;
    padletId: string | null;
    permission: string;
    isPasswordProtected: boolean;
    passwordHash: string | null;
}

interface PadletData {
    id: string;
    title: string;
    content: string;
    type: string;
    image_url?: string;
    metadata?: Record<string, any>;
}

function hashPassword(password: string): string {
    // Mirror the server-side SHA-256 hash
    // Note: crypto is available in browsers via the Web Crypto API,
    // but we use the subtle API here
    return password; // placeholder — we validate via API below
}

export default function SharePageClient({
    token,
    shareTarget,
    boardId,
    padletId,
    permission,
    isPasswordProtected,
    passwordHash,
}: SharePageClientProps) {
    const router = useRouter();
    const [passwordInput, setPasswordInput] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [isUnlocked, setIsUnlocked] = useState(!isPasswordProtected);
    const [isCheckingPassword, setIsCheckingPassword] = useState(false);
    const [padlet, setPadlet] = useState<PadletData | null>(null);
    const [isLoadingPadlet, setIsLoadingPadlet] = useState(false);
    const [padletError, setPadletError] = useState('');

    // After unlock, fetch padlet data for 'post' target
    useEffect(() => {
        if (!isUnlocked || shareTarget !== 'post' || !padletId) return;

        setIsLoadingPadlet(true);
        fetch(`/api/share-link/padlet?token=${token}&padletId=${padletId}`)
            .then((res) => res.json())
            .then((data) => {
                if (data.error) {
                    setPadletError(data.error);
                } else {
                    setPadlet(data.padlet);
                }
            })
            .catch(() => setPadletError('Failed to load post.'))
            .finally(() => setIsLoadingPadlet(false));
    }, [isUnlocked, shareTarget, padletId, token]);

    // After unlock, redirect for board/post-in-board targets
    useEffect(() => {
        if (!isUnlocked) return;

        if (shareTarget === 'board' && boardId) {
            router.replace(`/dashboard/canvas/${boardId}`);
            return;
        }
        if (shareTarget === 'post-in-board' && boardId) {
            const url = padletId
                ? `/dashboard/canvas/${boardId}?openPadlet=${padletId}`
                : `/dashboard/canvas/${boardId}`;
            router.replace(url);
            return;
        }
    }, [isUnlocked, shareTarget, boardId, padletId, router]);

    const handlePasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsCheckingPassword(true);
        setPasswordError('');

        try {
            const res = await fetch(`/api/share-link/verify-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password: passwordInput }),
            });
            const data = await res.json();
            if (data.valid) {
                setIsUnlocked(true);
            } else {
                setPasswordError('Incorrect password. Please try again.');
            }
        } catch {
            setPasswordError('Failed to verify password. Please try again.');
        } finally {
            setIsCheckingPassword(false);
        }
    };

    // Password gate
    if (!isUnlocked) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-sm">
                    <div className="flex items-center gap-2 mb-6">
                        <Lock className="w-5 h-5 text-gray-400" />
                        <h1 className="text-lg font-semibold text-gray-800">Password required</h1>
                    </div>
                    <form onSubmit={handlePasswordSubmit} className="space-y-4">
                        <input
                            type="password"
                            value={passwordInput}
                            onChange={(e) => setPasswordInput(e.target.value)}
                            placeholder="Enter password"
                            autoFocus
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {passwordError && (
                            <p className="text-xs text-red-500">{passwordError}</p>
                        )}
                        <button
                            type="submit"
                            disabled={!passwordInput || isCheckingPassword}
                            className="w-full py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {isCheckingPassword ? 'Verifying...' : 'Unlock'}
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    // Redirecting states (board / post-in-board)
    if (shareTarget === 'board' || shareTarget === 'post-in-board') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <p className="text-gray-500 text-sm">Redirecting to board...</p>
            </div>
        );
    }

    // Standalone post view
    if (isLoadingPadlet) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <p className="text-gray-500 text-sm">Loading post...</p>
            </div>
        );
    }

    if (padletError) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center">
                    <h1 className="text-xl font-bold text-gray-800 mb-2">Could not load post</h1>
                    <p className="text-gray-500 text-sm">{padletError}</p>
                </div>
            </div>
        );
    }

    if (!padlet) return null;

    return (
        <div className="min-h-screen bg-gray-50 flex items-start justify-center py-12 px-4">
            <div className="w-full max-w-lg">
                <div className="mb-4 flex items-center justify-between">
                    <span className="text-xs text-gray-400 uppercase tracking-wide font-medium">
                        Shared post
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        permission === 'edit'
                            ? 'bg-green-100 text-green-700'
                            : permission === 'comment'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-gray-100 text-gray-600'
                    }`}>
                        {permission === 'edit' ? 'Can edit' : permission === 'comment' ? 'Can comment' : 'View only'}
                    </span>
                </div>
                <PostCard padlet={padlet} />
            </div>
        </div>
    );
}

function PostCard({ padlet }: { padlet: PadletData }) {
    const bgColor = (padlet.metadata as any)?.cardColor || '#ffffff';
    const topStrip = (padlet.metadata as any)?.topStrip;

    return (
        <div
            className="rounded-xl shadow-sm border border-gray-200 overflow-hidden"
            style={{ backgroundColor: bgColor }}
        >
            {topStrip && topStrip !== 'transparent' && (
                <div className="h-2 w-full" style={{ backgroundColor: topStrip }} />
            )}

            <div className="p-5">
                {padlet.type === 'todo' ? (
                    <TodoPostView padlet={padlet} />
                ) : padlet.type === 'image' ? (
                    <ImagePostView padlet={padlet} />
                ) : padlet.type === 'link' ? (
                    <LinkPostView padlet={padlet} />
                ) : (
                    <NotePostView padlet={padlet} />
                )}
            </div>
        </div>
    );
}

function TodoPostView({ padlet }: { padlet: PadletData }) {
    const tasks: Array<{ id: string; text: string; completed: boolean }> =
        (padlet.metadata as any)?.tasks || [];
    const title = (padlet.metadata as any)?.todoTitle || padlet.title;

    return (
        <div>
            <div className="flex items-center gap-2 mb-4">
                <CheckSquare className="w-4 h-4 text-blue-500 flex-shrink-0" />
                {title && <h2 className="text-base font-semibold text-gray-800">{title}</h2>}
            </div>
            {tasks.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No tasks yet.</p>
            ) : (
                <ul className="space-y-2">
                    {tasks.map((task) => (
                        <li key={task.id} className="flex items-start gap-2">
                            <div className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
                                task.completed ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                            }`}>
                                {task.completed && <Check className="w-3 h-3 text-white" />}
                            </div>
                            <span className={`text-sm ${task.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                                {task.text}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function ImagePostView({ padlet }: { padlet: PadletData }) {
    return (
        <div>
            {padlet.title && (
                <h2 className="text-base font-semibold text-gray-800 mb-3">{padlet.title}</h2>
            )}
            {padlet.image_url && (
                <img
                    src={padlet.image_url}
                    alt={padlet.title || 'Shared image'}
                    className="w-full rounded-lg object-contain max-h-96"
                />
            )}
            {padlet.content && (
                <p className="mt-3 text-sm text-gray-600">{padlet.content}</p>
            )}
        </div>
    );
}

function LinkPostView({ padlet }: { padlet: PadletData }) {
    const meta = padlet.metadata as any;
    const url = meta?.linkUrl || padlet.content;
    const linkTitle = meta?.linkTitle || padlet.title;
    const description = meta?.linkDescription;
    const favicon = meta?.linkFavicon;
    const domain = meta?.linkDomain;

    return (
        <div>
            <div className="flex items-center gap-2 mb-3">
                {favicon ? (
                    <img src={favicon} alt="" className="w-4 h-4 rounded" />
                ) : (
                    <Link2 className="w-4 h-4 text-gray-400" />
                )}
                {domain && <span className="text-xs text-gray-400">{domain}</span>}
            </div>
            {linkTitle && <h2 className="text-base font-semibold text-gray-800 mb-1">{linkTitle}</h2>}
            {description && <p className="text-sm text-gray-500 mb-3 line-clamp-3">{description}</p>}
            {url && (
                <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600"
                >
                    Open link <ExternalLink className="w-3 h-3" />
                </a>
            )}
        </div>
    );
}

function NotePostView({ padlet }: { padlet: PadletData }) {
    return (
        <div>
            {padlet.title && (
                <h2 className="text-base font-semibold text-gray-800 mb-2">{padlet.title}</h2>
            )}
            {padlet.content && (
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{padlet.content}</p>
            )}
        </div>
    );
}
