'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { Loader2, ChevronDown } from 'lucide-react';
import type { AccessibilitySettings } from '@/lib/domain/settings/accessibility';
import { createSaveAccessibilityCommand } from '@/lib/domain/settings/accessibility';
import { getCurrentUserId } from '@/lib/infra/supabase/currentUser';
import { createAccessibilitySettingsRepository } from '@/lib/infra/settings/accessibilityRepository';

export default function AccessibilityPage() {
    const repository = useMemo(() => createAccessibilitySettingsRepository(), []);
    const saveAccessibility = useMemo(
        () => createSaveAccessibilityCommand(repository),
        [repository]
    );
    const [loading, setLoading] = useState(true);
    const [settings, setSettings] = useState<AccessibilitySettings>({
        keyboardShortcuts: true,
        autoDismissMessages: true,
        highContrastMode: 'system',
        reducedMotion: 'system'
    });

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            setLoading(true);
            const userIdResult = await getCurrentUserId();
            if (!userIdResult.ok) {
                console.error('Error loading settings:', userIdResult.error);
                return;
            }
            if (!userIdResult.value) return;

            const settingsResult = await repository.load(userIdResult.value);
            if (settingsResult.ok && settingsResult.value) {
                setSettings(settingsResult.value);
            }
        } catch (err) {
            console.error('Error loading settings:', err);
        } finally {
            setLoading(false);
        }
    };

    const updateSetting = async <K extends keyof AccessibilitySettings>(
        key: K,
        value: AccessibilitySettings[K]
    ) => {
        const newSettings = { ...settings, [key]: value };
        setSettings(newSettings);

        try {
            const userIdResult = await getCurrentUserId();
            if (!userIdResult.ok || !userIdResult.value) {
                if (!userIdResult.ok) console.warn('Could not save accessibility settings');
                return;
            }

            const result = await saveAccessibility(newSettings, { userId: userIdResult.value });
            if (!result.ok) console.warn('Could not save accessibility settings');
        } catch {
            console.warn('Could not save accessibility settings');
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
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-2xl font-semibold text-gray-900">Accessibility</h1>
            </div>

            {/* Settings Card */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
                {/* Keyboard Shortcuts */}
                <div className="px-6 py-5 flex items-center justify-between">
                    <div className="flex-1 pr-8">
                        <div className="font-medium text-gray-900">Keyboard shortcuts</div>
                        <div className="text-sm text-gray-500 mt-1">
                            Enables single-key shortcuts: C to create a post, R to restart a slideshow, and F to go fullscreen on a slideshow.
                        </div>
                    </div>
                    <button
                        onClick={() => updateSetting('keyboardShortcuts', !settings.keyboardShortcuts)}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
                            settings.keyboardShortcuts ? 'bg-purple-600' : 'bg-gray-200'
                        }`}
                    >
                        <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                settings.keyboardShortcuts ? 'translate-x-5' : 'translate-x-0'
                            }`}
                        />
                    </button>
                </div>

                {/* Auto Dismiss Messages */}
                <div className="px-6 py-5 flex items-center justify-between">
                    <div className="flex-1 pr-8">
                        <div className="font-medium text-gray-900">Automatically dismiss app messages</div>
                        <div className="text-sm text-gray-500 mt-1">
                            If enabled, confirmation and warning messages disappear automatically after a short delay. If disabled, you will have to click these messages to dismiss them manually.
                        </div>
                    </div>
                    <button
                        onClick={() => updateSetting('autoDismissMessages', !settings.autoDismissMessages)}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
                            settings.autoDismissMessages ? 'bg-purple-600' : 'bg-gray-200'
                        }`}
                    >
                        <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                settings.autoDismissMessages ? 'translate-x-5' : 'translate-x-0'
                            }`}
                        />
                    </button>
                </div>

                {/* High Contrast Mode */}
                <div className="px-6 py-5 flex items-center justify-between">
                    <div className="flex-1 pr-8">
                        <div className="font-medium text-gray-900">High contrast mode</div>
                        <div className="text-sm text-gray-500 mt-1">
                            Adjust contrast for better readability of text and buttons.
                        </div>
                    </div>
                    <div className="relative">
                        <select
                            value={settings.highContrastMode}
                            onChange={(e) => updateSetting('highContrastMode', e.target.value as 'system' | 'on' | 'off')}
                            className="appearance-none px-4 py-2 pr-10 border border-gray-200 rounded-lg text-gray-700 bg-gray-50 focus:ring-2 focus:ring-purple-500 focus:border-transparent cursor-pointer"
                        >
                            <option value="system">System</option>
                            <option value="on">On</option>
                            <option value="off">Off</option>
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                </div>

                {/* Reduced Motion */}
                <div className="px-6 py-5 flex items-center justify-between">
                    <div className="flex-1 pr-8">
                        <div className="font-medium text-gray-900">Reduced motion</div>
                        <div className="text-sm text-gray-500 mt-1">
                            Reduce animations and transitions throughout the app. GIFs will not be autoplayed.
                        </div>
                    </div>
                    <div className="relative">
                        <select
                            value={settings.reducedMotion}
                            onChange={(e) => updateSetting('reducedMotion', e.target.value as 'system' | 'on' | 'off')}
                            className="appearance-none px-4 py-2 pr-10 border border-gray-200 rounded-lg text-gray-700 bg-gray-50 focus:ring-2 focus:ring-purple-500 focus:border-transparent cursor-pointer"
                        >
                            <option value="system">System</option>
                            <option value="on">On</option>
                            <option value="off">Off</option>
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                </div>
            </div>
        </div>
    );
}
