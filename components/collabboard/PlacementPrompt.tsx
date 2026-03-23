"use client";

import React from 'react';
import { LayoutGrid, MousePointer2, X } from 'lucide-react';
import { PendingPostDraft } from '../../types/collabboard';

interface PlacementPromptProps {
    isOpen: boolean;
    onClose: () => void;
    draft: PendingPostDraft | null;
    onPlaceInNew: () => void;
    onPlaceInExisting: () => void;
}

export default function PlacementPrompt({
    isOpen,
    onClose,
    draft,
    onPlaceInNew,
    onPlaceInExisting,
}: PlacementPromptProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[4000] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 pointer-events-none">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 pointer-events-auto">
                <div className="p-6 border-b flex items-center justify-between">
                    <h3 className="text-xl font-bold text-gray-800">Where should this go?</h3>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    <p className="text-gray-500 text-sm">
                        Create a container to organize your posts. Choose whether
                        to start a new container or add to one already on the
                        canvas.
                    </p>

                    <div className="grid grid-cols-1 gap-3">
                        <button
                            onClick={onPlaceInNew}
                            className="flex items-center gap-4 p-4 rounded-xl border-2 border-gray-100 hover:border-blue-500 hover:bg-blue-50 transition-all group text-left"
                        >
                            <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 group-hover:bg-blue-200 transition-colors">
                                <LayoutGrid className="w-6 h-6" />
                            </div>
                            <div>
                                <div className="font-bold text-gray-800">New Container</div>
                                <div className="text-xs text-gray-500">Create a new container on the canvas</div>
                            </div>
                        </button>

                        <button
                            onClick={onPlaceInExisting}
                            className="flex items-center gap-4 p-4 rounded-xl border-2 border-gray-100 hover:border-blue-500 hover:bg-blue-50 transition-all group text-left"
                        >
                            <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center text-purple-600 group-hover:bg-purple-200 transition-colors">
                                <MousePointer2 className="w-6 h-6" />
                            </div>
                            <div>
                                <div className="font-bold text-gray-800">Add to Existing</div>
                                <div className="text-xs text-gray-500">Drag and drop into a container on the canvas</div>
                            </div>
                        </button>

                    </div>
                </div>
            </div>
        </div>
    );
}
