'use client';

import React, { useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

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

        if (newPassword.length < 8) {
            toast.error('Password must be at least 8 characters');
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

            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/auth/callback?next=/dashboard/settings/password`
            });

            if (error) throw error;

            await emitSecurityNotification('A password reset email was requested.');
            toast.success('Password reset email sent! Check your inbox.');
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
                                Minimum of 8 characters
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

            {/* Security Tips */}
            <div className="mt-6 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                <h3 className="font-medium text-purple-800 mb-2">Password security tips</h3>
                <ul className="text-sm text-purple-700 space-y-1 list-disc list-inside">
                    <li>Use a unique password that you do not use elsewhere</li>
                    <li>Include a mix of uppercase, lowercase, numbers, and symbols</li>
                    <li>Avoid using personal information like names or birthdays</li>
                    <li>Consider using a password manager</li>
                </ul>
            </div>
        </div>
    );
}
