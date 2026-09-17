'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, CheckCircle, XCircle, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { useSupabase } from '@/lib/supabase';

/**
 * Exactly what /api/invitations/preview returns -- no more. The invitation row
 * itself carries `link_code` and a plaintext `password`, which is why this page
 * no longer reads the table: it asks the server whether a password is REQUIRED
 * and is never told what it is. `password` is absent from this type on purpose,
 * so it cannot come back by accident; the fields the row has but the preview
 * withholds (id, workspace_id, created_by, canvas_ids) are absent for the same
 * reason -- declaring them would type a value that is always undefined.
 */
interface WorkspaceInvitation {
    role: string;
    requiresPassword: boolean;
    emailDomain: string | null;
    expiresAt: string | null;
    maxUses: number | null;
    uses: number;
}

export default function InvitePage() {
    const params = useParams();
    const router = useRouter();
    const { supabase } = useSupabase();
    const inviteCode = params.code as string;
    
    const [loading, setLoading] = useState(true);
    const [accepting, setAccepting] = useState(false);
    const [invitation, setInvitation] = useState<WorkspaceInvitation | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [user, setUser] = useState<{ id: string; email?: string | null } | null>(null);
    const [passwordInput, setPasswordInput] = useState('');
    const [passwordError, setPasswordError] = useState('');

    useEffect(() => {
        checkInvitation();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inviteCode]);

    const checkInvitation = async () => {
        try {
            setLoading(true);
            
            // Check if user is logged in
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            setUser(currentUser);

            // Look up the invitation through the server. This page must not read
            // workspace_invitations directly: that row carries link_code and the
            // plaintext password, and anon no longer holds the table at all.
            // Expiry and max_uses are decided server-side now, which is why the
            // two checks that used to live here are gone rather than duplicated.
            const response = await fetch(`/api/invitations/preview?code=${encodeURIComponent(inviteCode)}`);
            const preview = await response.json().catch(() => null);

            if (!response.ok || !preview?.valid) {
                if (preview?.reason === 'expired') {
                    setError('This invite link has expired.');
                } else if (preview?.reason === 'exhausted') {
                    setError('This invite link has reached its maximum number of uses.');
                } else {
                    setError('This invite link is invalid or has expired.');
                }
                return;
            }

            // Check email domain restriction
            if (preview.emailDomain && currentUser?.email) {
                const userDomain = currentUser.email.split('@')[1];
                if (userDomain !== preview.emailDomain) {
                    setError(`This invite is restricted to @${preview.emailDomain} email addresses.`);
                    return;
                }
            }

            setInvitation(preview as WorkspaceInvitation);
        } catch (err) {
            console.error('Error checking invitation:', err);
            setError('Failed to verify invitation.');
        } finally {
            setLoading(false);
        }
    };

    const handleAcceptInvite = async () => {
        if (!invitation) return;

        if (!user) {
            // Redirect to login with return URL
            router.push(`/auth?redirect=/invite/${inviteCode}`);
            return;
        }

        try {
            setAccepting(true);
            setPasswordError('');

            // No client-side password comparison: this page never holds the
            // password. /api/invitations/accept compares it and returns
            // "Incorrect password", which the error branch below surfaces.

            const { data: { session } } = await supabase.auth.getSession();
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };
            if (session?.access_token) {
                headers.Authorization = `Bearer ${session.access_token}`;
            }

            const response = await fetch('/api/invitations/accept', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    code: inviteCode,
                    password: passwordInput,
                }),
            });

            const result = await response.json();
            if (!response.ok) {
                const message = typeof result?.error === 'string' ? result.error : 'Failed to accept invitation';
                if (message.toLowerCase().includes('password')) {
                    setPasswordError(message);
                }
                toast.error(message);
                return;
            }

            const restrictedCount = Array.isArray(result?.restricted_canvas_ids)
                ? result.restricted_canvas_ids.length
                : 0;

            if (restrictedCount > 0) {
                toast.success(`Successfully joined workspace with access to ${restrictedCount} assigned canvas${restrictedCount === 1 ? '' : 'es'}.`);
            } else {
                toast.success('Successfully joined workspace!');
            }
            router.push('/dashboard');
        } catch (err) {
            console.error('Error accepting invite:', err);
            toast.error('Failed to accept invitation');
        } finally {
            setAccepting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center">
                    <Loader2 className="w-12 h-12 animate-spin text-purple-600 mx-auto mb-4" />
                    <p className="text-gray-500">Verifying invitation...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="bg-white rounded-xl shadow-lg p-8 max-w-md mx-4 text-center">
                    <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                        <XCircle className="w-8 h-8 text-red-600" />
                    </div>
                    <h1 className="text-xl font-semibold text-gray-900 mb-2">Invalid Invitation</h1>
                    <p className="text-gray-500 mb-6">{error}</p>
                    <button
                        onClick={() => router.push('/')}
                        className="px-6 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors"
                    >
                        Go to Home
                    </button>
                </div>
            </div>
        );
    }

    if (!invitation) {
        return null;
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="bg-white rounded-xl shadow-lg p-8 max-w-md mx-4 text-center">
                <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center mx-auto mb-4">
                    <UserPlus className="w-8 h-8 text-purple-600" />
                </div>
                
                <h1 className="text-xl font-semibold text-gray-900 mb-2">
                    You&apos;ve been invited!
                </h1>
                <p className="text-gray-500 mb-2">
                    You&apos;ve been invited to join a workspace as a{' '}
                    <span className="font-medium text-gray-700">{invitation.role}</span>.
                </p>
                
                {user ? (
                    <p className="text-sm text-gray-400 mb-6">
                        Signed in as {user.email}
                    </p>
                ) : (
                    <p className="text-sm text-gray-400 mb-6">
                        You&apos;ll need to sign in to accept this invitation.
                    </p>
                )}

                <div className="space-y-3">
                    {invitation.requiresPassword && (
                        <div className="text-left">
                            <label className="mb-2 block text-sm font-medium text-gray-700">Password</label>
                            <input
                                type="password"
                                value={passwordInput}
                                onChange={(e) => {
                                    setPasswordInput(e.target.value);
                                    if (passwordError) {
                                        setPasswordError('');
                                    }
                                }}
                                className="w-full rounded-lg border border-gray-200 px-4 py-3 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-purple-500"
                                placeholder="Enter invitation password"
                            />
                            {passwordError && (
                                <p className="mt-2 text-sm text-red-600">{passwordError}</p>
                            )}
                        </div>
                    )}

                    <button
                        onClick={handleAcceptInvite}
                        disabled={accepting}
                        className="w-full px-6 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {accepting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Joining...
                            </>
                        ) : (
                            <>
                                <CheckCircle className="w-4 h-4" />
                                {user ? 'Accept Invitation' : 'Sign in to Accept'}
                            </>
                        )}
                    </button>
                    
                    <button
                        onClick={() => router.push('/')}
                        className="w-full px-6 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}
