'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { User } from '@supabase/supabase-js';
import { Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';

interface Library {
    id: string;
    name: string;
    username: string;
    type: 'personal' | 'workspace';
    avatar_url?: string;
    show: boolean;
}

interface WorkspaceRow {
    workspace_id: string;
    role: string;
    workspaces: {
        id: string;
        name: string;
        logo_url: string | null;
    } | null;
}

export default function DashboardSettingsPage() {
    const supabase = createClientComponentClient();
    const [loading, setLoading] = useState(true);
    const [libraries, setLibraries] = useState<Library[]>([]);
    const [defaultWorkspace, setDefaultWorkspace] = useState<string>('');
    const [user, setUser] = useState<User | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);

    const loadSettings = useCallback(async () => {
        try {
            setLoading(true);
            setLoadError(null);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                console.warn('[DashboardSettings] No authenticated user found');
                setLibraries([]);
                setDefaultWorkspace('');
                setLoadError('You are not authenticated. Please sign in again.');
                return;
            }
            setUser(user);

            const username = user.email?.split('@')[0] || 'user';

            const { data: memberships, error: membershipsError } = await supabase
                .from('workspace_members')
                .select(`
                    workspace_id,
                    role,
                    workspaces:workspace_id (
                        id,
                        name,
                        logo_url
                    )
                `)
                .eq('member_user_id', user.id)
                .eq('status', 'active');

            if (membershipsError) {
                console.warn('[DashboardSettings] Failed to load workspace memberships:', membershipsError);
            } else {
                console.log('[DashboardSettings] Membership rows loaded:', memberships?.length || 0);
            }

            let effectiveMemberships = memberships || [];
            if (effectiveMemberships.length === 0 && user.email) {
                const { data: emailMemberships, error: emailMembershipsError } = await supabase
                    .from('workspace_members')
                    .select(`
                        workspace_id,
                        role,
                        workspaces:workspace_id (
                            id,
                            name,
                            logo_url
                        )
                    `)
                    .eq('member_email', user.email.toLowerCase())
                    .eq('status', 'active');

                if (emailMembershipsError) {
                    console.warn('[DashboardSettings] Email-based membership fallback failed:', emailMembershipsError);
                } else {
                    effectiveMemberships = emailMemberships || [];
                    console.log('[DashboardSettings] Email membership fallback rows loaded:', effectiveMemberships.length);
                }
            }

            const workspaceLibraries: Library[] = (effectiveMemberships as unknown as WorkspaceRow[])
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
                name: user.user_metadata?.display_name || username,
                username,
                type: 'personal',
                show: true
            };

            const defaultLibraries: Library[] = [personalLibrary, ...workspaceLibraries];
            console.log('[DashboardSettings] Effective libraries:', defaultLibraries.length);

            // Try to load dashboard settings
            try {
                const { data } = await supabase
                    .from('dashboard_settings')
                    .select('*')
                    .eq('user_id', user.id)
                    .single();

                if (data) {
                    setDefaultWorkspace(data.default_workspace || defaultLibraries[0]?.id || user.id);
                    if (data.libraries) {
                        const savedById = new Map((data.libraries as Library[]).map((lib) => [lib.id, lib]));
                        setLibraries(defaultLibraries.map((lib) => ({
                            ...lib,
                            show: savedById.get(lib.id)?.show ?? true
                        })));
                        return;
                    }
                }
            } catch {
                // Use defaults
            }

            setLibraries(defaultLibraries);
            setDefaultWorkspace(defaultLibraries[0]?.id || user.id);
        } catch (err) {
            console.error('Error loading settings:', err);
            setLoadError('Could not load dashboard settings. Please refresh and try again.');
        } finally {
            setLoading(false);
        }
    }, [supabase]);

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
            await supabase
                .from('dashboard_settings')
                .upsert({
                    user_id: user.id,
                    libraries: newLibraries,
                    default_workspace: defaultWorkspace,
                    updated_at: new Date().toISOString()
                });
        } catch {
            console.warn('Could not save dashboard settings');
        }
    };

    const handleDefaultWorkspaceChange = async (workspaceId: string) => {
        if (!user?.id) return;
        setDefaultWorkspace(workspaceId);
        
        try {
            await supabase
                .from('dashboard_settings')
                .upsert({
                    user_id: user.id,
                    libraries: libraries,
                    default_workspace: workspaceId,
                    updated_at: new Date().toISOString()
                });
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
