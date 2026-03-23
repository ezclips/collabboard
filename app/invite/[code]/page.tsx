'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, CheckCircle, XCircle, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { useSupabase } from '@/lib/supabase';

interface WorkspaceInvitation {
    id: string;
    workspace_id: string;
    created_by: string | null;
    role: string;
    uses: number | null;
    max_uses: number | null;
    email_domain?: string | null;
    expires_at?: string | null;
    password?: string | null;
    canvas_ids?: string[] | null;
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

            // Look up the invitation
            const { data: inv, error: invError } = await supabase
                .from('workspace_invitations')
                .select('*')
                .eq('link_code', inviteCode)
                .single();

            if (invError || !inv) {
                setError('This invite link is invalid or has expired.');
                return;
            }

            // Check if expired
            if (inv.expires_at && new Date(inv.expires_at) < new Date()) {
                setError('This invite link has expired.');
                return;
            }

            // Check if max uses reached
            if (inv.max_uses && inv.uses >= inv.max_uses) {
                setError('This invite link has reached its maximum number of uses.');
                return;
            }

            // Check email domain restriction
            if (inv.email_domain && currentUser?.email) {
                const userDomain = currentUser.email.split('@')[1];
                if (userDomain !== inv.email_domain) {
                    setError(`This invite is restricted to @${inv.email_domain} email addresses.`);
                    return;
                }
            }

            setInvitation(inv as WorkspaceInvitation);
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

            if (invitation.password && passwordInput !== invitation.password) {
                setPasswordError('Incorrect password');
                toast.error('Incorrect password');
                return;
            }

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
                    {invitation.password && (
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
