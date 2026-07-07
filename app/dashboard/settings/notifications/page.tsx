'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import type { NotificationCategory, NotificationSettingsData, TabType } from '@/lib/domain/settings/notifications';
import { createSaveNotificationsCommand } from '@/lib/domain/settings/notifications';
import { getCurrentUserId } from '@/lib/infra/supabase/currentUser';
import { createNotificationSettingsRepository } from '@/lib/infra/settings/notificationSettingsRepository';

const DEFAULT_NOTIFICATIONS: NotificationSettingsData = {
    general: [
        {
            title: 'Updates',
            settings: [
                { id: 'product_updates', label: 'Product updates', description: 'Updates about what has changed in CollabBoard.', push: false, email: false },
            ]
        },
        {
            title: 'Activity',
            settings: [
                { id: 'invitation_collaborate', label: 'Invitation to collaborate', description: 'You are invited to be a collaborator on a scene.', push: false, email: true },
                { id: 'comments_posts', label: 'Comments on your posts', description: 'A comment is added to a post you\'ve written.', push: true, email: false },
                { id: 'reactions_posts', label: 'Reactions on your posts', description: 'A reaction is added to a post you\'ve written.', push: false, email: false },
            ]
        }
    ],
    scenes: [
        {
            title: 'Scene notifications',
            settings: [
                { id: 'scene_new_post', label: 'New post', description: 'Someone adds a new post to a scene you follow.', push: true, email: false },
                { id: 'scene_new_comment', label: 'New comment', description: 'Someone comments on a scene you follow.', push: true, email: false },
                { id: 'scene_shared', label: 'Scene shared with you', description: 'A scene is shared with you directly.', push: true, email: true },
            ]
        }
    ],
    accounts: [
        {
            title: 'Account notifications',
            settings: [
                { id: 'security_alerts', label: 'Security alerts', description: 'Important security notifications about your account.', push: true, email: true },
                { id: 'login_new_device', label: 'Login from new device', description: 'Alert when your account is accessed from a new device.', push: true, email: true },
                { id: 'account_changes', label: 'Account changes', description: 'Notifications about changes to your account settings.', push: false, email: true },
            ]
        }
    ]
};

const cloneNotificationDefaults = (): NotificationSettingsData =>
    (Object.keys(DEFAULT_NOTIFICATIONS) as TabType[]).reduce((acc, tab) => {
        acc[tab] = DEFAULT_NOTIFICATIONS[tab].map((category) => ({
            title: category.title,
            settings: category.settings.map((setting) => ({ ...setting })),
        }));
        return acc;
    }, {} as NotificationSettingsData);

const mergeSavedNotifications = (savedSettings: unknown): NotificationSettingsData => {
    const merged = cloneNotificationDefaults();

    if (!savedSettings || typeof savedSettings !== 'object') {
        return merged;
    }

    const savedRecord = savedSettings as Record<string, unknown>;

    (Object.keys(merged) as TabType[]).forEach((tab) => {
        const savedTab = savedRecord[tab];
        if (!Array.isArray(savedTab)) return;

        merged[tab].forEach((category) => {
            category.settings.forEach((setting) => {
                for (const savedCategory of savedTab) {
                    const savedCategoryRecord = savedCategory as { settings?: unknown };
                    if (!Array.isArray(savedCategoryRecord.settings)) continue;

                    const matched = savedCategoryRecord.settings.find((savedSetting) => {
                        const savedSettingRecord = savedSetting as { id?: unknown };
                        return savedSettingRecord.id === setting.id;
                    }) as { push?: unknown; email?: unknown } | undefined;

                    if (matched) {
                        if (typeof matched.push === 'boolean') setting.push = matched.push;
                        if (typeof matched.email === 'boolean') setting.email = matched.email;
                        break;
                    }
                }
            });
        });
    });

    return merged;
};

const getAccessToken = (): string | null => {
    try {
        const lsKeys = Object.keys(localStorage).filter((k) => k.includes('auth-token'));
        for (const key of lsKeys) {
            const raw = localStorage.getItem(key);
            if (!raw) continue;
            const parsed = JSON.parse(raw);
            const token = Array.isArray(parsed) ? parsed[0]?.access_token : parsed?.access_token;
            if (token) return token;
        }
    } catch {
        // Ignore parse errors.
    }
    return null;
};

const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
};

export default function NotificationsPage() {
    const repository = useMemo(() => createNotificationSettingsRepository(), []);
    const saveNotifications = useMemo(
        () => createSaveNotificationsCommand(repository),
        [repository]
    );
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<TabType>('general');
    const [notifications, setNotifications] = useState<NotificationSettingsData>(
        () => cloneNotificationDefaults()
    );

    const registerPushIfNeeded = useCallback(async (state: NotificationSettingsData) => {
        const anyPushEnabled = (Object.keys(state) as TabType[]).some((tab) =>
            state[tab].some((category) => category.settings.some((setting) => setting.push))
        );
        if (!anyPushEnabled) return;

        if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
            return;
        }

        const publicVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!publicVapidKey) return;

        if (Notification.permission === 'default') {
            await Notification.requestPermission();
        }
        if (Notification.permission !== 'granted') return;

        const token = getAccessToken();
        if (!token) return;

        const registration = await navigator.serviceWorker.register('/push-sw.js');
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicVapidKey) as BufferSource,
            });
        }

        await fetch('/api/settings/notifications/push/subscribe', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ subscription }),
        });
    }, []);

    const loadSettings = useCallback(async () => {
        try {
            setLoading(true);
            const userIdResult = await getCurrentUserId();
            if (!userIdResult.ok) {
                console.error('Error loading settings:', userIdResult.error);
                return;
            }
            if (!userIdResult.value) return;

            // Try to load notification settings from database
            try {
                const settingsResult = await repository.load(userIdResult.value);

                if (settingsResult.ok && settingsResult.value) {
                    const merged = mergeSavedNotifications(settingsResult.value);
                    setNotifications(merged);
                    await registerPushIfNeeded(merged);
                }
            } catch {
                // Use defaults
            }
        } catch (err) {
            console.error('Error loading settings:', err);
        } finally {
            setLoading(false);
        }
    }, [repository, registerPushIfNeeded]);

    useEffect(() => {
        loadSettings();
    }, [loadSettings]);

    const toggleSetting = async (tab: TabType, categoryIndex: number, settingIndex: number, type: 'push' | 'email') => {
        const newNotifications = cloneNotificationDefaults();
        (Object.keys(notifications) as TabType[]).forEach((tabKey) => {
            newNotifications[tabKey] = notifications[tabKey].map((category) => ({
                title: category.title,
                settings: category.settings.map((setting) => ({ ...setting })),
            }));
        });

        const setting = newNotifications[tab][categoryIndex]?.settings[settingIndex];
        if (!setting) return;
        setting[type] = !setting[type];
        setNotifications(newNotifications);
        if (type === 'push') {
            await registerPushIfNeeded(newNotifications);
        }

        // Save to database
        try {
            const userIdResult = await getCurrentUserId();
            if (!userIdResult.ok || !userIdResult.value) return;

            const result = await saveNotifications(newNotifications, { userId: userIdResult.value });
            if (!result.ok) console.warn('Could not save notification settings');
        } catch {
            console.warn('Could not save notification settings');
        }
    };

    const tabs = [
        { id: 'general' as TabType, label: 'General' },
        { id: 'scenes' as TabType, label: 'Scenes' },
        { id: 'accounts' as TabType, label: 'Accounts' },
    ];

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
                <h1 className="text-2xl font-semibold text-gray-900">Notifications</h1>
            </div>

            {/* Tabs */}
            <div className="flex items-center gap-1 mb-6">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                            activeTab === tab.id
                                ? 'text-purple-700 bg-purple-50'
                                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Notification Settings */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {notifications[activeTab].map((category, catIndex) => (
                    <div key={category.title}>
                        {/* Category Header */}
                        <div className="px-6 py-4 flex items-center justify-between border-b border-gray-100">
                            <h3 className="font-semibold text-gray-900">{category.title}</h3>
                            <div className="flex items-center gap-8 text-sm text-gray-500">
                                <span className="w-12 text-center">Push</span>
                                <span className="w-12 text-center">Email</span>
                            </div>
                        </div>

                        {/* Settings */}
                        <div className="divide-y divide-gray-100">
                            {category.settings.map((setting, settingIndex) => (
                                <div key={setting.id} className="px-6 py-4 flex items-center justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-gray-900">{setting.label}</span>
                                            {setting.roleRestriction && (
                                                <span className="text-xs text-gray-400">{setting.roleRestriction}</span>
                                            )}
                                        </div>
                                        <p className="text-sm text-gray-500 mt-0.5">{setting.description}</p>
                                    </div>
                                    <div className="flex items-center gap-8">
                                        {/* Push Toggle */}
                                        <div className="w-12 flex justify-center">
                                            <input
                                                type="checkbox"
                                                checked={setting.push}
                                                onChange={() => toggleSetting(activeTab, catIndex, settingIndex, 'push')}
                                                className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500 cursor-pointer"
                                            />
                                        </div>
                                        {/* Email Toggle */}
                                        <div className="w-12 flex justify-center">
                                            <input
                                                type="checkbox"
                                                checked={setting.email}
                                                onChange={() => toggleSetting(activeTab, catIndex, settingIndex, 'email')}
                                                className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500 cursor-pointer"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
