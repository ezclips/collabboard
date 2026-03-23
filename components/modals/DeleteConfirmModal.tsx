
import React from 'react';

interface DeleteConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title?: string;
    message?: string;
    isLoading?: boolean;
}

export default function DeleteConfirmModal({
    isOpen,
    onClose,
    onConfirm,
    title = "Delete Post",
    message = "Are you sure you want to delete this post? This action cannot be undone.",
    isLoading = false
}: DeleteConfirmModalProps) {
    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6"
                onClick={(e) => e.stopPropagation()}
            >
                <h2 className="text-xl font-semibold mb-3 text-gray-900">
                    {title}
                </h2>

                <p className="text-gray-600 mb-6">
                    {message}
                </p>

                <div className="flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => {
                            if (!isLoading) {
                                onConfirm();
                                // We don't auto-close here anymore, let the parent handle it
                                // or keep it if we want immediate close feeling
                                onClose();
                            }
                        }}
                        disabled={isLoading}
                        className={`px-4 py-2 rounded-lg text-white transition-colors ${isLoading
                                ? 'bg-red-400 cursor-not-allowed'
                                : 'bg-red-600 hover:bg-red-700'
                            }`}
                    >
                        {isLoading ? 'Deleting...' : 'Delete'}
                    </button>
                </div>
            </div>
        </div>
    );
}
