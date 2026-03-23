"use client";

import React, { useState, useEffect, useRef } from 'react';

interface CommentViewPopupProps {
    isOpen: boolean;
    onClose: () => void;
    position: { x: number; y: number };
    commentText: string;
    userName: string;
    userId: string;
    timestamp: number;
    currentUserId?: string;
}

export default function CommentViewPopup({
    isOpen,
    onClose,
    position,
    commentText,
    userName,
    userId,
    timestamp,
    currentUserId = 'user1',
}: CommentViewPopupProps) {
    const popupRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen, onClose]);

    const getTimeAgo = (ts: number) => {
        const now = Date.now();
        const diff = now - ts;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (seconds < 60) return 'just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        return `${days}d ago`;
    };

    const getInitial = (name: string) => {
        return name.charAt(0).toUpperCase();
    };

    const isOwner = userId === currentUserId;

    if (!isOpen) return null;

    return (
        <div
            ref={popupRef}
            className="fixed z-[100]"
            style={{
                left: position.x,
                top: position.y,
            }}
        >
            <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-3 min-w-[260px]">
                {/* Header with avatar, name, time, and edit */}
                <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-orange-600 flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
                            {getInitial(userName)}
                        </div>
                        <div className="flex items-center gap-1">
                            <span className="text-sm font-medium text-gray-800">
                                {userName}
                            </span>
                            <span className="text-xs text-gray-400">
                                {getTimeAgo(timestamp)}
                            </span>
                        </div>
                    </div>
                    {isOwner && (
                        <button className="text-sm text-blue-500 hover:text-blue-600 font-medium">
                            Edit
                        </button>
                    )}
                </div>

                {/* Comment text */}
                <p className="text-sm text-gray-700 mb-2 ml-10">
                    {commentText}
                </p>

                {/* Reply link */}
                <button className="text-sm text-blue-500 hover:text-blue-600 ml-10">
                    Reply
                </button>
            </div>
        </div>
    );
}
