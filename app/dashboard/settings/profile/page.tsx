'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
    Loader2,
    Pencil,
    X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { AuthUser } from '@/lib/domain/auth/user';
import { asUserId } from '@/lib/domain/core/ids';
import { createSaveProfilePatchCommand } from '@/lib/domain/profile/profile';
import { createLegacyProfilesRepository } from '@/lib/infra/profile/profilesRepository';
import {
    createLegacyTokenStorageGateway,
    decodeJwtPayload,
    getAccessToken,
    legacyReauthenticateWithPassword,
    legacyRequestEmailChange,
} from '@/lib/infra/supabase/legacyToken';

interface Profile {
    id: string;
    display_name: string;
    email: string;
    username: string;
    about: string;
    class_info: string;
    language: string;
    account_type: string;
    avatar_url: string | null;
    beta_features: boolean;
}

const LANGUAGES = [
    { code: 'en-US', label: 'English (US)' },
    { code: 'en-GB', label: 'English (UK)' },
    { code: 'es', label: 'Español' },
    { code: 'fr', label: 'Français' },
    { code: 'de', label: 'Deutsch' },
    { code: 'it', label: 'Italiano' },
    { code: 'pt', label: 'Português' },
    { code: 'ja', label: '日本語' },
    { code: 'zh', label: '中文' },
    { code: 'ko', label: '한국어' },
];

const ACCOUNT_TYPES = [
    'Individual',
    'Teacher',
    'Student',
    'School Staff',
    'Business',
    'Other'
];
const FORCE_REAUTH_EMAIL_CHANGE = process.env.NEXT_PUBLIC_FORCE_REAUTH_EMAIL_CHANGE === 'true';
const STRICT_MFA = process.env.NEXT_PUBLIC_STRICT_MFA === 'true';

const getErrorMessage = (err: unknown, fallback = 'Failed to save'): string => {
    if (err instanceof Error && err.message) return err.message;
    if (typeof err === 'string' && err.trim()) return err;
    if (err && typeof err === 'object') {
        const maybe = err as Record<string, unknown>;
        const parts = [
            maybe.message,
            maybe.error_description,
            maybe.details,
            maybe.hint
        ].filter((part): part is string => typeof part === 'string' && part.trim().length > 0);
        if (parts.length > 0) return parts.join(' | ');
        try {
            return JSON.stringify(err);
        } catch {
            return fallback;
        }
    }
    return fallback;
};

const emitNotificationEvent = async (
    eventId: 'account_changes' | 'security_alerts',
    context: Record<string, unknown> = {}
) => {
    const token = getAccessToken();
    if (!token) return;

    try {
        await fetch('/api/settings/notifications/emit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ eventId, context }),
        });
    } catch {
        // Never block UI settings save on notification emit failure.
    }
};

export default function BasicInfoPage() {
    const router = useRouter();
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    const [loading, setLoading] = useState(true);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [user, setUser] = useState<AuthUser | null>(null);
    const [profile, setProfile] = useState<Profile>({
        id: '',
        display_name: '',
        email: '',
        username: '',
        about: '',
        class_info: '',
        language: 'en-US',
        account_type: 'Individual',
        avatar_url: null,
        beta_features: false
    });

    // Edit states for each field
    const [editingField, setEditingField] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const [saving, setSaving] = useState(false);
    const [showEmailModal, setShowEmailModal] = useState(false);
    const [newEmail, setNewEmail] = useState('');
    const [currentEmailForEmailChange, setCurrentEmailForEmailChange] = useState('');
    const [currentPasswordForEmail, setCurrentPasswordForEmail] = useState('');
    const [updatingEmail, setUpdatingEmail] = useState(false);
    const [pendingEmailChange, setPendingEmailChange] = useState<string | null>(null);

    useEffect(() => {
        loadProfile();
    }, []);

    const loadProfile = async () => {
        try {
            setLoading(true);

            const token = getAccessToken();
            if (!token) {
                toast.error('Not authenticated — please log in again');
                return;
            }

            // Decode JWT to get user id + email without a network round-trip
            const payload = decodeJwtPayload(token);
            const userId: string = payload.sub || '';
            const userEmail: string = payload.email || '';
            if (!userId) {
                throw new Error('Session is invalid. Please sign in again.');
            }
            setUser({ id: userId, email: userEmail } as AuthUser);

            const repository = createLegacyProfilesRepository(token);
            const profileResult = await repository.findById(asUserId(userId));
            // PATCH-018: legacy toast preserved - the raw supabase error travels as
            // the DomainError cause; message/code interpolation stays byte-identical.
            if (!profileResult.ok) {
                const cause = profileResult.error.cause as { message?: string; code?: string } | undefined;
                console.error('profiles SELECT error:', cause);
                toast.error(`Profile load failed: ${cause?.message} (${cause?.code})`);
            }
            const profileData = profileResult.ok ? profileResult.value : null;

            if (profileData) {
                setProfile({
                    id: profileData.id,
                    display_name: profileData.display_name || (payload.user_metadata?.display_name as string | undefined) || '',
                    email: userEmail,
                    username: profileData.username || userEmail.split('@')[0] || '',
                    about: profileData.about || '',
                    class_info: profileData.class_info || '',
                    language: profileData.language || 'en-US',
                    account_type: profileData.account_type || 'Individual',
                    avatar_url: profileData.avatar_url,
                    beta_features: profileData.beta_features || false
                });
            } else {
                // No row yet - set defaults from JWT metadata
                setProfile(prev => ({
                    ...prev,
                    id: userId,
                    display_name: String(payload.user_metadata?.display_name || userEmail.split('@')[0] || ''),
                    email: userEmail,
                    username: userEmail.split('@')[0] || ''
                }));
            }
        } catch (err) {
            console.error('Error loading profile:', err);
            toast.error('Failed to load profile');
        } finally {
            setLoading(false);
        }
    };

    const startEditing = (field: string, currentValue: string) => {
        setEditingField(field);
        setEditValue(currentValue);
    };

    const cancelEditing = () => {
        setEditingField(null);
        setEditValue('');
    };

    const persistProfilePatch = async (patch: Record<string, unknown>) => {
        const token = getAccessToken();
        if (!token) throw new Error('Not authenticated');

        const jwtPayload = decodeJwtPayload(token);
        const userId = user?.id || jwtPayload.sub || '';
        if (!userId) throw new Error('Session is invalid. Please sign in again.');

        const explicitPatchEmail = typeof patch.email === 'string' ? patch.email.trim() : '';
        const email = explicitPatchEmail || user?.email || profile.email || jwtPayload.email || '';
        if (!email) throw new Error('Missing account email in session. Please sign in again.');

        const saveProfilePatch = createSaveProfilePatchCommand(
            createLegacyProfilesRepository(token),
        );
        const result = await saveProfilePatch({ email, patch }, { userId: asUserId(userId) });
        // PATCH-018: rethrow the RAW supabase error (the DomainError cause) so
        // getErrorMessage and every save toast stay byte-identical.
        if (!result.ok) throw (result.error.cause ?? result.error);
    };

    const saveField = async (field: string, value: string) => {
        
        try {
            setSaving(true);

            await persistProfilePatch({ [field]: value });

            setProfile(prev => ({ ...prev, [field]: value }));
            await emitNotificationEvent('account_changes', {
                action: 'profile_field_updated',
                field,
                workspaceLink: `${window.location.origin}/dashboard/settings/profile`,
            });
            toast.success('Updated successfully');
            setEditingField(null);
            setEditValue('');
        } catch (err) {
            const message = getErrorMessage(err, 'Failed to save');
            console.error('Error saving profile field:', { field, value, err, message });
            toast.error(message);
        } finally {
            setSaving(false);
        }
    };

    const openEmailModal = () => {
        setNewEmail(profile.email || '');
        setCurrentEmailForEmailChange((profile.email || user?.email || '').trim());
        setCurrentPasswordForEmail('');
        setShowEmailModal(true);
    };

    const handleRequestEmailChange = async () => {
        const normalizedNewEmail = newEmail.trim().toLowerCase();
        const normalizedCurrentEmail = currentEmailForEmailChange.trim().toLowerCase();
        if (!normalizedNewEmail) {
            toast.error('Please enter a new email address');
            return;
        }
        if (FORCE_REAUTH_EMAIL_CHANGE) {
            if (!normalizedCurrentEmail) {
                toast.error('Please enter your current account email');
                return;
            }
            if (!currentPasswordForEmail) {
                toast.error('Please enter your current password');
                return;
            }
        }

        try {
            setUpdatingEmail(true);
            if (normalizedCurrentEmail && normalizedNewEmail === normalizedCurrentEmail) {
                throw new Error('Please enter a different email address');
            }

            const token = getAccessToken();
            if (!token) {
                throw new Error('Your session expired. Please sign in again and retry.');
            }

            if (FORCE_REAUTH_EMAIL_CHANGE) {
                const { error: reauthError } = await legacyReauthenticateWithPassword(
                    token,
                    normalizedCurrentEmail,
                    currentPasswordForEmail,
                );
                if (reauthError) {
                    throw new Error('Current email/password is incorrect');
                }
            }

            const { error: updateError } = await legacyRequestEmailChange(
                token,
                normalizedNewEmail,
                `${window.location.origin}/auth/callback?next=/dashboard/settings/profile`,
            );
            if (updateError) {
                throw updateError;
            }

            setPendingEmailChange(normalizedNewEmail);
            setShowEmailModal(false);
            setCurrentPasswordForEmail('');
            await emitNotificationEvent('account_changes', {
                action: 'email_change_requested',
                workspaceLink: `${window.location.origin}/dashboard/settings/profile`,
            });
            toast.success('Verification email sent. Confirm the new email to finish the change.');
        } catch (err) {
            console.error('Error requesting email change:', err);
            const message = err instanceof Error ? err.message : 'Failed to request email change';
            toast.error(message);
            if (message.toLowerCase().includes('session')) {
                setTimeout(() => {
                    router.push('/auth?redirect=/dashboard/settings/profile');
                }, 400);
            }
        } finally {
            setUpdatingEmail(false);
        }
    };

    const handleAvatarClick = () => {
        fileInputRef.current?.click();
    };

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            toast.error('Please upload an image file');
            return;
        }

        if (file.size > 2 * 1024 * 1024) {
            toast.error('Image must be less than 2MB');
            return;
        }

        try {
            setUploadingAvatar(true);

            const token = getAccessToken();
            if (!token) throw new Error('Not authenticated');
            const userId = user?.id || decodeJwtPayload(token).sub;
            if (!userId) throw new Error('Session is invalid. Please sign in again.');
            const storage = createLegacyTokenStorageGateway(token);

            const fileExt = file.name.split('.').pop();
            const fileName = `avatar_${userId}_${Date.now()}.${fileExt}`;
            const filePath = `avatars/${fileName}`;

            const uploadResult = await storage.upload('avatars', filePath, file, { upsert: true });
            if (!uploadResult.ok) throw uploadResult.error;
            const publicUrl = storage.getPublicUrl('avatars', filePath);

            await persistProfilePatch({ avatar_url: publicUrl });

            setProfile(prev => ({ ...prev, avatar_url: publicUrl }));
            toast.success('Avatar uploaded successfully');
        } catch (err) {
            console.error('Error uploading avatar:', err);
            toast.error('Failed to upload avatar');
        } finally {
            setUploadingAvatar(false);
        }
    };

    const toggleBetaFeatures = async () => {
        const newValue = !profile.beta_features;
        
        try {
            await persistProfilePatch({ beta_features: newValue });
            setProfile(prev => ({ ...prev, beta_features: newValue }));
            await emitNotificationEvent('account_changes', {
                action: 'beta_features_toggled',
                enabled: newValue,
                workspaceLink: `${window.location.origin}/dashboard/settings/profile`,
            });
            toast.success(newValue ? 'Beta features enabled' : 'Beta features disabled');
        } catch (err) {
            const message = getErrorMessage(err, 'Failed to save beta features setting');
            console.warn('Could not save beta features preference', { err, message });
            toast.error(message);
        }
    };

    const getInitials = () => {
        if (profile.display_name) {
            return profile.display_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        }
        return profile.email?.slice(0, 2)?.toUpperCase() || 'U';
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
        );
    }

    const renderField = (
        label: string,
        field: keyof Profile,
        value: string,
        placeholder?: string,
        isSelect?: boolean,
        options?: { value: string; label: string }[]
    ) => {
        const isEditing = editingField === field;

        return (
            <div
                className={`flex items-center justify-between py-4 border-b border-gray-100 ${!isEditing ? 'cursor-pointer' : ''}`}
                onClick={() => {
                    if (!isEditing) startEditing(field, value);
                }}
            >
                <div className="text-gray-600 w-32 flex-shrink-0">{label}</div>
                <div className="flex-1 flex items-center justify-between">
                    {isEditing ? (
                        <div className="flex items-center gap-2 flex-1">
                            {isSelect && options ? (
                                <select
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                    autoFocus
                                >
                                    {options.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            ) : (
                                <input
                                    type="text"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    placeholder={placeholder}
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                    autoFocus
                                />
                            )}
                            <button
                                onClick={() => saveField(field, editValue)}
                                disabled={saving}
                                className="px-3 py-1.5 text-sm font-medium text-purple-600 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition-colors disabled:opacity-50"
                            >
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
                            </button>
                            <button
                                onClick={cancelEditing}
                                className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <div className="flex-1 flex items-center justify-between">
                            <span className={value ? 'text-gray-900' : 'text-gray-400'}>
                                {value || placeholder || 'Not set'}
                            </span>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    startEditing(field, value);
                                }}
                                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                <Pencil className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div>
            {/* Header */}
            <div className="mb-2">
                <p className="text-sm text-purple-600">Personal account</p>
                <h1 className="text-2xl font-semibold text-gray-900">Basic info</h1>
            </div>
            <div className="mt-4 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
                <div className="font-medium text-gray-900">Security mode</div>
                <div className="mt-1">
                    Email change re-auth: <span className={FORCE_REAUTH_EMAIL_CHANGE ? 'text-green-700' : 'text-amber-700'}>{FORCE_REAUTH_EMAIL_CHANGE ? 'enabled' : 'disabled'}</span>
                </div>
                <div>
                    Strict MFA mode: <span className={STRICT_MFA ? 'text-green-700' : 'text-amber-700'}>{STRICT_MFA ? 'enabled' : 'disabled'}</span>
                </div>
            </div>
            {pendingEmailChange && (
                <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                    Verification pending for <span className="font-medium">{pendingEmailChange}</span>. Check your inbox to confirm.
                </div>
            )}

            {/* Info Card */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mt-6">
                {/* Avatar Row */}
                <div
                    className="flex items-center justify-between py-4 px-6 border-b border-gray-100 cursor-pointer"
                    onClick={handleAvatarClick}
                >
                    <div className="text-gray-600 w-32 flex-shrink-0">Avatar</div>
                    <div className="flex-1 flex items-center justify-between">
                        <div 
                            className="relative group cursor-pointer"
                            onClick={handleAvatarClick}
                        >
                            {profile.avatar_url ? (
                                <img
                                    src={profile.avatar_url}
                                    alt={profile.display_name}
                                    className="w-14 h-14 rounded-full object-cover border-2 border-gray-200"
                                />
                            ) : (
                                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-white text-xl font-bold">
                                    {getInitials()}
                                </div>
                            )}
                            
                            {uploadingAvatar && (
                                <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                                </div>
                            )}
                            
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handleAvatarUpload}
                                className="hidden"
                            />
                        </div>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleAvatarClick();
                            }}
                            disabled={uploadingAvatar}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            <Pencil className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Other Fields */}
                <div className="px-6">
                    {renderField('Name', 'display_name', profile.display_name)}
                    
                    {/* Email - not directly editable */}
                    <div
                        className="flex items-center justify-between py-4 border-b border-gray-100 cursor-pointer"
                        onClick={openEmailModal}
                    >
                        <div className="text-gray-600 w-32 flex-shrink-0">Email</div>
                        <div className="flex-1 flex items-center justify-between">
                            <span className="text-gray-900">{profile.email}</span>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    openEmailModal();
                                }}
                                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                <Pencil className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {renderField('Username', 'username', profile.username, 'collabboard.com/yourusername')}
                    {renderField('About', 'about', profile.about, 'Write a bit about yourself for the world to know. E.g. Dog lover. Professional unicyclist.')}
                    {renderField('Class info', 'class_info', profile.class_info, 'eg. 4th grade, 9-11th grade US History, 7B, ESL for adult learners')}
                    
                    {/* Language - dropdown */}
                    <div
                        className={`flex items-center justify-between py-4 border-b border-gray-100 ${editingField !== 'language' ? 'cursor-pointer' : ''}`}
                        onClick={() => {
                            if (editingField !== 'language') startEditing('language', profile.language);
                        }}
                    >
                        <div className="text-gray-600 w-32 flex-shrink-0">Language</div>
                        <div className="flex-1 flex items-center justify-between">
                            {editingField === 'language' ? (
                                <div className="flex items-center gap-2 flex-1">
                                    <select
                                        value={editValue}
                                        onChange={(e) => setEditValue(e.target.value)}
                                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                        autoFocus
                                    >
                                        {LANGUAGES.map(lang => (
                                            <option key={lang.code} value={lang.code}>{lang.label}</option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={() => saveField('language', editValue)}
                                        disabled={saving}
                                        className="px-3 py-1.5 text-sm font-medium text-purple-600 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition-colors disabled:opacity-50"
                                    >
                                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
                                    </button>
                                    <button
                                        onClick={cancelEditing}
                                        className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : (
                                <div className="flex-1 flex items-center justify-between">
                                    <span className="text-gray-900">
                                        {LANGUAGES.find(l => l.code === profile.language)?.label || 'English (US)'}
                                    </span>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            startEditing('language', profile.language);
                                        }}
                                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                    >
                                        <Pencil className="w-4 h-4" />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Account Type - dropdown */}
                    <div
                        className={`flex items-center justify-between py-4 border-b border-gray-100 ${editingField !== 'account_type' ? 'cursor-pointer' : ''}`}
                        onClick={() => {
                            if (editingField !== 'account_type') startEditing('account_type', profile.account_type);
                        }}
                    >
                        <div className="text-gray-600 w-32 flex-shrink-0">Account type</div>
                        <div className="flex-1 flex items-center justify-between">
                            {editingField === 'account_type' ? (
                                <div className="flex items-center gap-2 flex-1">
                                    <select
                                        value={editValue}
                                        onChange={(e) => setEditValue(e.target.value)}
                                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                        autoFocus
                                    >
                                        {ACCOUNT_TYPES.map(type => (
                                            <option key={type} value={type}>{type}</option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={() => saveField('account_type', editValue)}
                                        disabled={saving}
                                        className="px-3 py-1.5 text-sm font-medium text-purple-600 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition-colors disabled:opacity-50"
                                    >
                                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
                                    </button>
                                    <button
                                        onClick={cancelEditing}
                                        className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg transition-colors"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : (
                                <div className="flex-1 flex items-center justify-between">
                                    <span className="text-gray-900">{profile.account_type}</span>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            startEditing('account_type', profile.account_type);
                                        }}
                                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                    >
                                        <Pencil className="w-4 h-4" />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Beta Features - toggle */}
                    <div className="flex items-center justify-between py-4">
                        <div className="text-gray-600 w-32 flex-shrink-0">Beta features</div>
                        <div className="flex-1 flex items-center justify-between">
                            <span className="text-gray-500 text-sm">
                                Enable early access to new features
                            </span>
                            <button
                                onClick={toggleBetaFeatures}
                                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
                                    profile.beta_features ? 'bg-purple-600' : 'bg-gray-200'
                                }`}
                            >
                                <span
                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                        profile.beta_features ? 'translate-x-5' : 'translate-x-0'
                                    }`}
                                />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {showEmailModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="text-xl font-semibold text-gray-900">Change email</h2>
                            <button
                                type="button"
                                onClick={() => setShowEmailModal(false)}
                                className="rounded-lg p-1 text-gray-500 transition-colors hover:bg-gray-100"
                                aria-label="Close change email dialog"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="mb-1 block text-sm font-medium text-gray-700">New email</label>
                                <input
                                    type="email"
                                    value={newEmail}
                                    onChange={(e) => setNewEmail(e.target.value)}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-purple-500"
                                    placeholder="name@example.com"
                                />
                            </div>
                            {FORCE_REAUTH_EMAIL_CHANGE && (
                                <>
                                    <div>
                                        <label className="mb-1 block text-sm font-medium text-gray-700">Current account email</label>
                                        <input
                                            type="email"
                                            value={currentEmailForEmailChange}
                                            onChange={(e) => setCurrentEmailForEmailChange(e.target.value)}
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-purple-500"
                                            placeholder="Current login email"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-sm font-medium text-gray-700">Current password</label>
                                        <input
                                            type="password"
                                            value={currentPasswordForEmail}
                                            onChange={(e) => setCurrentPasswordForEmail(e.target.value)}
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-purple-500"
                                            placeholder="Enter your current password"
                                        />
                                    </div>
                                </>
                            )}
                            <p className="text-sm text-gray-500">
                                {FORCE_REAUTH_EMAIL_CHANGE
                                    ? 'For security, we verify your password and then send a confirmation link to the new email.'
                                    : 'A confirmation link will be sent to the new email. Your current login remains valid until the new email is verified.'}
                            </p>
                            {STRICT_MFA && (
                                <p className="text-sm text-amber-700">
                                    Strict security mode is enabled for this environment.
                                </p>
                            )}
                        </div>

                        <div className="mt-6 flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setShowEmailModal(false)}
                                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleRequestEmailChange}
                                disabled={updatingEmail}
                                className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                            >
                                {updatingEmail && <Loader2 className="h-4 w-4 animate-spin" />}
                                Send verification
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
