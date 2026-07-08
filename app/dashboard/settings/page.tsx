'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Image as ImageIcon, Loader2, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';
import { asUserId } from '@/lib/domain/core/ids';
import { createSaveWorkspaceSettingsCommand } from '@/lib/domain/settings/workspace';
import { createWorkspaceSettingsRepository } from '@/lib/infra/settings/workspaceSettingsRepository';
import { createWorkspacesRepository } from '@/lib/infra/workspaces/workspacesRepository';
import { createStorageGateway } from '@/lib/infra/supabase/storage';

interface WorkspaceData {
    workspaceId: string;
    workspaceName: string;
    workspaceLogo: string | null;
    canManage: boolean;
    settingsRowId: string | null;
}

export default function SettingsPage() {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const workspaceSettingsRepository = useMemo(() => createWorkspaceSettingsRepository(), []);
    const workspacesRepository = useMemo(() => createWorkspacesRepository(), []);
    const storageGateway = useMemo(() => createStorageGateway(), []);
    const saveWorkspaceSettings = useMemo(
        () => createSaveWorkspaceSettingsCommand(workspaceSettingsRepository, workspacesRepository),
        [workspaceSettingsRepository, workspacesRepository],
    );

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
    const [workspaceName, setWorkspaceName] = useState('');
    const [logoUrl, setLogoUrl] = useState<string | null>(null);
    const [showLogoModal, setShowLogoModal] = useState(false);
    const [pendingLogoFile, setPendingLogoFile] = useState<File | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);

    useEffect(() => {
        loadSettings();
    }, []);

    // auth-helpers uses cookies but this project stores session in localStorage
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

    const loadSettings = async () => {
        setLoading(true);
        try {
            const token = getAccessToken();
            if (!token) {
                toast.error('Not authenticated — please log in again');
                setLoading(false);
                return;
            }

            // Call the API to resolve workspace + permissions
            const res = await fetch('/api/workspace/settings-access', {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (!res.ok) {
                toast.error('Could not load workspace settings');
                setLoading(false);
                return;
            }

            const data = await res.json();
            const workspaceId: string | null = data?.workspace_id ?? null;

            if (!workspaceId) {
                toast.error('No workspace found');
                setLoading(false);
                return;
            }

            // Load workspace_settings row if it exists
            const settingsResult = await workspaceSettingsRepository.findByWorkspaceId(workspaceId);
            // PATCH-017: the legacy page destructured `data` and IGNORED read errors -
            // an err here must behave exactly like "no row" (fall through to API values).
            const settingsRow = settingsResult.ok ? settingsResult.value : null;

            const resolvedName: string =
                settingsRow?.workspaceName || data.workspace_name || 'My Workspace';
            const resolvedLogo: string | null =
                settingsRow?.workspaceLogo || data.workspace_logo || null;

            setWorkspace({
                workspaceId,
                workspaceName: resolvedName,
                workspaceLogo: resolvedLogo,
                canManage: !!data.can_manage,
                settingsRowId: settingsRow?.id ?? null,
            });
            setWorkspaceName(resolvedName);
            setLogoUrl(resolvedLogo);
        } catch (err) {
            console.error('loadSettings error:', err);
            toast.error('Failed to load settings');
        } finally {
            setLoading(false);
        }
    };

    const saveSettings = async () => {
        if (!workspace || !workspace.canManage) return;
        setSaving(true);
        try {
            const token = getAccessToken();
            if (!token) throw new Error('Not authenticated');
            const payload = JSON.parse(atob(token.split('.')[1]));
            const userId: string = payload?.sub;
            if (!userId) throw new Error('Could not resolve user id');

            const result = await saveWorkspaceSettings(
                {
                    workspaceId: workspace.workspaceId,
                    settingsRowId: workspace.settingsRowId,
                    workspaceName,
                    workspaceLogo: logoUrl,
                },
                { userId: asUserId(userId) },
            );
            if (!result.ok) throw result.error;

            toast.success('Settings saved successfully');
            await loadSettings();
        } catch (err) {
            console.error('saveSettings error:', err);
            toast.error('Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    const uploadLogoFile = async (file: File) => {
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            toast.error('Please upload an image file');
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            toast.error('Image must be less than 2MB');
            return;
        }

        setUploadingLogo(true);
        try {
            const token = getAccessToken();
            if (!token) throw new Error('Not authenticated');
            const payload = JSON.parse(atob(token.split('.')[1]));
            const userId: string = payload?.sub;
            if (!userId) throw new Error('Could not resolve user id');

            const fileExt = file.name.split('.').pop();
            const filePath = `logos/workspace_logo_${userId}_${Date.now()}.${fileExt}`;

            const uploadResult = await storageGateway.upload('avatars', filePath, file, { upsert: true });
            if (!uploadResult.ok) throw uploadResult.error;
            const publicUrl = storageGateway.getPublicUrl('avatars', filePath);

            setLogoUrl(publicUrl);
            toast.success('Logo uploaded successfully');
            setShowLogoModal(false);
            setPendingLogoFile(null);
        } catch (err) {
            console.error('uploadLogoFile error:', err);
            toast.error('Failed to upload logo');
        } finally {
            setUploadingLogo(false);
        }
    };

    const getInitial = () => workspaceName?.charAt(0)?.toUpperCase() || 'W';
    const canEdit = !!workspace?.canManage;

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
        );
    }

    return (
        <div>
            <div className="mb-2">
                <p className="text-sm text-purple-600">Workspace settings</p>
                <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
            </div>

            {workspace && !workspace.canManage && (
                <div className="mt-4 mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    You have read-only access to this workspace. Workspace settings cannot be changed from this account.
                </div>
            )}

            <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white">
                {/* Logo row */}
                <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
                    <div className="w-32 flex-shrink-0 text-gray-600">Logo</div>
                    <div className="flex flex-1 items-center justify-between">
                        <div className="flex flex-col items-start">
                            {logoUrl ? (
                                <img
                                    src={logoUrl}
                                    alt="Workspace logo"
                                    className="h-20 w-20 rounded-xl border border-gray-200 object-cover"
                                />
                            ) : (
                                <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-gradient-to-br from-pink-400 to-pink-600 text-3xl font-bold text-white">
                                    {getInitial()}
                                </div>
                            )}
                        </div>
                        <p className="px-4 text-sm text-gray-500">
                            Pick a logo for your workspace. Recommended size is 256x256px.
                        </p>
                        <button
                            type="button"
                            onClick={() => { if (canEdit && !uploadingLogo) setShowLogoModal(true); }}
                            disabled={!canEdit || uploadingLogo}
                            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:text-gray-300"
                            aria-label="Edit workspace logo"
                        >
                            {uploadingLogo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
                        </button>
                    </div>
                </div>

                {/* Name row */}
                <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
                    <div className="w-32 flex-shrink-0 text-gray-600">Name</div>
                    <div className="flex flex-1 items-center">
                        <input
                            type="text"
                            value={workspaceName}
                            onChange={(e) => setWorkspaceName(e.target.value)}
                            placeholder="Enter workspace name"
                            disabled={!canEdit}
                            className="w-full max-w-xl border border-gray-300 rounded-lg px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-purple-500 disabled:bg-gray-50 disabled:text-gray-500"
                        />
                    </div>
                </div>

                {/* URL row */}
                <div className="flex items-center justify-between px-6 py-4">
                    <div className="w-32 flex-shrink-0 text-gray-600">Workspace URL</div>
                    <div className="flex flex-1 items-center gap-2">
                        <span className="text-sm text-gray-500">collabboard.app/</span>
                        <span className="text-sm text-gray-900">
                            {workspaceName.toLowerCase().replace(/\s+/g, '-')}
                        </span>
                    </div>
                </div>
            </div>

            {/* Logo upload modal */}
            {showLogoModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
                        <div className="mb-4 flex items-center justify-between">
                            <h2 className="text-3xl font-semibold text-slate-700">Upload workspace logo</h2>
                            <button
                                type="button"
                                onClick={() => { setShowLogoModal(false); setPendingLogoFile(null); }}
                                className="rounded-lg p-1 text-gray-500 transition-colors hover:bg-gray-100"
                                aria-label="Close logo upload dialog"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <label
                            htmlFor="workspace-logo-input"
                            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                            onDragLeave={() => setIsDragOver(false)}
                            onDrop={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setIsDragOver(false);
                                const file = e.dataTransfer.files?.[0];
                                if (file) setPendingLogoFile(file);
                            }}
                            className={`mb-4 flex h-56 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
                                isDragOver ? 'border-purple-400 bg-purple-50' : 'border-slate-300 bg-white'
                            }`}
                        >
                            <ImageIcon className="mb-3 h-5 w-5 text-slate-400" />
                            <p className="text-2xl text-slate-600">
                                {pendingLogoFile ? pendingLogoFile.name : 'Click or drop an image file'}
                            </p>
                            {!pendingLogoFile && <p className="text-2xl text-slate-600">(jpg or png)</p>}
                        </label>

                        <input
                            id="workspace-logo-input"
                            ref={fileInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/jpg"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) setPendingLogoFile(file);
                            }}
                            className="hidden"
                        />

                        <button
                            type="button"
                            onClick={() => { if (pendingLogoFile) void uploadLogoFile(pendingLogoFile); }}
                            disabled={!pendingLogoFile || uploadingLogo}
                            className="flex w-full items-center justify-center rounded-lg bg-slate-100 px-6 py-3 text-2xl font-semibold text-slate-600 transition-colors hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {uploadingLogo ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Upload'}
                        </button>
                    </div>
                </div>
            )}

            <div className="mt-6 flex justify-end">
                <button
                    onClick={saveSettings}
                    disabled={saving || !canEdit}
                    className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-6 py-2 text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
                >
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    Save changes
                </button>
            </div>
        </div>
    );
}
