import React from 'react';
import { LayoutGrid, MousePointer2, X } from 'lucide-react';
import { placementOptions } from '@/lib/domain/canvas/placementOptions';

interface ColumnContainerCreationPromptProps {
    isOpen: boolean;
    onClose: () => void;
    onNewContainer: () => void;
    onAddToExisting: () => void;
    /**
     * PATCH-381. Containers on the board today. With none, "Add to Existing"
     * is disabled with a hint instead of leading to a dead-end drag. Defaults
     * to 1 so the "+ Container" tool prompt (which keeps its old behaviour)
     * is unaffected when it does not pass one.
     */
    containerCount?: number;
    /**
     * PATCH-380 Addendum 1. False for a guest: a guest may not write
     * `board_sections`, so "New Container" is hidden and only "Add to
     * Existing" is offered. PATCH-381 keeps this for the "+ Container" tool
     * prompt; the new-post prompts no longer pass it.
     */
    canCreateContainer?: boolean;
    /**
     * PATCH-381. The new-post prompts all read "Where should this go?" (the
     * default). The "+ Container" tool prompt passes its own heading to keep
     * its existing wording.
     */
    heading?: string;
}

export default function ColumnContainerCreationPrompt({
    isOpen,
    onClose,
    onNewContainer,
    onAddToExisting,
    containerCount = 1,
    canCreateContainer = true,
    heading = 'Where should this go?',
}: ColumnContainerCreationPromptProps) {
    if (!isOpen) return null;

    const options = placementOptions({ containerCount, canCreateContainer });
    const addDisabled = options.addToExisting === 'disabled';

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 pointer-events-auto">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b flex items-center justify-between">
                    <h3 className="text-xl font-bold text-gray-800">{heading}</h3>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    <p className="text-gray-500 text-sm">
                        {canCreateContainer
                            ? 'Create a container to organize your posts. Choose whether to start a new container or add to one already on the canvas.'
                            : 'Add this post to a container already on the canvas.'}
                    </p>

                    <div className="grid grid-cols-1 gap-3">
                        {options.newContainer !== 'hidden' ? (
                            <button
                                onClick={onNewContainer}
                                className="flex items-center gap-4 p-4 rounded-xl border-2 border-gray-100 hover:border-blue-500 hover:bg-blue-50 transition-all group text-left"
                            >
                                <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 group-hover:bg-blue-200 transition-colors">
                                    <LayoutGrid className="w-6 h-6" />
                                </div>
                                <div>
                                    <div className="font-bold text-gray-800">New Container</div>
                                    <div className="text-xs text-gray-500">Create a new container on the wall</div>
                                </div>
                            </button>
                        ) : null}

                        <div>
                            <button
                                onClick={addDisabled ? undefined : onAddToExisting}
                                aria-disabled={addDisabled || undefined}
                                title={addDisabled ? options.hint : undefined}
                                className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all group text-left w-full ${
                                    addDisabled
                                        ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                                        : 'border-gray-100 hover:border-blue-500 hover:bg-blue-50'
                                }`}
                            >
                                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                                    addDisabled
                                        ? 'bg-gray-100 text-gray-400'
                                        : 'bg-purple-100 text-purple-600 group-hover:bg-purple-200 transition-colors'
                                }`}>
                                    <MousePointer2 className="w-6 h-6" />
                                </div>
                                <div>
                                    <div className="font-bold text-gray-800">Add to Existing</div>
                                    <div className="text-xs text-gray-500">Drag and drop into a container on the canvas</div>
                                </div>
                            </button>
                            {addDisabled && options.hint ? (
                                <p data-placement-hint className="mt-2 text-xs text-gray-500">{options.hint}</p>
                            ) : null}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
