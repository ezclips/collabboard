'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { KeyRound, Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const MIN_PASSWORD_LENGTH = 15;
const DEFAULT_PASSKEY_NAME = 'Primary passkey';

type PasskeyFactor = {
    id: string;
    friendly_name?: string;
    created_at: string;
    updated_at: string;
    last_challenged_at?: string;
};

type AALLevel = 'aal1' | 'aal2' | 'aal3' | null;

const getAccessToken = (): string | null => {
    try {
        const lsKeys = Object.keys(localStorage).filter(k => k.includes('auth-token'));
        for (const key of lsKeys) {
            const raw = localStorage.getItem(key);
            if (!raw) continue;
            const parsed = JSON.parse(raw);
            const token = Array.isArray(parsed) ? parsed[0]?.access_token : parsed?.access_token;
            if (token) return token;
        }
    } catch { /* ignore */ }
    return null;
};

const decodeJwtPayload = (token: string): { sub?: string; email?: string } => {
    const [, payload = ''] = token.split('.');
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return JSON.parse(atob(padded)) as { sub?: string; email?: string };
};

const emitSecurityNotification = async (action: string) => {
    const token = getAccessToken();
    if (!token) return;

    try {
        await fetch('/api/settings/notifications/emit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                eventId: 'security_alerts',
                context: {
                    action,
                    workspaceLink: `${window.location.origin}/dashboard/settings/password`,
                },
            }),
        });
    } catch {
        // Never block password operations on notification emit failure.
    }
};

export default function PasswordPage() {
    const supabase = createClientComponentClient();
    
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [updating, setUpdating] = useState(false);
    const [sendingReset, setSendingReset] = useState(false);
    const [loadingPasskeys, setLoadingPasskeys] = useState(true);
    const [registeringPasskey, setRegisteringPasskey] = useState(false);
    const [verifyingPasskeyId, setVerifyingPasskeyId] = useState<string | null>(null);
    const [removingPasskeyId, setRemovingPasskeyId] = useState<string | null>(null);
    const [passkeyName, setPasskeyName] = useState(DEFAULT_PASSKEY_NAME);
    const [passkeyFactors, setPasskeyFactors] = useState<PasskeyFactor[]>([]);
    const [currentAal, setCurrentAal] = useState<AALLevel>(null);
    const [nextAal, setNextAal] = useState<AALLevel>(null);

    const loadPasskeyState = useCallback(async () => {
        try {
            setLoadingPasskeys(true);

            const [{ data: factorsData, error: factorsError }, { data: aalData, error: aalError }] = await Promise.all([
                supabase.auth.mfa.listFactors(),
                supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
            ]);

            if (factorsError) {
                throw factorsError;
            }

            if (aalError) {
                throw aalError;
            }

            setPasskeyFactors((factorsData?.webauthn ?? []) as PasskeyFactor[]);
            setCurrentAal((aalData?.currentLevel ?? null) as AALLevel);
            setNextAal((aalData?.nextLevel ?? null) as AALLevel);
        } catch (err) {
            console.error('loadPasskeyState error:', err);
            toast.error('Failed to load passkey settings');
        } finally {
            setLoadingPasskeys(false);
        }
    }, [supabase.auth.mfa]);

    useEffect(() => {
        void loadPasskeyState();
    }, [loadPasskeyState]);

    const handleRegisterPasskey = async () => {
        const friendlyName = passkeyName.trim() || DEFAULT_PASSKEY_NAME;

        try {
            setRegisteringPasskey(true);

            const { data, error } = await supabase.auth.mfa.webauthn.register({
                friendlyName,
            });

            if (error) {
                throw error;
            }

            if (!data) {
                throw new Error('Passkey registration did not complete.');
            }

            await emitSecurityNotification(`A new passkey was added to your account (${friendlyName}).`);
            toast.success('Passkey added successfully');
            setPasskeyName(DEFAULT_PASSKEY_NAME);
            await loadPasskeyState();
        } catch (err) {
            console.error('handleRegisterPasskey error:', err);
            toast.error(err instanceof Error ? err.message : 'Failed to register passkey');
        } finally {
            setRegisteringPasskey(false);
        }
    };

    const handleVerifyWithPasskey = async (factorId: string) => {
        try {
            setVerifyingPasskeyId(factorId);

            const { data, error } = await supabase.auth.mfa.webauthn.authenticate({
                factorId,
            });

            if (error) {
                throw error;
            }

            if (!data) {
                throw new Error('Passkey verification did not complete.');
            }

            await emitSecurityNotification('A passkey was used to verify this session.');
            toast.success('Session verified with passkey');
            await loadPasskeyState();
        } catch (err) {
            console.error('handleVerifyWithPasskey error:', err);
            toast.error(err instanceof Error ? err.message : 'Failed to verify with passkey');
        } finally {
            setVerifyingPasskeyId(null);
        }
    };

    const handleRemovePasskey = async (factorId: string) => {
        try {
            setRemovingPasskeyId(factorId);

            const { error } = await supabase.auth.mfa.unenroll({ factorId });
            if (error) {
                throw error;
            }

            await emitSecurityNotification('A passkey was removed from your account.');
            toast.success('Passkey removed');
            await loadPasskeyState();
        } catch (err) {
            console.error('handleRemovePasskey error:', err);
            toast.error(
                err instanceof Error
                    ? err.message
                    : 'Failed to remove passkey. Verify the session with a passkey first if required.'
            );
        } finally {
            setRemovingPasskeyId(null);
        }
    };

    const resolveAccountEmail = async (): Promise<string | null> => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) return user.email;

        const token = getAccessToken();
        if (!token) return null;
        const payload = decodeJwtPayload(token);
        if (payload.email) return payload.email;

        const userId = user?.id || payload.sub;
        if (!userId) return null;
        const { data: profileRow } = await supabase
            .from('profiles')
            .select('email')
            .eq('id', userId)
            .maybeSingle();
        return typeof profileRow?.email === 'string' && profileRow.email ? profileRow.email : null;
    };

    const handleUpdatePassword = async () => {
        if (!currentPassword) {
            toast.error('Please enter your current password');
            return;
        }

        if (!newPassword) {
            toast.error('Please enter a new password');
            return;
        }

        if (newPassword.length < MIN_PASSWORD_LENGTH) {
            toast.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
            return;
        }

        try {
            setUpdating(true);

            const email = await resolveAccountEmail();
            if (!email) {
                toast.error('No email associated with this account');
                return;
            }

            const { error: reauthError } = await supabase.auth.signInWithPassword({
                email,
                password: currentPassword
            });
            if (reauthError) {
                throw new Error('Current password is incorrect');
            }

            const { error } = await supabase.auth.updateUser({
                password: newPassword
            });

            if (error) throw error;

            await emitSecurityNotification('Your password was updated.');
            toast.success('Password updated successfully');
            setCurrentPassword('');
            setNewPassword('');
        } catch (err: unknown) {
            console.error('Error updating password:', err);
            toast.error(err instanceof Error ? err.message : 'Failed to update password');
        } finally {
            setUpdating(false);
        }
    };

    const handleResetByEmail = async () => {
        try {
            setSendingReset(true);

            const email = await resolveAccountEmail();
            if (!email) {
                toast.error('No email associated with this account');
                return;
            }

            const response = await fetch('/api/auth/password-reset', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email,
                }),
            });
            const result = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(typeof result?.error === 'string' ? result.error : 'Failed to send reset email');
            }

            await emitSecurityNotification('A password reset email was requested.');
            toast.success(
                typeof result?.message === 'string'
                    ? result.message
                    : 'If an account exists for that email, password reset instructions will be sent.'
            );
        } catch (err: unknown) {
            console.error('Error sending reset email:', err);
            toast.error(err instanceof Error ? err.message : 'Failed to send reset email');
        } finally {
            setSendingReset(false);
        }
    };

    return (
        <div>
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-2xl font-semibold text-gray-900">Password</h1>
            </div>

            {/* Password Form */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="p-6 space-y-6">
                    {/* Current Password */}
                    <div className="flex items-center gap-8">
                        <label className="text-gray-600 w-40 flex-shrink-0">
                            Current password
                        </label>
                        <input
                            type="password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            placeholder="Enter current password"
                            className="flex-1 px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-gray-50 placeholder:text-gray-400"
                        />
                    </div>

                    {/* Divider */}
                    <hr className="border-gray-100" />

                    {/* New Password */}
                    <div className="flex items-start gap-8">
                        <label className="text-gray-600 w-40 flex-shrink-0 pt-3">
                            New password
                        </label>
                        <div className="flex-1">
                            <input
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="Enter new password"
                                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-gray-50 placeholder:text-gray-400"
                            />
                            <p className="text-sm text-purple-600 mt-2">
                                Minimum of {MIN_PASSWORD_LENGTH} characters
                            </p>
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-end gap-4">
                    <button
                        onClick={handleResetByEmail}
                        disabled={sendingReset}
                        className="text-gray-600 hover:text-gray-800 font-medium transition-colors flex items-center gap-2"
                    >
                        {sendingReset && <Loader2 className="w-4 h-4 animate-spin" />}
                        Reset password by email
                    </button>
                    <button
                        onClick={handleUpdatePassword}
                        disabled={updating || !currentPassword || !newPassword}
                        className="px-6 py-2 bg-gray-200 text-gray-600 rounded-lg font-medium hover:bg-gray-300 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                        {updating && <Loader2 className="w-4 h-4 animate-spin" />}
                        Update password
                    </button>
                </div>
            </div>

            <div className="mt-6 rounded-xl border border-gray-200 bg-white overflow-hidden">
                <div className="border-b border-gray-100 px-6 py-5">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-2">
                                <KeyRound className="h-5 w-5 text-purple-600" />
                                <h2 className="text-lg font-semibold text-gray-900">Passkeys</h2>
                            </div>
                            <p className="mt-1 text-sm text-gray-600">
                                Add a passkey to verify your session with WebAuthn on this device or through your platform password manager.
                            </p>
                        </div>
                        <div className="rounded-lg bg-purple-50 px-3 py-2 text-sm text-purple-700">
                            Current session: <span className="font-medium uppercase">{currentAal ?? 'unknown'}</span>
                        </div>
                    </div>
                </div>

                <div className="px-6 py-5 space-y-6">
                    <div className="rounded-lg border border-purple-100 bg-purple-50/60 p-4 text-sm text-purple-800">
                        <div className="font-medium">How this works</div>
                        <p className="mt-1">
                            In this app, passkeys are currently used as a verified security factor for signed-in sessions. They strengthen account security and support step-up verification for sensitive actions.
                        </p>
                        <p className="mt-2">
                            Next available level for this session: <span className="font-medium uppercase">{nextAal ?? 'unknown'}</span>
                        </p>
                    </div>

                    <div className="flex flex-col gap-3 md:flex-row md:items-end">
                        <div className="flex-1">
                            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="passkey-name">
                                Passkey name
                            </label>
                            <input
                                id="passkey-name"
                                type="text"
                                value={passkeyName}
                                onChange={(e) => setPasskeyName(e.target.value)}
                                placeholder="Name this passkey"
                                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-purple-500"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={handleRegisterPasskey}
                            disabled={registeringPasskey || loadingPasskeys}
                            className="inline-flex items-center justify-center gap-2 rounded-lg bg-purple-600 px-5 py-3 font-medium text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {registeringPasskey && <Loader2 className="h-4 w-4 animate-spin" />}
                            Add passkey
                        </button>
                    </div>

                    <div>
                        <div className="mb-3 flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4 text-gray-500" />
                            <h3 className="text-sm font-medium text-gray-900">Registered passkeys</h3>
                        </div>

                        {loadingPasskeys ? (
                            <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-4 text-sm text-gray-600">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Loading passkeys...
                            </div>
                        ) : passkeyFactors.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-4 text-sm text-gray-600">
                                No passkeys registered yet.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {passkeyFactors.map((factor) => (
                                    <div
                                        key={factor.id}
                                        className="flex flex-col gap-3 rounded-lg border border-gray-200 px-4 py-4 md:flex-row md:items-center md:justify-between"
                                    >
                                        <div>
                                            <div className="font-medium text-gray-900">
                                                {factor.friendly_name || 'Unnamed passkey'}
                                            </div>
                                            <div className="mt-1 text-sm text-gray-600">
                                                Added {new Date(factor.created_at).toLocaleString()}
                                            </div>
                                            {factor.last_challenged_at && (
                                                <div className="mt-1 text-xs text-gray-500">
                                                    Last used {new Date(factor.last_challenged_at).toLocaleString()}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => void handleVerifyWithPasskey(factor.id)}
                                                disabled={verifyingPasskeyId === factor.id || removingPasskeyId === factor.id}
                                                className="inline-flex items-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-4 py-2 text-sm font-medium text-purple-700 transition-colors hover:bg-purple-100 disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                {verifyingPasskeyId === factor.id && <Loader2 className="h-4 w-4 animate-spin" />}
                                                Verify session
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => void handleRemovePasskey(factor.id)}
                                                disabled={removingPasskeyId === factor.id || verifyingPasskeyId === factor.id}
                                                className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                {removingPasskeyId === factor.id ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Trash2 className="h-4 w-4" />
                                                )}
                                                Remove
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Security Tips */}
            <div className="mt-6 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                <h3 className="font-medium text-purple-800 mb-2">Password security tips</h3>
                <ul className="text-sm text-purple-700 space-y-1 list-disc list-inside">
                    <li>Use a unique password that you do not use elsewhere</li>
                    <li>Use a long passphrase that is easy for you to remember and hard to guess</li>
                    <li>Avoid using personal information like names or birthdays</li>
                    <li>Use a password manager and add a passkey where supported</li>
                </ul>
            </div>
        </div>
    );
}
