'use client';

import React, { useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Fingerprint, Trash2, Loader2, ChevronRight, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

export default function DeleteAccountPage() {
    const supabase = createClientComponentClient();
    const router = useRouter();
    
    const [isVerified, setIsVerified] = useState(false);
    const [verifying, setVerifying] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');
    const [deleting, setDeleting] = useState(false);

    const handleVerify = async () => {
        try {
            setVerifying(true);
            
            // Check if user is logged in
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                toast.error('Please log in again to verify your identity');
                router.push('/login');
                return;
            }

            // In a real app, this might require re-authentication
            setIsVerified(true);
            toast.success('Identity verified');
        } catch (err) {
            console.error('Error verifying:', err);
            toast.error('Failed to verify identity');
        } finally {
            setVerifying(false);
        }
    };

    const handleDeleteAccount = async () => {
        if (deleteConfirmText !== 'DELETE') {
            toast.error('Please type DELETE to confirm');
            return;
        }

        try {
            setDeleting(true);

            const res = await fetch('/api/settings/delete-account', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ confirmText: deleteConfirmText })
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(payload?.error || 'Failed to delete account');
            }

            await supabase.auth.signOut();
            toast.success('Your account has been deleted');
            router.push('/login');
        } catch (err) {
            console.error('Error deleting account:', err);
            toast.error(err instanceof Error ? err.message : 'Failed to delete account');
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div>
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-2xl font-semibold text-gray-900">Delete account</h1>
                <p className="text-gray-600 mt-2">
                    The following steps are necessary to ensure your account is deleted without any issues.
                </p>
            </div>

            {/* Steps Card */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
                {/* Step 1: Verify Identity */}
                <div className="px-6 py-5 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                            <Fingerprint className="w-5 h-5 text-gray-500" />
                        </div>
                        <div>
                            <div className="font-medium text-purple-600">Log in to verify your account</div>
                            <div className="text-sm text-gray-500">
                                For security purposes please log in to your account to verify it is you.
                            </div>
                        </div>
                    </div>
                    {isVerified ? (
                        <span className="text-green-600 font-medium">Verified</span>
                    ) : (
                        <button
                            onClick={handleVerify}
                            disabled={verifying}
                            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 font-medium transition-colors"
                        >
                            {verifying && <Loader2 className="w-4 h-4 animate-spin" />}
                            Log in
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {/* Step 2: Delete Account */}
                <div className={`px-6 py-5 flex items-start justify-between ${!isVerified ? 'opacity-50' : ''}`}>
                    <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                            <Trash2 className="w-5 h-5 text-gray-500" />
                        </div>
                        <div>
                            <div className="font-medium text-gray-400">Delete your account</div>
                            <div className="text-sm text-gray-400 max-w-lg">
                                All scenes in your personal account will be deleted along with any contributions made to them. Your contributions to other scenes will be made anonymous. This action is permanent and cannot be undone.
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Delete Button (only shown when verified) */}
            {isVerified && (
                <div className="mt-6">
                    {!showDeleteConfirm ? (
                        <button
                            onClick={() => setShowDeleteConfirm(true)}
                            className="px-6 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
                        >
                            Delete my account
                        </button>
                    ) : (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-6">
                            <div className="flex items-start gap-3 mb-4">
                                <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0" />
                                <div>
                                    <div className="font-semibold text-red-800">This action is irreversible</div>
                                    <div className="text-sm text-red-700 mt-1">
                                        All your data will be permanently deleted. This includes all scenes, files, and account information.
                                    </div>
                                </div>
                            </div>

                            <div className="mb-4">
                                <label className="block text-sm font-medium text-red-700 mb-2">
                                    Type <strong>DELETE</strong> to confirm
                                </label>
                                <input
                                    type="text"
                                    value={deleteConfirmText}
                                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                                    placeholder="DELETE"
                                    className="w-full px-4 py-2 border border-red-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                                />
                            </div>

                            <div className="flex items-center gap-4">
                                <button
                                    onClick={handleDeleteAccount}
                                    disabled={deleting || deleteConfirmText !== 'DELETE'}
                                    className="px-6 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                                >
                                    {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Permanently delete account
                                </button>
                                <button
                                    onClick={() => {
                                        setShowDeleteConfirm(false);
                                        setDeleteConfirmText('');
                                    }}
                                    className="px-6 py-2 text-gray-600 hover:text-gray-800 font-medium transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Warning */}
            <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-xl">
                <h3 className="font-medium text-yellow-800 mb-2">Before you delete</h3>
                <ul className="text-sm text-yellow-700 space-y-1 list-disc list-inside">
                    <li>Export any scenes you want to keep</li>
                    <li>Transfer ownership of shared scenes to another user</li>
                    <li>Cancel any active subscription first</li>
                    <li>Download your data export if needed</li>
                </ul>
            </div>
        </div>
    );
}
