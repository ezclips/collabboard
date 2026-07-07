'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import type { Library } from '@/lib/domain/settings/dashboard';
import { createSaveDashboardSettingsCommand } from '@/lib/domain/settings/dashboard';
import type { WorkspaceMembership } from '@/lib/domain/workspaces/memberships';
import { createDashboardSettingsRepository } from '@/lib/infra/settings/dashboardSettingsRepository';
import type { CurrentUser } from '@/lib/infra/supabase/currentUser';
import { getCurrentUser } from '@/lib/infra/supabase/currentUser';
import { createWorkspaceMembershipsRepository } from '@/lib/infra/workspaces/workspaceMembershipsRepository';

export default function DashboardSettingsPage() {
    const dashboardSettingsRepository = useMemo(() => createDashboardSettingsRepository(), []);
    const membershipsRepository = useMemo(() => createWorkspaceMembershipsRepository(), []);
    const saveDashboardSettings = useMemo(
        () => createSaveDashboardSettingsCommand(dashboardSettingsRepository),
        [dashboardSettingsRepository]
    );
    const [loading, setLoading] = useState(true);
    const [libraries, setLibraries] = useState<Library[]>([]);
    const [defaultWorkspace, setDefaultWorkspace] = useState<string>('');
    const [user, setUser] = useState<CurrentUser | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    const loadSettings = useCallback(async () => {
        try {
            setLoading(true);
            setLoadError(null);
            const userResult = await getCurrentUser();
            if (!userResult.ok) throw userResult.error;
            if (!userResult.value) {
                console.warn('[DashboardSettings] No authenticated user found');
                setLibraries([]);
                setDefaultWorkspace('');
                setLoadError('You are not authenticated. Please sign in again.');
                return;
            }
            const user = userResult.value;
            setUser(user);

            const username = user.email?.split('@')[0] || 'user';

            const membershipsResult = await membershipsRepository.listActiveByUserId(user.id);

            if (!membershipsResult.ok) {
                console.warn('[DashboardSettings] Failed to load workspace memberships:', membershipsResult.error);
            } else {
                console.log('[DashboardSettings] Membership rows loaded:', membershipsResult.value.length);
            }

            let effectiveMemberships = membershipsResult.ok ? membershipsResult.value : [];
            if (effectiveMemberships.length === 0 && user.email) {
                const emailMembershipsResult = await membershipsRepository.listActiveByEmail(
                    user.email.toLowerCase()
                );

                if (!emailMembershipsResult.ok) {
                    console.warn('[DashboardSettings] Email-based membership fallback failed:', emailMembershipsResult.error);
                } else {
                    effectiveMemberships = emailMembershipsResult.value;
                    console.log('[DashboardSettings] Email membership fallback rows loaded:', effectiveMemberships.length);
                }
            }

            const workspaceLibraries: Library[] = (effectiveMemberships as WorkspaceMembership[])
                .filter((row) => row.workspaces?.id)
                .map((row) => ({
                    id: row.workspaces!.id,
                    name: row.workspaces!.name || 'Workspace',
                    username: row.role || 'member',
                    type: 'workspace',
                    avatar_url: row.workspaces!.logo_url || undefined,
                    show: true
                }));

            const personalLibrary: Library = {
                id: user.id,
                name: user.displayName || username,
                username,
                type: 'personal',
                show: true
            };

            const defaultLibraries: Library[] = [personalLibrary, ...workspaceLibraries];
            console.log('[DashboardSettings] Effective libraries:', defaultLibraries.length);

            // Try to load dashboard settings
            const settingsResult = await dashboardSettingsRepository.load(user.id);
            if (settingsResult.ok && settingsResult.value) {
                    setDefaultWorkspace(settingsResult.value.defaultWorkspace || defaultLibraries[0]?.id || user.id);
                    if (settingsResult.value.libraries) {
                        const savedById = new Map((settingsResult.value.libraries as Library[]).map((lib) => [lib.id, lib]));
                        setLibraries(defaultLibraries.map((lib) => ({
                            ...lib,
                            show: savedById.get(lib.id)?.show ?? true
                        })));
                        return;
                    }
            }

            setLibraries(defaultLibraries);
            setDefaultWorkspace(defaultLibraries[0]?.id || user.id);
        } catch (err) {
            console.error('Error loading settings:', err);
            setLoadError('Could not load dashboard settings. Please refresh and try again.');
        } finally {
            setLoading(false);
        }
    }, [dashboardSettingsRepository, membershipsRepository]);

    useEffect(() => {
        void loadSettings();
    }, [loadSettings]);

    const toggleLibraryVisibility = async (libraryId: string) => {
        if (!user?.id) return;
        const newLibraries = libraries.map(lib => 
            lib.id === libraryId ? { ...lib, show: !lib.show } : lib
        );
        setLibraries(newLibraries);

        // Save to database
        try {
            const result = await saveDashboardSettings({
                libraries: newLibraries,
                defaultWorkspace,
            }, { userId: user.id });
            if (!result.ok) console.warn('Could not save dashboard settings');
        } catch {
            console.warn('Could not save dashboard settings');
        }
    };

    const handleDefaultWorkspaceChange = async (workspaceId: string) => {
        if (!user?.id) return;
        setDefaultWorkspace(workspaceId);
        
        try {
            const result = await saveDashboardSettings({
                libraries,
                defaultWorkspace: workspaceId,
            }, { userId: user.id });
            if (!result.ok) {
                console.warn('Could not save dashboard settings');
                return;
            }
            toast.success('Default workspace updated');
        } catch {
            console.warn('Could not save dashboard settings');
        }
    };

    const getInitials = (name: string) => {
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
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
                <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
            </div>

            {/* Libraries Section */}
            <div className="mb-8">
                <h2 className="text-sm font-semibold text-gray-900 mb-4">Libraries</h2>
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    {/* Header Row */}
                    <div className="px-6 py-3 flex items-center justify-end border-b border-gray-100">
                        <span className="text-sm text-gray-500">Show</span>
                    </div>

                    {/* Library Rows */}
                    {libraries.length === 0 ? (
                        <div className="px-6 py-5 text-sm text-gray-500">
                            {loadError || 'No libraries available yet.'}
                        </div>
                    ) : (
                        libraries.map((library) => (
                            <div 
                                key={library.id}
                                className="px-6 py-4 flex items-center justify-between border-b border-gray-100 last:border-b-0"
                            >
                                <div className="flex items-center gap-3">
                                    {/* Avatar */}
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-white font-bold">
                                        {getInitials(library.name)}
                                    </div>
                                    
                                    {/* Info */}
                                    <div>
                                        <div className="font-medium text-gray-900">{library.name}</div>
                                        <div className="text-sm text-gray-500">{library.username}</div>
                                    </div>

                                    {/* Type Badge */}
                                    <span className="px-2 py-1 text-xs font-medium text-gray-500 bg-gray-100 rounded">
                                        {library.type === 'personal' ? 'Personal' : 'Workspace'}
                                    </span>
                                </div>

                                {/* Show Toggle */}
                                <button
                                    onClick={() => toggleLibraryVisibility(library.id)}
                                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                                        library.show
                                            ? 'bg-purple-600 border-purple-600'
                                            : 'bg-white border-gray-300 hover:border-gray-400'
                                    }`}
                                >
                                    {library.show && <Check className="w-4 h-4 text-white" />}
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Default Workspace Section */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 flex items-center justify-between">
                    <div>
                        <div className="font-medium text-gray-900">Default workspace</div>
                        <div className="text-sm text-gray-500">
                            The default workspace when visiting the dashboard and creating new scenes.
                        </div>
                    </div>
                    <div className="text-right">
                        <select
                            value={defaultWorkspace}
                            onChange={(e) => handleDefaultWorkspaceChange(e.target.value)}
                            disabled={libraries.length === 0}
                            className="px-4 py-2 border border-gray-200 rounded-lg text-gray-900 bg-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        >
                            {libraries.length === 0 && (
                                <option value="">No libraries available</option>
                            )}
                            {libraries.map((library) => (
                                <option key={library.id} value={library.id}>
                                    {library.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>
        </div>
    );
}
