'use client';

import React, { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { 
    Sun, 
    Moon, 
    Monitor,
    Bell,
    Mail,
    Smartphone,
    Globe,
    Loader2,
    Check
} from 'lucide-react';
import { toast } from 'sonner';

interface Preferences {
    theme: 'light' | 'dark' | 'system';
    language: string;
    notifications: {
        email: boolean;
        push: boolean;
        boardInvites: boolean;
        comments: boolean;
        updates: boolean;
        marketing: boolean;
    };
    emailFrequency: 'immediate' | 'daily' | 'weekly' | 'never';
}

export default function PreferencesPage() {
    const supabase = createClientComponentClient();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [preferences, setPreferences] = useState<Preferences>({
        theme: 'system',
        language: 'en',
        notifications: {
            email: true,
            push: false,
            boardInvites: true,
            comments: true,
            updates: true,
            marketing: false
        },
        emailFrequency: 'daily'
    });

    const themes = [
        { id: 'light', name: 'Light', icon: Sun },
        { id: 'dark', name: 'Dark', icon: Moon },
        { id: 'system', name: 'System', icon: Monitor }
    ];

    const languages = [
        { code: 'en', name: 'English' },
        { code: 'es', name: 'Español' },
        { code: 'fr', name: 'Français' },
        { code: 'de', name: 'Deutsch' },
        { code: 'it', name: 'Italiano' },
        { code: 'pt', name: 'Português' },
        { code: 'zh', name: '中文' },
        { code: 'ja', name: '日本語' },
        { code: 'ko', name: '한국어' }
    ];

    const notificationSettings = [
        { key: 'boardInvites', label: 'Board invitations', description: 'When someone invites you to a board' },
        { key: 'comments', label: 'Comments', description: 'When someone comments on your content' },
        { key: 'updates', label: 'Board updates', description: 'When content is added to boards you follow' },
        { key: 'marketing', label: 'Product updates', description: 'News about features and updates' }
    ];

    useEffect(() => {
        loadPreferences();
    }, []);

    const loadPreferences = async () => {
        try {
            setLoading(true);
            // In a real app, load from database
        } catch (err) {
            console.error('Error loading preferences:', err);
        } finally {
            setLoading(false);
        }
    };

    const savePreferences = async () => {
        try {
            setSaving(true);
            // In a real app, save to database
            await new Promise(resolve => setTimeout(resolve, 500));
            toast.success('Preferences saved');
        } catch (err) {
            console.error('Error saving preferences:', err);
            toast.error('Failed to save preferences');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
        );
    }

    return (
        <div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-8">Preferences</h1>

            {/* Theme */}
            <section className="mb-8">
                <h2 className="text-lg font-medium text-purple-600 mb-4">Appearance</h2>
                <div className="grid grid-cols-3 gap-4 max-w-md">
                    {themes.map((theme) => {
                        const Icon = theme.icon;
                        const isSelected = preferences.theme === theme.id;
                        return (
                            <button
                                key={theme.id}
                                onClick={() => setPreferences(prev => ({ ...prev, theme: theme.id as any }))}
                                className={`p-4 rounded-lg border-2 text-center transition-all ${
                                    isSelected
                                        ? 'border-purple-600 bg-purple-50'
                                        : 'border-gray-200 hover:border-gray-300 bg-white'
                                }`}
                            >
                                <Icon className={`w-6 h-6 mx-auto mb-2 ${isSelected ? 'text-purple-600' : 'text-gray-400'}`} />
                                <span className={`text-sm font-medium ${isSelected ? 'text-purple-600' : 'text-gray-700'}`}>
                                    {theme.name}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </section>

            <hr className="my-8 border-gray-200" />

            {/* Language */}
            <section className="mb-8">
                <h2 className="text-lg font-medium text-purple-600 mb-4">Language</h2>
                <div className="max-w-md">
                    <div className="flex items-center gap-2 mb-2">
                        <Globe className="w-4 h-4 text-gray-400" />
                        <label className="text-sm font-medium text-gray-700">Display language</label>
                    </div>
                    <select
                        value={preferences.language}
                        onChange={(e) => setPreferences(prev => ({ ...prev, language: e.target.value }))}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    >
                        {languages.map(lang => (
                            <option key={lang.code} value={lang.code}>{lang.name}</option>
                        ))}
                    </select>
                </div>
            </section>

            <hr className="my-8 border-gray-200" />

            {/* Notification Channels */}
            <section className="mb-8">
                <h2 className="text-lg font-medium text-purple-600 mb-4">Notification Channels</h2>
                <div className="space-y-4 max-w-lg">
                    <label className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50">
                        <div className="flex items-center gap-3">
                            <Mail className="w-5 h-5 text-gray-400" />
                            <div>
                                <div className="font-medium text-gray-900">Email notifications</div>
                                <div className="text-sm text-gray-500">Receive notifications via email</div>
                            </div>
                        </div>
                        <input
                            type="checkbox"
                            checked={preferences.notifications.email}
                            onChange={(e) => setPreferences(prev => ({
                                ...prev,
                                notifications: { ...prev.notifications, email: e.target.checked }
                            }))}
                            className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                        />
                    </label>

                    <label className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-50">
                        <div className="flex items-center gap-3">
                            <Smartphone className="w-5 h-5 text-gray-400" />
                            <div>
                                <div className="font-medium text-gray-900">Push notifications</div>
                                <div className="text-sm text-gray-500">Receive browser push notifications</div>
                            </div>
                        </div>
                        <input
                            type="checkbox"
                            checked={preferences.notifications.push}
                            onChange={(e) => setPreferences(prev => ({
                                ...prev,
                                notifications: { ...prev.notifications, push: e.target.checked }
                            }))}
                            className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                        />
                    </label>
                </div>
            </section>

            <hr className="my-8 border-gray-200" />

            {/* Notification Types */}
            <section className="mb-8">
                <h2 className="text-lg font-medium text-purple-600 mb-4">Notification Types</h2>
                <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-200 max-w-lg">
                    {notificationSettings.map((setting) => (
                        <label key={setting.key} className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50">
                            <div>
                                <div className="font-medium text-gray-900">{setting.label}</div>
                                <div className="text-sm text-gray-500">{setting.description}</div>
                            </div>
                            <input
                                type="checkbox"
                                checked={preferences.notifications[setting.key as keyof typeof preferences.notifications]}
                                onChange={(e) => setPreferences(prev => ({
                                    ...prev,
                                    notifications: {
                                        ...prev.notifications,
                                        [setting.key]: e.target.checked
                                    }
                                }))}
                                className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                            />
                        </label>
                    ))}
                </div>
            </section>

            <hr className="my-8 border-gray-200" />

            {/* Email Frequency */}
            <section className="mb-8">
                <h2 className="text-lg font-medium text-purple-600 mb-4">Email Digest Frequency</h2>
                <div className="max-w-md">
                    <p className="text-sm text-gray-500 mb-3">
                        How often would you like to receive email digests?
                    </p>
                    <div className="space-y-2">
                        {[
                            { id: 'immediate', label: 'Send immediately' },
                            { id: 'daily', label: 'Daily digest' },
                            { id: 'weekly', label: 'Weekly digest' },
                            { id: 'never', label: 'Never' }
                        ].map((option) => (
                            <label key={option.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer">
                                <input
                                    type="radio"
                                    name="emailFrequency"
                                    checked={preferences.emailFrequency === option.id}
                                    onChange={() => setPreferences(prev => ({ ...prev, emailFrequency: option.id as any }))}
                                    className="w-4 h-4 border-gray-300 text-purple-600 focus:ring-purple-500"
                                />
                                <span className="text-gray-700">{option.label}</span>
                            </label>
                        ))}
                    </div>
                </div>
            </section>

            {/* Save Button */}
            <div className="flex justify-end pt-4 border-t border-gray-200">
                <button
                    onClick={savePreferences}
                    disabled={saving}
                    className="px-6 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    Save Preferences
                </button>
            </div>
        </div>
    );
}
