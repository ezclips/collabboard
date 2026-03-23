'use client';

import React, { useState, useEffect } from 'react';
import { useSupabase } from '@/lib/supabase';
import { 
    Loader2,
    Folder,
    Users,
    Pencil,
    X,
    Trash2,
    ChevronDown
} from 'lucide-react';
import { toast } from 'sonner';
import { canManageWorkspace, normalizeWorkspaceRole, resolveCurrentWorkspace, type WorkspaceContext, type WorkspaceRole } from '@/lib/workspace/context';

type AccessLevel = 'everyone' | 'teams' | 'members' | 'private';
type PermissionLevel = 'full' | 'view' | 'comment' | 'none';

interface Collection {
    id: string;
    name: string;
    icon: string;
    color: string;
    access: AccessLevel;
    permission: PermissionLevel;
    teamIds?: string[];
    memberIds?: string[];
    isDefault?: boolean;
    created_at: string;
}

interface Team {
    id: string;
    name: string;
    color: string;
    memberIds: string[];
    collectionIds: string[];
    created_at: string;
}

interface Member {
    id: string;
    email: string;
    display_name?: string;
    avatar_url?: string;
    role: WorkspaceRole;
}

interface PendingInviteMember {
    id: string;
    email: string;
    role: WorkspaceRole;
}

interface WorkspaceMemberRow {
    id: string;
    member_user_id: string | null;
    member_email: string;
    role: string;
}

interface TeamRow {
    id: string;
    workspace_id?: string;
    name: string;
    color?: string | null;
    member_ids?: string[] | null;
    collection_ids?: string[] | null;
    created_at: string;
}

interface WorkspaceInvitationMemberRow {
    id: string;
    email: string | null;
    role: string;
}

const TEAM_COLORS = [
    '#ef4444', // red
    '#ec4899', // pink
    '#eab308', // yellow
    '#6366f1', // indigo
    '#3b82f6', // blue
    '#0ea5e9', // sky
    '#14b8a6', // teal
    '#22c55e', // green
    '#84cc16', // lime
    '#a3e635', // lime bright
    '#f97316', // orange
    '#fb923c', // orange light
];

type ApiResult = Record<string, unknown>;

const parseApiResult = async (response: Response): Promise<ApiResult> => {
    const rawText = await response.text();
    if (!rawText) {
        return {};
    }

    try {
        const parsed = JSON.parse(rawText);
        return typeof parsed === 'object' && parsed !== null ? (parsed as ApiResult) : { value: parsed };
    } catch {
        return { error: rawText };
    }
};

const getApiError = (result: ApiResult, fallback: string): string => {
    const error = result.error;
    return typeof error === 'string' && error.trim().length > 0 ? error : fallback;
};

export default function CollectionsPage() {
    const { supabase } = useSupabase();
    const [loading, setLoading] = useState(true);
    const [collections, setCollections] = useState<Collection[]>([]);
    const [teams, setTeams] = useState<Team[]>([]);
    const [members, setMembers] = useState<Member[]>([]);
    const [pendingInviteMembers, setPendingInviteMembers] = useState<PendingInviteMember[]>([]);
    const [workspaceContext, setWorkspaceContext] = useState<WorkspaceContext | null>(null);
    
    // Create Team Modal
    const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
    const [teamName, setTeamName] = useState('');
    const [teamColor, setTeamColor] = useState(TEAM_COLORS[9]); // lime bright default
    const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
    const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
    const [showCreateCollectionDropdown, setShowCreateCollectionDropdown] = useState(false);
    const [creatingTeam, setCreatingTeam] = useState(false);
    
    // Edit Team Modal
    const [showEditTeamModal, setShowEditTeamModal] = useState(false);
    const [editingTeam, setEditingTeam] = useState<Team | null>(null);
    const [editTeamName, setEditTeamName] = useState('');
    const [editTeamColor, setEditTeamColor] = useState('');
    const [editTeamCollections, setEditTeamCollections] = useState<string[]>([]);
    const [editTeamMembers, setEditTeamMembers] = useState<string[]>([]);
    const [showEditCollectionDropdown, setShowEditCollectionDropdown] = useState(false);
    const [savingTeam, setSavingTeam] = useState(false);
    
    // Delete Team Confirmation
    const [showDeleteTeamConfirm, setShowDeleteTeamConfirm] = useState(false);
    const [teamToDelete, setTeamToDelete] = useState<Team | null>(null);
    const [deletingTeam, setDeletingTeam] = useState(false);
    
    // Edit Collection Modal
    const [showEditCollectionModal, setShowEditCollectionModal] = useState(false);
    const [editingCollection, setEditingCollection] = useState<Collection | null>(null);
    const [editCollectionTeams, setEditCollectionTeams] = useState<string[]>([]);

    useEffect(() => {
        void loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const resolvedWorkspace = await resolveCurrentWorkspace(supabase, user);
            setWorkspaceContext(resolvedWorkspace);

            // Load folders as collections
            let foldersQuery = supabase
                .from('folders')
                .select('*')
                .order('created_at', { ascending: true });

            foldersQuery = resolvedWorkspace
                ? foldersQuery.eq('workspace_id', resolvedWorkspace.workspaceId)
                : foldersQuery.eq('user_id', user.id);

            const { data: folderData } = await foldersQuery;

            // Default "Main" collection always exists
            const defaultCollection: Collection = {
                id: 'main',
                name: 'Main',
                icon: '📁',
                color: '#6b7280',
                access: 'everyone',
                permission: 'full',
                isDefault: true,
                created_at: user.created_at
            };

            const loadedCollections = folderData?.map(f => ({
                id: f.id,
                name: f.name,
                icon: f.icon || '📁',
                color: f.color || '#6b7280',
                access: (f.access || 'everyone') as AccessLevel,
                permission: (f.permission || 'full') as PermissionLevel,
                teamIds: f.team_ids || [],
                memberIds: f.member_ids || [],
                isDefault: false,
                created_at: f.created_at
            })) || [];
            const validCollectionIds = new Set<string>(['main', ...loadedCollections.map((collection) => collection.id)]);

            setCollections([defaultCollection, ...loadedCollections]);

            if (resolvedWorkspace) {
                const { data: workspaceMembers } = await supabase
                    .from('workspace_members')
                    .select('id, member_user_id, member_email, role, status')
                    .eq('workspace_id', resolvedWorkspace.workspaceId)
                    .eq('status', 'active')
                    .order('created_at', { ascending: true });

                setMembers((workspaceMembers || []).map((member: WorkspaceMemberRow) => ({
                    id: member.member_user_id || member.id,
                    email: member.member_email,
                    display_name: member.member_user_id === user.id
                        ? user.user_metadata?.display_name || user.email?.split('@')[0]
                        : member.member_email?.split('@')[0],
                    avatar_url: member.member_user_id === user.id ? user.user_metadata?.avatar_url : undefined,
                    role: normalizeWorkspaceRole(member.role),
                })));

                const { data: invitationMembers } = await supabase
                    .from('workspace_invitations')
                    .select('id, email, role')
                    .eq('workspace_id', resolvedWorkspace.workspaceId)
                    .eq('type', 'email')
                    .is('redeemed_at', null)
                    .order('created_at', { ascending: false });

                setPendingInviteMembers(
                    (invitationMembers || [])
                        .filter((invitation: WorkspaceInvitationMemberRow) => !!invitation.email)
                        .map((invitation: WorkspaceInvitationMemberRow) => ({
                            id: `invite:${(invitation.email || '').toLowerCase()}`,
                            email: (invitation.email || '').toLowerCase(),
                            role: normalizeWorkspaceRole(invitation.role),
                        })),
                );
            } else {
                setMembers([{
                    id: user.id,
                    email: user.email || '',
                    display_name: user.user_metadata?.display_name || user.email?.split('@')[0],
                    avatar_url: user.user_metadata?.avatar_url,
                    role: 'owner'
                }]);
                setPendingInviteMembers([]);
            }

            const { data: { session } } = await supabase.auth.getSession();
            const headers: Record<string, string> = {};
            if (session?.access_token) {
                headers.Authorization = `Bearer ${session.access_token}`;
            }

            const teamsResponse = await fetch('/api/teams', { headers });
            const teamsResult = await parseApiResult(teamsResponse);
            if (!teamsResponse.ok) {
                console.error('Error loading teams:', teamsResult);
                toast.error(getApiError(teamsResult, 'Failed to load teams'));
                setTeams([]);
            } else {
                const teamData = (Array.isArray(teamsResult.teams) ? teamsResult.teams : []) as TeamRow[];
                setTeams(teamData.map((t: TeamRow) => ({
                    id: t.id,
                    name: t.name,
                    color: t.color || TEAM_COLORS[0],
                    memberIds: t.member_ids || [],
                    collectionIds: (t.collection_ids || []).filter((collectionId) => validCollectionIds.has(collectionId)),
                    created_at: t.created_at
                })));
            }
        } catch (err) {
            console.error('Error loading data:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateTeam = async () => {
        if (!workspaceContext || !canManageWorkspace(workspaceContext.role)) {
            toast.error('You do not have permission to manage teams');
            return;
        }

        if (!teamName.trim()) {
            toast.error('Please enter a team name');
            return;
        }

        try {
            setCreatingTeam(true);

            const newTeamPayload = {
                name: teamName,
                color: teamColor,
                memberIds: [...new Set([...selectedMembers, ...getMandatoryMemberIds()])],
                collectionIds: selectedCollections,
            };

            const { data: { session } } = await supabase.auth.getSession();
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };
            if (session?.access_token) {
                headers.Authorization = `Bearer ${session.access_token}`;
            }

            const response = await fetch('/api/teams', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    name: newTeamPayload.name,
                    color: newTeamPayload.color,
                    member_ids: newTeamPayload.memberIds,
                    collection_ids: newTeamPayload.collectionIds,
                }),
            });
            const result = await parseApiResult(response);
            const createdTeam = (result.team ?? null) as TeamRow | null;
            if (!response.ok || !createdTeam?.id) {
                console.error('Could not save team to database:', result);
                toast.error(getApiError(result, 'Failed to save team'));
                return;
            }

            setTeams((prev) => [
                {
                    id: createdTeam.id,
                    name: createdTeam.name,
                    color: createdTeam.color || TEAM_COLORS[0],
                    memberIds: createdTeam.member_ids || [],
                    collectionIds: createdTeam.collection_ids || [],
                    created_at: createdTeam.created_at,
                },
                ...prev,
            ]);
            toast.success('Team created successfully!');
            closeCreateTeamModal();
        } catch (err) {
            console.error('Error creating team:', err);
            toast.error('Failed to create team');
        } finally {
            setCreatingTeam(false);
        }
    };

    const closeCreateTeamModal = () => {
        setShowCreateTeamModal(false);
        setTeamName('');
        setTeamColor(TEAM_COLORS[9]);
        setSelectedCollections([]);
        setSelectedMembers([]);
        setShowCreateCollectionDropdown(false);
    };

    const openEditTeam = (team: Team) => {
        setEditingTeam(team);
        setEditTeamName(team.name);
        setEditTeamColor(team.color);
        setEditTeamCollections(team.collectionIds);
        setEditTeamMembers(team.memberIds);
        setShowEditTeamModal(true);
    };

    const closeEditTeamModal = () => {
        setShowEditTeamModal(false);
        setEditingTeam(null);
        setEditTeamName('');
        setEditTeamColor('');
        setEditTeamCollections([]);
        setEditTeamMembers([]);
        setShowEditCollectionDropdown(false);
    };

    const handleSaveTeam = async () => {
        if (!workspaceContext || !canManageWorkspace(workspaceContext.role)) {
            toast.error('You do not have permission to manage teams');
            return;
        }

        if (!editingTeam || !editTeamName.trim()) {
            toast.error('Please enter a team name');
            return;
        }

        try {
            setSavingTeam(true);

            const updatedTeam: Team = {
                ...editingTeam,
                name: editTeamName,
                color: editTeamColor,
                memberIds: [...new Set([...editTeamMembers, ...getMandatoryMemberIds()])],
                collectionIds: editTeamCollections
            };

            const { data: { session } } = await supabase.auth.getSession();
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };
            if (session?.access_token) {
                headers.Authorization = `Bearer ${session.access_token}`;
            }

            const response = await fetch(`/api/teams/${editingTeam.id}`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({
                    name: updatedTeam.name,
                    color: updatedTeam.color,
                    member_ids: updatedTeam.memberIds,
                    collection_ids: updatedTeam.collectionIds
                }),
            });
            const result = await parseApiResult(response);
            if (!response.ok) {
                console.error('Could not update team in database:', result);
                toast.error(getApiError(result, 'Failed to update team'));
                return;
            }

            setTeams(prev => prev.map(t => t.id === editingTeam.id ? updatedTeam : t));
            toast.success('Team updated successfully!');
            closeEditTeamModal();
        } catch (err) {
            console.error('Error updating team:', err);
            toast.error('Failed to update team');
        } finally {
            setSavingTeam(false);
        }
    };

    const confirmDeleteTeam = (team: Team) => {
        setTeamToDelete(team);
        setShowDeleteTeamConfirm(true);
    };

    const handleDeleteTeam = async () => {
        if (!workspaceContext || !canManageWorkspace(workspaceContext.role)) {
            toast.error('You do not have permission to manage teams');
            return;
        }

        if (!teamToDelete) return;

        try {
            setDeletingTeam(true);

            const { data: { session } } = await supabase.auth.getSession();
            const headers: Record<string, string> = {};
            if (session?.access_token) {
                headers.Authorization = `Bearer ${session.access_token}`;
            }

            const response = await fetch(`/api/teams/${teamToDelete.id}`, {
                method: 'DELETE',
                headers,
            });
            const result = await parseApiResult(response);
            if (!response.ok) {
                console.error('Could not delete team from database:', result);
                toast.error(getApiError(result, 'Failed to delete team'));
                return;
            }

            setTeams(prev => prev.filter(t => t.id !== teamToDelete.id));
            toast.success('Team deleted successfully!');
            setShowDeleteTeamConfirm(false);
            setTeamToDelete(null);
        } catch (err) {
            console.error('Error deleting team:', err);
            toast.error('Failed to delete team');
        } finally {
            setDeletingTeam(false);
        }
    };

    const openEditCollection = (collection: Collection) => {
        if (!workspaceContext || !canManageWorkspace(workspaceContext.role)) {
            return;
        }

        setEditingCollection(collection);
        setEditCollectionTeams(collection.teamIds || []);
        setShowEditCollectionModal(true);
    };

    const closeEditCollectionModal = () => {
        setShowEditCollectionModal(false);
        setEditingCollection(null);
        setEditCollectionTeams([]);
    };

    const toggleCollectionTeamAccess = async (teamId: string) => {
        if (!workspaceContext || !canManageWorkspace(workspaceContext.role)) {
            toast.error('You do not have permission to update collection access');
            return;
        }

        if (!editingCollection) return;

        const nextTeamIds = editCollectionTeams.includes(teamId)
            ? editCollectionTeams.filter((id) => id !== teamId)
            : [...editCollectionTeams, teamId];

        setEditCollectionTeams(nextTeamIds);

        const nextAccess: AccessLevel = nextTeamIds.length > 0 ? 'teams' : 'everyone';
        setCollections((prev) =>
            prev.map((collection) =>
                collection.id === editingCollection.id
                    ? {
                        ...collection,
                        access: nextAccess,
                        teamIds: nextTeamIds,
                    }
                    : collection,
            ),
        );

        if (editingCollection.id === 'main') {
            return;
        }

        try {
            const { error } = await supabase
                .from('folders')
                .update({
                    team_ids: nextTeamIds,
                    access: nextAccess,
                })
                .eq('id', editingCollection.id);

            if (error) {
                throw error;
            }
        } catch (err) {
            console.error('Error updating collection team access:', err);
            toast.error('Failed to update collection access');
        }
    };

    const toggleCollectionSelection = (collectionId: string) => {
        setSelectedCollections(prev => 
            prev.includes(collectionId)
                ? prev.filter(id => id !== collectionId)
                : [...prev, collectionId]
        );
    };

    const toggleMemberSelection = (memberId: string) => {
        setSelectedMembers(prev => 
            prev.includes(memberId)
                ? prev.filter(id => id !== memberId)
                : [...prev, memberId]
        );
    };

    const toggleEditMemberSelection = (memberId: string) => {
        setEditTeamMembers(prev =>
            prev.includes(memberId)
                ? prev.filter(id => id !== memberId)
                : [...prev, memberId]
        );
    };

    const getSelectedCollectionNames = (ids: string[]) => {
        if (ids.length === 0) return 'Select collections';
        if (ids.length === 1) {
            const match = collections.find((collection) => collection.id === ids[0]);
            return match?.name || ids[0];
        }
        return `${ids.length} selected`;
    };

    const getMandatoryMemberIds = () =>
        members
            .filter((member) => member.role === 'owner' || member.role === 'admin')
            .map((member) => member.id);

    const getTeamMemberCount = (team: Team) => {
        const mandatory = getMandatoryMemberIds();
        return new Set([...team.memberIds, ...mandatory]).size;
    };

    const getCollectionTeamNames = (collection: Collection) => {
        const directTeamIds = collection.teamIds || [];
        const linkedTeamIds = teams
            .filter((team) => team.collectionIds.includes(collection.id))
            .map((team) => team.id);
        const uniqueIds = [...new Set([...directTeamIds, ...linkedTeamIds])];
        return teams
            .filter((team) => uniqueIds.includes(team.id))
            .map((team) => team.name);
    };

    const getInitials = (member: { email: string; display_name?: string }) => {
        if (member.display_name) {
            return member.display_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        }
        return member.email.slice(0, 2).toUpperCase();
    };

    const visiblePendingInviteMembers = pendingInviteMembers.filter(
        (invite) => !members.some((member) => member.email.toLowerCase() === invite.email.toLowerCase()),
    );
    const canManageTeams = !!workspaceContext && canManageWorkspace(workspaceContext.role);
    const selectableCollections = collections.map((collection) => ({
        id: collection.id,
        name: collection.name,
    }));

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
            <div className="flex items-center justify-between mb-8">
                <h1 className="text-2xl font-semibold text-gray-900">Teams & Collections</h1>
                <button
                    onClick={() => {
                        if (!canManageTeams) return;
                        setShowCreateTeamModal(true);
                    }}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors disabled:opacity-50"
                    disabled={!canManageTeams}
                >
                    Create team
                </button>
            </div>

            {/* Teams Section */}
            <div className="hidden">
                <h2 className="text-lg font-semibold text-purple-600 mb-2">Teams</h2>
                <p className="text-sm text-gray-500 mb-4">
                    Group members into teams to control access to collections and features.
                </p>
                {teams.length === 0 ? (
                    <div className="p-6 bg-gray-50 rounded-lg border border-gray-200 text-center">
                        <Users className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-gray-500">There aren&apos;t any teams in this workspace currently.</p>
                        <p className="text-sm text-gray-400 mt-1">Teams are optional — many small workspaces only use collections.</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {teams.map(team => (
                            <div
                                key={team.id}
                                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200"
                            >
                                <div className="flex items-center gap-3">
                                    <div 
                                        className="w-10 h-10 rounded-lg flex items-center justify-center"
                                        style={{ backgroundColor: team.color }}
                                    >
                                        <Users className="w-5 h-5 text-white" />
                                    </div>
                                    <div>
                                        <div className="font-medium text-gray-900">{team.name}</div>
                                        <div className="text-sm text-gray-500">
                                            {team.memberIds.length} member{team.memberIds.length !== 1 ? 's' : ''} · {team.collectionIds.length} collection{team.collectionIds.length !== 1 ? 's' : ''}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button 
                                        onClick={() => openEditTeam(team)}
                                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                                        title="Edit team"
                                    >
                                        <Pencil className="w-4 h-4" />
                                    </button>
                                    <button 
                                        onClick={() => confirmDeleteTeam(team)}
                                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                        title="Delete team"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            

            <section className="mb-8 border-b border-[#ecebfa] pb-8">
                <div className="grid gap-6 md:grid-cols-[280px_minmax(0,1fr)] md:items-start">
                    <div>
                        <h2 className="text-base font-semibold text-[#655ac9]">Teams</h2>
                    </div>
                    {teams.length === 0 ? (
                        <div className="rounded-xl border border-[#ecebfa] bg-white p-6 text-sm text-gray-500">
                            There aren&apos;t any teams in this workspace currently.
                        </div>
                    ) : (
                        <div className="overflow-hidden rounded-xl border border-[#ecebfa] bg-white">
                            <table className="w-full table-fixed">
                                <colgroup>
                                    <col className="w-[58%]" />
                                    <col className="w-[30%]" />
                                    <col className="w-[12%]" />
                                </colgroup>
                                <thead className="bg-[#f6f5fd]">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">Team</th>
                                        <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">Members</th>
                                        <th className="w-24 px-4 py-3" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {teams.map((team) => (
                                        <tr
                                            key={team.id}
                                            className="cursor-pointer border-t border-[#ecebfa] first:border-t-0 hover:bg-slate-50"
                                            onClick={() => openEditTeam(team)}
                                        >
                                            <td className="px-4 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f2effc]">
                                                        <Users className="h-4 w-4" style={{ color: team.color }} />
                                                    </div>
                                                    <span className="font-medium text-slate-900">{team.name}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4 text-slate-700">
                                                {getTeamMemberCount(team)} member{getTeamMemberCount(team) === 1 ? '' : 's'}
                                            </td>
                                            <td className="px-4 py-4">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (!canManageTeams) return;
                                                        openEditTeam(team);
                                                    }}
                                                    className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                                                    title="Edit team"
                                                    disabled={!canManageTeams}
                                                >
                                                        <Pencil className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (!canManageTeams) return;
                                                        confirmDeleteTeam(team);
                                                    }}
                                                    className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                                                    title="Delete team"
                                                    disabled={!canManageTeams}
                                                >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </section>

            <section>
                <div className="grid gap-6 md:grid-cols-[280px_minmax(0,1fr)] md:items-start">
                    <div>
                        <h2 className="text-base font-semibold text-[#655ac9]">Collections</h2>
                    </div>
                    <div className="overflow-hidden rounded-xl border border-[#ecebfa] bg-white">
                        <table className="w-full table-fixed">
                            <colgroup>
                                <col className="w-[58%]" />
                                <col className="w-[30%]" />
                                <col className="w-[12%]" />
                            </colgroup>
                            <thead className="bg-[#f6f5fd]">
                                <tr>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">Collection</th>
                                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-700">Access</th>
                                    <th className="w-24 px-4 py-3" />
                                </tr>
                            </thead>
                            <tbody>
                                {collections.map((collection) => {
                                    const linkedTeams = getCollectionTeamNames(collection);
                                    return (
                                        <tr
                                            key={collection.id}
                                            className="cursor-pointer border-t border-[#ecebfa] first:border-t-0 hover:bg-slate-50"
                                            onClick={() => {
                                                if (!canManageTeams) return;
                                                openEditCollection(collection);
                                            }}
                                        >
                                            <td className="px-4 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f2effc]">
                                                        <Folder className="h-4 w-4 text-slate-500" />
                                                    </div>
                                                    <span className="font-medium text-slate-900">{collection.name}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4">
                                                {linkedTeams.length > 0 ? (
                                                    <div className="flex flex-wrap gap-2">
                                                        {linkedTeams.map((teamName) => (
                                                            <span
                                                                key={`${collection.id}-${teamName}`}
                                                                className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700"
                                                            >
                                                                {teamName}
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="text-sm text-slate-500">Everyone</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-4">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (!canManageTeams) return;
                                                        openEditCollection(collection);
                                                    }}
                                                    className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                                                    title="Edit collection"
                                                    disabled={!canManageTeams}
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

            {/* Create Team Modal */}
            {showCreateTeamModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4">
                        <div className="flex items-center justify-between p-6 border-b border-gray-200">
                            <h2 className="text-xl font-semibold text-gray-900">Create team</h2>
                            <button
                                onClick={closeCreateTeamModal}
                                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5 text-gray-400" />
                            </button>
                        </div>
                        
                        <div className="p-6">
                            <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                                {/* Left Column - Name and Color */}
                                <div className="space-y-6">
                                    {/* Name Input */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Name
                                        </label>
                                        <input
                                            type="text"
                                            value={teamName}
                                            onChange={(e) => setTeamName(e.target.value)}
                                            placeholder="Team name"
                                            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                        />
                                    </div>

                                    {/* Color Picker */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Color
                                        </label>
                                        <div className="grid grid-cols-6 gap-2">
                                            {TEAM_COLORS.map((color) => (
                                                <button
                                                    key={color}
                                                    onClick={() => setTeamColor(color)}
                                                    className={`w-8 h-8 rounded-lg transition-all ${
                                                        teamColor === color 
                                                            ? 'ring-2 ring-offset-2 ring-purple-500 scale-110' 
                                                            : 'hover:scale-105'
                                                    }`}
                                                    style={{ backgroundColor: color }}
                                                />
                                            ))}
                                        </div>
                                    </div>

                                    {/* Collections */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Collections
                                        </label>
                                        <p className="text-sm text-gray-500 mb-3">
                                            Set which collections this team should have access to.
                                        </p>
                                        <div className="rounded-lg border border-gray-200 bg-white">
                                            <button
                                                type="button"
                                                onClick={() => setShowCreateCollectionDropdown((prev) => !prev)}
                                                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-gray-700"
                                            >
                                                <span>{getSelectedCollectionNames(selectedCollections)}</span>
                                                <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${showCreateCollectionDropdown ? 'rotate-180' : ''}`} />
                                            </button>
                                            {showCreateCollectionDropdown && (
                                                <div className="max-h-48 space-y-1 overflow-y-auto border-t border-gray-200 p-2">
                                                    {selectableCollections.map((collectionOption) => (
                                                        <label key={collectionOption.id} className="flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 hover:bg-gray-50">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedCollections.includes(collectionOption.id)}
                                                                onChange={() => toggleCollectionSelection(collectionOption.id)}
                                                                className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                                            />
                                                            <span className="text-sm text-gray-700">{collectionOption.name}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Right Column - Members */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Members
                                    </label>
                                    <p className="text-sm text-gray-500 mb-3">
                                        Assign members to this team to have read & write access.
                                    </p>

                                    {/* Members List */}
                                    <div className="space-y-2">
                                        {members.map((member) => (
                                            <div
                                                key={member.id}
                                                className="flex items-center gap-3 p-2"
                                            >
                                                {member.avatar_url ? (
                                                    <img
                                                        src={member.avatar_url}
                                                        alt={member.display_name || member.email}
                                                        className="w-8 h-8 rounded-full"
                                                    />
                                                ) : (
                                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white text-sm font-medium">
                                                        {getInitials(member)}
                                                    </div>
                                                )}
                                                <div className="flex-1">
                                                    <span className="text-gray-900">{member.display_name || member.email.split('@')[0]}</span>
                                                    <span className="text-gray-400 text-sm ml-2">
                                                        {member.role === 'owner' || member.role === 'admin' ? '(team leader)' : `(${member.role})`}
                                                    </span>
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedMembers.includes(member.id) || member.role === 'admin' || member.role === 'owner'}
                                                    onChange={() => {
                                                        if (member.role === 'admin' || member.role === 'owner') return;
                                                        toggleMemberSelection(member.id);
                                                    }}
                                                    disabled={member.role === 'admin' || member.role === 'owner'}
                                                    className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500 disabled:opacity-50"
                                                />
                                            </div>
                                        ))}
                                        {visiblePendingInviteMembers.length > 0 && (
                                            <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                                                Pending invitations
                                            </p>
                                        )}
                                        {visiblePendingInviteMembers.map((invite) => (
                                            <div
                                                key={invite.id}
                                                className="flex items-center gap-3 p-2"
                                            >
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-white text-sm font-medium">
                                                    {getInitials(invite)}
                                                </div>
                                                <div className="flex-1">
                                                    <span className="text-gray-900">{invite.email}</span>
                                                    <span className="text-gray-400 text-sm ml-2">(invited)</span>
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedMembers.includes(invite.id)}
                                                    onChange={() => toggleMemberSelection(invite.id)}
                                                    className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50 rounded-b-xl">
                            <button
                                onClick={closeCreateTeamModal}
                                className="px-4 py-2 text-sm font-medium text-[#655ac9] transition-colors hover:bg-purple-50 rounded-lg"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateTeam}
                                disabled={creatingTeam || !teamName.trim() || !canManageTeams}
                                className="px-6 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                            >
                                {creatingTeam && <Loader2 className="w-4 h-4 animate-spin" />}
                                Create
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Collection Modal */}
            {showEditCollectionModal && editingCollection && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4">
                        <div className="flex items-center justify-between p-6">
                            <h2 className="text-3xl font-semibold text-gray-800">
                                Collection {editingCollection.name}
                            </h2>
                            <button
                                onClick={closeEditCollectionModal}
                                className="rounded-lg p-1 transition-colors hover:bg-gray-100"
                            >
                                <X className="w-5 h-5 text-gray-400" />
                            </button>
                        </div>

                        <div className="px-6 pb-6">
                            <h3 className="mb-2 text-xl font-semibold text-gray-800">Teams</h3>
                            <p className="mb-6 max-w-2xl text-base text-gray-600">
                                Set which teams have access to this collection. Unassigning all teams will make it accessible to every member of this workspace.
                            </p>

                            <div className="space-y-3">
                                {teams.length === 0 ? (
                                    <p className="text-sm text-gray-500">No teams created yet.</p>
                                ) : (
                                    teams.map((team) => (
                                        <label
                                            key={team.id}
                                            className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 hover:bg-gray-50"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f2effc]">
                                                    <Users className="h-4 w-4" style={{ color: team.color }} />
                                                </div>
                                                <span className="text-lg text-gray-700">{team.name}</span>
                                            </div>
                                            <input
                                                type="checkbox"
                                                checked={editCollectionTeams.includes(team.id)}
                                                onChange={() => {
                                                    void toggleCollectionTeamAccess(team.id);
                                                }}
                                                className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                                disabled={!canManageTeams}
                                            />
                                        </label>
                                    ))
                                )}
                            </div>
                        </div>

                        <div className="flex items-center justify-end px-6 pb-6">
                            <button
                                onClick={closeEditCollectionModal}
                                className="px-4 py-2 text-sm font-semibold text-[#655ac9] transition-colors hover:bg-purple-50 rounded-lg"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Team Modal */}
            {showEditTeamModal && editingTeam && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between p-6 border-b border-gray-200">
                            <h2 className="text-xl font-semibold text-gray-900">Edit team</h2>
                            <button
                                onClick={closeEditTeamModal}
                                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                <X className="w-5 h-5 text-gray-400" />
                            </button>
                        </div>
                        
                        <div className="p-6">
                            <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                                {/* Left Column - Name and Color */}
                                <div className="space-y-6">
                                    {/* Name Input */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Name
                                        </label>
                                        <input
                                            type="text"
                                            value={editTeamName}
                                            onChange={(e) => setEditTeamName(e.target.value)}
                                            placeholder="Team name"
                                            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                        />
                                    </div>

                                    {/* Color Picker */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Color
                                        </label>
                                        <div className="grid grid-cols-6 gap-2">
                                            {TEAM_COLORS.map((color) => (
                                                <button
                                                    key={color}
                                                    onClick={() => setEditTeamColor(color)}
                                                    className={`w-8 h-8 rounded-lg transition-all ${
                                                        editTeamColor === color 
                                                            ? 'ring-2 ring-offset-2 ring-purple-500 scale-110' 
                                                            : 'hover:scale-105'
                                                    }`}
                                                    style={{ backgroundColor: color }}
                                                />
                                            ))}
                                        </div>
                                    </div>

                                    {/* Collections */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                            Collections
                                        </label>
                                        <p className="text-sm text-gray-500 mb-3">
                                            Set which collections this team should have access to.
                                        </p>
                                        <div className="rounded-lg border border-gray-200 bg-white">
                                            <button
                                                type="button"
                                                onClick={() => setShowEditCollectionDropdown((prev) => !prev)}
                                                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-gray-700"
                                            >
                                                <span>{getSelectedCollectionNames(editTeamCollections)}</span>
                                                <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${showEditCollectionDropdown ? 'rotate-180' : ''}`} />
                                            </button>
                                            {showEditCollectionDropdown && (
                                                <div className="max-h-48 space-y-1 overflow-y-auto border-t border-gray-200 p-2">
                                                    {selectableCollections.map((collectionOption) => (
                                                        <label key={collectionOption.id} className="flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 hover:bg-gray-50">
                                                            <input
                                                                type="checkbox"
                                                                checked={editTeamCollections.includes(collectionOption.id)}
                                                                onChange={() => {
                                                                    setEditTeamCollections((prev) =>
                                                                        prev.includes(collectionOption.id)
                                                                            ? prev.filter((id) => id !== collectionOption.id)
                                                                            : [...prev, collectionOption.id]
                                                                    );
                                                                }}
                                                                className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                                            />
                                                            <span className="text-sm text-gray-700">{collectionOption.name}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Right Column - Members */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Members
                                    </label>
                                    <p className="text-sm text-gray-500 mb-3">
                                        Assign members to this team to have read & write access.
                                    </p>

                                    {/* Members List */}
                                    <div className="space-y-2">
                                        {members.map((member) => (
                                            <div
                                                key={member.id}
                                                className="flex items-center gap-3 p-2"
                                            >
                                                {member.avatar_url ? (
                                                    <img
                                                        src={member.avatar_url}
                                                        alt={member.display_name || member.email}
                                                        className="w-8 h-8 rounded-full"
                                                    />
                                                ) : (
                                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white text-sm font-medium">
                                                        {getInitials(member)}
                                                    </div>
                                                )}
                                                <div className="flex-1">
                                                    <span className="text-gray-900">{member.display_name || member.email.split('@')[0]}</span>
                                                    <span className="text-gray-400 text-sm ml-2">
                                                        {member.role === 'owner' || member.role === 'admin' ? '(team leader)' : `(${member.role})`}
                                                    </span>
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    checked={editTeamMembers.includes(member.id) || member.role === 'admin' || member.role === 'owner'}
                                                    onChange={() => {
                                                        if (member.role === 'admin' || member.role === 'owner') return;
                                                        toggleEditMemberSelection(member.id);
                                                    }}
                                                    disabled={member.role === 'admin' || member.role === 'owner'}
                                                    className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500 disabled:opacity-50"
                                                />
                                            </div>
                                        ))}
                                        {visiblePendingInviteMembers.length > 0 && (
                                            <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                                                Pending invitations
                                            </p>
                                        )}
                                        {visiblePendingInviteMembers.map((invite) => (
                                            <div
                                                key={invite.id}
                                                className="flex items-center gap-3 p-2"
                                            >
                                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-white text-sm font-medium">
                                                    {getInitials(invite)}
                                                </div>
                                                <div className="flex-1">
                                                    <span className="text-gray-900">{invite.email}</span>
                                                    <span className="text-gray-400 text-sm ml-2">(invited)</span>
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    checked={editTeamMembers.includes(invite.id)}
                                                    onChange={() => toggleEditMemberSelection(invite.id)}
                                                    className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between gap-3 p-6 border-t border-gray-200 bg-gray-50 rounded-b-xl">
                            <button
                                onClick={() => {
                                    if (!canManageTeams) return;
                                    confirmDeleteTeam(editingTeam);
                                }}
                                className="inline-flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
                                disabled={!canManageTeams}
                            >
                                <Trash2 className="h-4 w-4" />
                                Delete team
                            </button>
                            <div className="flex items-center gap-3">
                            <button
                                onClick={closeEditTeamModal}
                                className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveTeam}
                                disabled={savingTeam || !editTeamName.trim() || !canManageTeams}
                                className="px-6 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                            >
                                {savingTeam && <Loader2 className="w-4 h-4 animate-spin" />}
                                Save changes
                            </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Team Confirmation Modal */}
            {showDeleteTeamConfirm && teamToDelete && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
                        <div className="p-6">
                            <div className="flex items-center gap-4 mb-4">
                                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                                    <Trash2 className="w-6 h-6 text-red-600" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900">Delete team</h3>
                                    <p className="text-gray-500">This action cannot be undone.</p>
                                </div>
                            </div>
                            <p className="text-gray-600 mb-6">
                                Are you sure you want to delete the team <strong>&quot;{teamToDelete.name}&quot;</strong>? 
                                Members will lose access to collections assigned only to this team.
                            </p>
                            <div className="flex items-center justify-end gap-3">
                                <button
                                    onClick={() => {
                                        setShowDeleteTeamConfirm(false);
                                        setTeamToDelete(null);
                                    }}
                                    className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleDeleteTeam}
                                    disabled={deletingTeam || !canManageTeams}
                                    className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                                >
                                    {deletingTeam && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Delete team
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
