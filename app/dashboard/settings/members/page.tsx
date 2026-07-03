'use client';

import React, { useEffect, useState } from 'react';
import { useSupabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import {
    Check,
    ChevronDown,
    Copy,
    Eye,
    EyeOff,
    Edit2,
    HelpCircle,
    Link2,
    Loader2,
    Mail,
    Trash2,
    X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
    canManageWorkspace,
    normalizeWorkspaceRole,
    resolveCurrentWorkspace,
    workspaceRoleDescriptions,
    workspaceRoleLabels,
    type InvitableWorkspaceRole,
    type WorkspaceContext,
    type WorkspaceRole,
} from '@/lib/workspace/context';

interface Member {
    id: string;
    membership_id: string;
    user_id?: string | null;
    email: string;
    display_name?: string;
    avatar_url?: string;
    role: WorkspaceRole;
    joined_at: string;
    status: 'active' | 'pending' | 'invited';
}

function RoleDropdown({
    value,
    onChange,
    name = 'role-selection',
}: {
    value: InvitableWorkspaceRole;
    onChange: (role: InvitableWorkspaceRole) => void;
    name?: string;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const ref = React.useRef<HTMLDivElement>(null);
    const options: InvitableWorkspaceRole[] = ['readonly', 'member', 'admin'];

    // Close on click outside using ref
    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-[#655ac9] focus:outline-none focus:ring-1 focus:ring-[#655ac9]"
            >
                <span className="font-medium">{workspaceRoleLabels[value].label}</span>
                <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute left-0 top-full z-10 mt-1 w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
                    <div className="flex flex-col">
                        {options.map((option, index) => (
                            <label
                                key={option}
                                className={`flex cursor-pointer items-start gap-4 p-4 transition-colors hover:bg-gray-50 max-[480px]:p-3 ${index !== options.length - 1 ? 'border-b border-gray-100' : ''
                                    }`}
                            >
                                <div className="flex-1">
                                    <div className="font-medium text-gray-900">{workspaceRoleLabels[option].label}</div>
                                    <div className="mt-0.5 text-xs tracking-tight text-gray-500 leading-snug">
                                        {workspaceRoleDescriptions[option]}
                                    </div>
                                </div>
                                <div className="flex h-5 items-center justify-center">
                                    <input
                                        type="radio"
                                        name={name}
                                        value={option}
                                        checked={value === option}
                                        onChange={() => {
                                            onChange(option);
                                            setIsOpen(false);
                                        }}
                                        className="h-5 w-5 appearance-none rounded-full border-2 border-gray-400 checked:border-4 checked:border-[#8b7ff0] focus:outline-none cursor-pointer"
                                        style={{ backgroundColor: value === option ? '#fff' : 'transparent' }}
                                    />
                                </div>
                            </label>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

interface Invitation {
    id: string;
    workspace_id?: string;
    email?: string;
    role: InvitableWorkspaceRole;
    type: 'email' | 'link';
    link_code?: string;
    password?: string;
    canvas_ids?: string[];
    max_uses?: number;
    uses: number;
    email_domain?: string;
    expires_at?: string;
    created_at: string;
}

interface WorkspaceMemberRow {
    id: string;
    member_user_id: string | null;
    member_email: string;
    role: string;
    status: Member['status'] | null;
    joined_at: string | null;
    created_at: string;
}

interface WorkspaceInvitationRow {
    id: string;
    workspace_id?: string;
    email?: string;
    role: string;
    type: Invitation['type'];
    link_code?: string;
    password?: string | null;
    canvas_ids?: string[] | null;
    max_uses?: number | null;
    uses?: number | null;
    email_domain?: string;
    expires_at?: string;
    created_at: string;
}

interface WorkspaceCanvasOption {
    id: string;
    title: string;
    layout: string | null;
}

export default function MembersPage() {
    const { supabase } = useSupabase();
    const [loading, setLoading] = useState(true);
    const [members, setMembers] = useState<Member[]>([]);
    const [pendingInvitations, setPendingInvitations] = useState<Invitation[]>([]);
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [workspaceContext, setWorkspaceContext] = useState<WorkspaceContext | null>(null);

    const [showInviteLinkModal, setShowInviteLinkModal] = useState(false);
    const [inviteLinkRole, setInviteLinkRole] = useState<InvitableWorkspaceRole>('member');
    const [inviteLinkEmailDomain, setInviteLinkEmailDomain] = useState('');
    const [restrictToDomain, setRestrictToDomain] = useState(false);
    const [requirePassword, setRequirePassword] = useState(false);
    const [generatedPassword, setGeneratedPassword] = useState('');
    const [restrictToCanvases, setRestrictToCanvases] = useState(false);
    const [showCanvasPicker, setShowCanvasPicker] = useState(false);
    const [selectedCanvasIds, setSelectedCanvasIds] = useState<string[]>([]);
    const [workspaceCanvasOptions, setWorkspaceCanvasOptions] = useState<WorkspaceCanvasOption[]>([]);
    const [loadingCanvasOptions, setLoadingCanvasOptions] = useState(false);
    const [creatingLink, setCreatingLink] = useState(false);
    const [generatedLink, setGeneratedLink] = useState('');
    const [linkCopied, setLinkCopied] = useState(false);

    const [showUpdateInvitationModal, setShowUpdateInvitationModal] = useState(false);
    const [updatingInvitationId, setUpdatingInvitationId] = useState<string | null>(null);
    const [updatingInvitationType, setUpdatingInvitationType] = useState<Invitation['type'] | null>(null);
    const [updateLinkRole, setUpdateLinkRole] = useState<InvitableWorkspaceRole>('member');
    const [updateLinkRestrictDomain, setUpdateLinkRestrictDomain] = useState(false);
    const [updateLinkEmailDomain, setUpdateLinkEmailDomain] = useState('');
    const [updateInvitationRestrictToCanvases, setUpdateInvitationRestrictToCanvases] = useState(false);
    const [updateInvitationCanvasIds, setUpdateInvitationCanvasIds] = useState<string[]>([]);
    const [showUpdateInvitationCanvasPicker, setShowUpdateInvitationCanvasPicker] = useState(false);
    const [updatingLink, setUpdatingLink] = useState(false);

    const [showInviteUserModal, setShowInviteUserModal] = useState(false);
    const [inviteEmails, setInviteEmails] = useState('');
    const [inviteUserRole, setInviteUserRole] = useState<InvitableWorkspaceRole>('member');
    const [restrictInviteUsersToCanvases, setRestrictInviteUsersToCanvases] = useState(false);
    const [inviteUserCanvasIds, setInviteUserCanvasIds] = useState<string[]>([]);
    const [showInviteUserCanvasPicker, setShowInviteUserCanvasPicker] = useState(false);
    const [invitingUser, setInvitingUser] = useState(false);
    const [editingMember, setEditingMember] = useState<Member | null>(null);
    const [editingRole, setEditingRole] = useState<InvitableWorkspaceRole>('member');
    const [savingRole, setSavingRole] = useState(false);
    const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
    const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});

    const canManageMembers = !!currentUser && (!workspaceContext || canManageWorkspace(workspaceContext?.role));
    const visibleMembers = members.length > 0
        ? members
        : currentUser
            ? [{
                id: currentUser.id,
                membership_id: currentUser.id,
                user_id: currentUser.id,
                email: currentUser.email || '',
                display_name: currentUser.user_metadata?.display_name || currentUser.email?.split('@')[0],
                avatar_url: currentUser.user_metadata?.avatar_url,
                role: 'owner' as WorkspaceRole,
                joined_at: currentUser.created_at || new Date().toISOString(),
                status: 'active' as const,
            }]
            : [];

    useEffect(() => {
        void loadMembers();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loadMembers = async () => {
        try {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            setCurrentUser(user);

            const resolvedWorkspace = await resolveCurrentWorkspace(supabase, user);
            setWorkspaceContext(resolvedWorkspace);

            if (!resolvedWorkspace) {
                setMembers([
                    {
                        id: user.id,
                        membership_id: user.id,
                        user_id: user.id,
                        email: user.email || '',
                        display_name: user.user_metadata?.display_name || user.email?.split('@')[0],
                        avatar_url: user.user_metadata?.avatar_url,
                        role: 'owner',
                        joined_at: user.created_at,
                        status: 'active',
                    },
                ]);
                setPendingInvitations([]);
                return;
            }

            const { data: workspaceMembers, error } = await supabase
                .from('workspace_members')
                .select('id, member_user_id, member_email, role, status, joined_at, created_at')
                .eq('workspace_id', resolvedWorkspace.workspaceId)
                .order('created_at', { ascending: true });

            if (error && error.code !== 'PGRST116') {
                console.error('Error loading members:', error);
            }

            if (!workspaceMembers || workspaceMembers.length === 0) {
                setMembers([
                    {
                        id: user.id,
                        membership_id: user.id,
                        user_id: user.id,
                        email: user.email || '',
                        display_name: user.user_metadata?.display_name || user.email?.split('@')[0],
                        avatar_url: user.user_metadata?.avatar_url,
                        role: 'owner',
                        joined_at: user.created_at,
                        status: 'active',
                    },
                ]);
            } else {
                setMembers(workspaceMembers.map((m: WorkspaceMemberRow) => ({
                    id: m.member_user_id || m.id,
                    membership_id: m.id,
                    user_id: m.member_user_id,
                    email: m.member_email,
                    display_name: m.member_user_id === user.id
                        ? user.user_metadata?.display_name || user.email?.split('@')[0]
                        : m.member_email?.split('@')[0],
                    avatar_url: m.member_user_id === user.id ? user.user_metadata?.avatar_url : undefined,
                    role: normalizeWorkspaceRole(m.role),
                    joined_at: m.joined_at || m.created_at,
                    status: m.status || 'active',
                })));
            }

            const { data: invitations } = await supabase
                .from('workspace_invitations')
                .select('*')
                .eq('workspace_id', resolvedWorkspace.workspaceId)
                .is('redeemed_at', null)
                .order('created_at', { ascending: false });

            if (invitations) {
                setPendingInvitations(invitations.map((inv: WorkspaceInvitationRow) => ({
                    id: inv.id,
                    workspace_id: inv.workspace_id,
                    email: inv.email,
                    role: normalizeWorkspaceRole(inv.role) as InvitableWorkspaceRole,
                    type: inv.type,
                    link_code: inv.link_code,
                    password: inv.password ?? undefined,
                    canvas_ids: inv.canvas_ids ?? undefined,
                    max_uses: inv.max_uses ?? undefined,
                    uses: inv.uses || 0,
                    email_domain: inv.email_domain,
                    expires_at: inv.expires_at,
                    created_at: inv.created_at,
                })));
            }
        } catch (err) {
            console.error('Error loading members:', err);
        } finally {
            setLoading(false);
        }
    };

    const openEditRoleModal = (member: Member) => {
        setEditingMember(member);
        setEditingRole(member.role === 'owner' ? 'member' : member.role);
    };

    const closeEditRoleModal = () => {
        setEditingMember(null);
        setEditingRole('member');
    };

    const handleUpdateMemberRole = async () => {
        if (!editingMember || !workspaceContext) return;

        try {
            setSavingRole(true);
            const { error } = await supabase
                .from('workspace_members')
                .update({ role: editingRole, updated_at: new Date().toISOString() })
                .eq('id', editingMember.membership_id)
                .eq('workspace_id', workspaceContext.workspaceId);

            if (error) {
                console.error('Error updating member role:', error);
                toast.error(error.message || 'Failed to update member role');
                return;
            }

            setMembers((prev) =>
                prev.map((member) =>
                    member.membership_id === editingMember.membership_id
                        ? { ...member, role: editingRole }
                        : member,
                ),
            );
            closeEditRoleModal();
            toast.success('Member role updated');
        } catch (err) {
            console.error('Error updating member role:', err);
            toast.error('Failed to update member role');
        } finally {
            setSavingRole(false);
        }
    };

    const handleRemoveMember = async (member: Member) => {
        if (!workspaceContext) return;
        if (member.role === 'owner') {
            toast.error('The workspace owner cannot be removed');
            return;
        }
        if (!window.confirm(`Remove ${member.email} from this workspace?`)) {
            return;
        }

        try {
            setRemovingMemberId(member.membership_id);
            const { error } = await supabase
                .from('workspace_members')
                .delete()
                .eq('id', member.membership_id)
                .eq('workspace_id', workspaceContext.workspaceId);

            if (error) {
                console.error('Error removing member:', error);
                toast.error(error.message || 'Failed to remove member');
                return;
            }

            setMembers((prev) => prev.filter((item) => item.membership_id !== member.membership_id));
            toast.success('Member removed');
        } catch (err) {
            console.error('Error removing member:', err);
            toast.error('Failed to remove member');
        } finally {
            setRemovingMemberId(null);
        }
    };

    const generateInvitationPassword = () =>
        Math.random().toString(36).substring(2, 10);

    const getCanvasTypeLabel = (layout?: string | null) => {
        const normalized = (layout || '').toLowerCase();
        if (normalized.includes('map')) return 'Map Canvas';
        if (normalized.includes('freeform')) return 'Freeform Canvas';
        if (normalized.includes('timeline')) return 'Timeline Canvas';
        if (normalized.includes('drawing')) return 'Drawing Canvas';
        if (normalized.includes('gantt')) return 'Gantt Canvas';
        if (normalized.includes('kanban')) return 'Kanban Canvas';
        if (normalized.includes('column')) return 'Column Canvas';
        if (normalized.includes('wall')) return 'Wall Canvas';
        if (normalized.includes('row') || normalized.includes('grid') || normalized.includes('table')) return 'Grid/Row Canvas';
        if (normalized.includes('schedule') || normalized.includes('calendar')) return 'Scheduler Canvas';

        const cleaned = (layout || 'Canvas')
            .replace(/[_-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const titled = cleaned.length > 0
            ? cleaned
                .split(' ')
                .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
                .join(' ')
            : 'Canvas';

        return titled.toLowerCase().endsWith('canvas') ? titled : `${titled} Canvas`;
    };

    const groupedCanvasOptions = workspaceCanvasOptions.reduce<Record<string, WorkspaceCanvasOption[]>>((acc, canvas) => {
        const group = getCanvasTypeLabel(canvas.layout);
        if (!acc[group]) {
            acc[group] = [];
        }
        acc[group].push(canvas);
        return acc;
    }, {});

    const toggleCanvasSelection = (canvasId: string) => {
        setSelectedCanvasIds((prev) =>
            prev.includes(canvasId)
                ? prev.filter((id) => id !== canvasId)
                : [...prev, canvasId],
        );
    };

    const loadWorkspaceCanvases = async () => {
        try {
            setLoadingCanvasOptions(true);
            let wsId = workspaceContext?.workspaceId ?? null;
            let user = currentUser;

            if (!user) {
                const { data: authData } = await supabase.auth.getUser();
                user = authData.user;
                if (user) {
                    setCurrentUser(user);
                }
            }

            if (!wsId && user) {
                const resolvedWorkspace = await resolveCurrentWorkspace(supabase, user);
                if (resolvedWorkspace) {
                    wsId = resolvedWorkspace.workspaceId;
                    setWorkspaceContext((prev) => prev ?? resolvedWorkspace);
                }
            }

            if (!wsId) {
                setWorkspaceCanvasOptions([]);
                return;
            }

            const { data, error } = await supabase
                .from('boards')
                .select('id, title, layout')
                .eq('workspace_id', wsId)
                .is('deleted_at', null)
                .order('updated_at', { ascending: false });

            if (error) {
                console.error('Error loading workspace canvases:', error);
                setWorkspaceCanvasOptions([]);
                return;
            }

            const options = (data || []).map((canvas: { id: string; title?: string | null; layout?: string | null }) => ({
                id: canvas.id,
                title: canvas.title || 'Untitled canvas',
                layout: canvas.layout || null,
            }));
            setWorkspaceCanvasOptions(options);
        } catch (err) {
            console.error('Error loading workspace canvases:', err);
            setWorkspaceCanvasOptions([]);
        } finally {
            setLoadingCanvasOptions(false);
        }
    };

    const handleCreateInviteLink = async () => {
        if (!canManageMembers) {
            toast.error('You do not have permission to manage invitations');
            return;
        }

        try {
            setCreatingLink(true);
            const invitationPassword = requirePassword
                ? (generatedPassword.trim() || generateInvitationPassword())
                : '';
            if (requirePassword && !generatedPassword.trim()) {
                setGeneratedPassword(invitationPassword);
            }

            // Call server-side API route which uses the service role key
            // to bypass all RLS and client-side auth issues
            const { data: { session } } = await supabase.auth.getSession();
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };
            if (session?.access_token) {
                headers['Authorization'] = `Bearer ${session.access_token}`;
            }

            const res = await fetch('/api/invitations/create-link', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    role: inviteLinkRole,
                    email_domain: restrictToDomain ? inviteLinkEmailDomain : null,
                    password: requirePassword ? (invitationPassword || null) : null,
                    canvas_ids: restrictToCanvases && selectedCanvasIds.length > 0 ? selectedCanvasIds : null,
                }),
            });

            const result = await res.json();

            if (!res.ok) {
                toast.error(result.error || 'Failed to create invite link');
                return;
            }

            const { invitation, workspace_id: wsId } = result;
            const inviteLink = `${window.location.origin}/invite/${invitation.link_code}`;

            // Update workspace context if we didn't have one
            if (!workspaceContext && wsId) {
                setWorkspaceContext({
                    workspaceId: wsId,
                    ownerUserId: currentUser?.id ?? null,
                    role: 'owner',
                    workspaceName: 'My Workspace',
                    workspaceLogo: null,
                });
            }

            setGeneratedLink(inviteLink);
            setPendingInvitations((prev) => [
                {
                    id: invitation.id,
                    workspace_id: wsId,
                    role: normalizeWorkspaceRole(invitation.role) as InvitableWorkspaceRole,
                    type: 'link',
                    link_code: invitation.link_code,
                    password: invitation.password || undefined,
                    canvas_ids: invitation.canvas_ids || undefined,
                    max_uses: invitation.max_uses ?? undefined,
                    uses: invitation.uses || 0,
                    email_domain: invitation.email_domain || undefined,
                    created_at: invitation.created_at,
                },
                ...prev,
            ]);
            toast.success('Invite link created successfully!');
        } catch (err) {
            console.error('Error creating invite link:', err);
            toast.error('Failed to create invite link');
        } finally {
            setCreatingLink(false);
        }
    };

    const copyGeneratedLink = async () => {
        try {
            await navigator.clipboard.writeText(generatedLink);
            setLinkCopied(true);
            toast.success('Link copied to clipboard');
            setTimeout(() => setLinkCopied(false), 2000);
        } catch {
            toast.error('Failed to copy link');
        }
    };

    const copyInvitationPassword = async (password?: string) => {
        if (!password) return;

        try {
            await navigator.clipboard.writeText(password);
            toast.success('Password copied to clipboard');
        } catch {
            toast.error('Failed to copy password');
        }
    };

    const toggleInvitationPassword = (invitationId: string) => {
        setRevealedPasswords((prev) => ({
            ...prev,
            [invitationId]: !prev[invitationId],
        }));
    };

    const getMaskedPassword = (password: string) => {
        const visiblePart = password.slice(0, 3);
        const maskedPart = '*'.repeat(Math.max(password.length - 3, 0));
        return `${visiblePart}${maskedPart}`;
    };

    const handleInviteUser = async () => {
        if (!canManageMembers) {
            toast.error('You do not have permission to invite users');
            return;
        }

        if (!inviteEmails.trim()) return;

        try {
            setInvitingUser(true);

            const emails = inviteEmails
                .split(/[,\n]/)
                .map((entry) => entry.trim().toLowerCase())
                .filter((entry) => entry && entry.includes('@'));

            if (emails.length === 0) {
                toast.error('Please enter valid email addresses');
                return;
            }

            const { data: { session } } = await supabase.auth.getSession();
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
            };
            if (session?.access_token) {
                headers['Authorization'] = `Bearer ${session.access_token}`;
            }

            const res = await fetch('/api/invitations/invite-users', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    emails,
                    role: inviteUserRole,
                    canvas_ids: restrictInviteUsersToCanvases && inviteUserCanvasIds.length > 0 ? inviteUserCanvasIds : null,
                }),
            });

            const result = await res.json();

            if (!res.ok) {
                toast.error(result.error || 'Failed to save invitations');
                return;
            }

            const insertedInvitations = result.invitations as Array<{
                id: string;
                workspace_id?: string;
                email?: string;
                role: string;
                type: 'email' | 'link';
                canvas_ids?: string[] | null;
                uses?: number;
                created_at: string;
            }> | null;

            if (!insertedInvitations || insertedInvitations.length === 0) {
                toast.error('No invitations were saved');
                return;
            }

            if (!workspaceContext && result.workspace_id) {
                setWorkspaceContext({
                    workspaceId: result.workspace_id,
                    ownerUserId: currentUser?.id ?? null,
                    role: 'owner',
                    workspaceName: 'My Workspace',
                    workspaceLogo: null,
                });
            }

            setPendingInvitations((prev) => [
                ...insertedInvitations.map((inv) => ({
                    id: inv.id,
                    workspace_id: inv.workspace_id,
                    email: inv.email,
                    role: normalizeWorkspaceRole(inv.role) as InvitableWorkspaceRole,
                    type: inv.type as Invitation['type'],
                    canvas_ids: inv.canvas_ids || undefined,
                    uses: inv.uses || 0,
                    created_at: inv.created_at,
                })),
                ...prev,
            ]);

            toast.success(`Invitation${emails.length > 1 ? 's' : ''} sent to ${emails.length} user${emails.length > 1 ? 's' : ''}`);
            setInviteEmails('');
            setRestrictInviteUsersToCanvases(false);
            setInviteUserCanvasIds([]);
            setShowInviteUserCanvasPicker(false);
            setShowInviteUserModal(false);
        } catch (err) {
            console.error('Error inviting users:', err);
            toast.error('Failed to send invitations');
        } finally {
            setInvitingUser(false);
        }
    };

    const handleUpdateInvitation = async () => {
        if (!canManageMembers) {
            toast.error('You do not have permission to manage invitations');
            return;
        }

        if (!updatingInvitationId) return;
        const isLinkInvitation = updatingInvitationType === 'link';
        const nextCanvasIds = updateInvitationRestrictToCanvases && updateInvitationCanvasIds.length > 0
            ? updateInvitationCanvasIds
            : null;

        try {
            setUpdatingLink(true);

            if (workspaceContext) {
                const { error } = await supabase
                    .from('workspace_invitations')
                    .update({
                        role: updateLinkRole,
                        email_domain: isLinkInvitation && updateLinkRestrictDomain ? updateLinkEmailDomain : null,
                        canvas_ids: nextCanvasIds,
                    })
                    .eq('id', updatingInvitationId);

                if (error) {
                    console.error('Error updating invitation:', error);
                    toast.error('Failed to update invitation');
                    return;
                }
            }

            setPendingInvitations((prev) =>
                prev.map((inv) =>
                    inv.id === updatingInvitationId
                        ? {
                            ...inv,
                            role: updateLinkRole,
                            email_domain: isLinkInvitation && updateLinkRestrictDomain ? updateLinkEmailDomain : undefined,
                            canvas_ids: nextCanvasIds || undefined,
                        }
                        : inv
                )
            );

            toast.success('Invitation updated successfully');
            setShowUpdateInvitationModal(false);
            setUpdatingInvitationId(null);
            setUpdatingInvitationType(null);
            setUpdateInvitationRestrictToCanvases(false);
            setUpdateInvitationCanvasIds([]);
            setShowUpdateInvitationCanvasPicker(false);
        } catch (err) {
            console.error('Error updating invitation:', err);
            toast.error('Failed to update invitation');
        } finally {
            setUpdatingLink(false);
        }
    };

    const openUpdateInvitationModal = (invitation: Invitation) => {
        if (!canManageMembers) {
            return;
        }
        setUpdatingInvitationId(invitation.id);
        setUpdatingInvitationType(invitation.type);
        setUpdateLinkRole(invitation.role);
        setUpdateLinkRestrictDomain(invitation.type === 'link' && !!invitation.email_domain);
        setUpdateLinkEmailDomain(invitation.email_domain || '');
        setUpdateInvitationRestrictToCanvases(!!(invitation.canvas_ids && invitation.canvas_ids.length > 0));
        setUpdateInvitationCanvasIds(invitation.canvas_ids || []);
        setShowUpdateInvitationCanvasPicker(false);
        if (workspaceCanvasOptions.length === 0) {
            void loadWorkspaceCanvases();
        }
        setShowUpdateInvitationModal(true);
    };

    const revokeInvitation = async (invitation: Invitation) => {
        if (!canManageMembers) {
            toast.error('You do not have permission to manage invitations');
            return;
        }

        const confirmationMessage = invitation.type === 'link'
            ? 'Delete this invite link?'
            : `Revoke invitation for ${invitation.email}?`;
        if (!window.confirm(confirmationMessage)) {
            return;
        }

        try {
            const { error } = await supabase
                .from('workspace_invitations')
                .delete()
                .eq('id', invitation.id);

            if (error) {
                toast.error(error.message || 'Failed to remove invitation');
                return;
            }

            setPendingInvitations((prev) => prev.filter((item) => item.id !== invitation.id));
            toast.success(invitation.type === 'link' ? 'Invite link deleted' : 'Invitation revoked');
        } catch (err) {
            console.error('Error revoking invitation:', err);
            toast.error('Failed to revoke invitation');
        }
    };

    const resendInvitation = async (invitation: Invitation) => {
        if (invitation.type !== 'email' || !invitation.email) return;
        toast.success(`Invitation resent to ${invitation.email}`);
    };

    const copyInvitationLink = async (invitation: Invitation) => {
        if (!invitation.link_code) return;
        const link = `${window.location.origin}/invite/${invitation.link_code}`;
        await navigator.clipboard.writeText(link);
        toast.success('Link copied to clipboard');
    };

    const getInitials = (member: Member) => {
        if (member.display_name) {
            return member.display_name.split(' ').map((part) => part[0]).join('').toUpperCase().slice(0, 2);
        }
        return member.email.slice(0, 2).toUpperCase();
    };

    const getRolePillClassName = (role: WorkspaceRole) => {
        switch (role) {
            case 'owner':
                return 'bg-[#ffe4b5] text-[#d97706]';
            case 'admin':
                return 'bg-[#befad1] text-[#12a150]';
            case 'member':
                return 'bg-[#dbeafe] text-[#1d4ed8]';
            case 'readonly':
                return 'bg-gray-100 text-gray-700';
        }
    };

    const closeInviteLinkModal = () => {
        setShowInviteLinkModal(false);
        setGeneratedLink('');
        setLinkCopied(false);
        setInviteLinkRole('member');
        setRestrictToDomain(false);
        setInviteLinkEmailDomain('');
        setRequirePassword(false);
        setGeneratedPassword('');
        setRestrictToCanvases(false);
        setShowCanvasPicker(false);
        setSelectedCanvasIds([]);
    };

    const closeInviteUserModal = () => {
        setShowInviteUserModal(false);
        setInviteEmails('');
        setInviteUserRole('member');
    };

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
        );
    }

    return (
        <div>
            <div className="mb-10 flex items-center justify-between">
                <h1 className="text-[28px] font-bold text-[#1f165a]">Members</h1>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => {
                            if (!canManageMembers) {
                                return;
                            }
                            setShowInviteLinkModal(true);
                            setGeneratedLink('');
                            setLinkCopied(false);
                            setRequirePassword(false);
                            setGeneratedPassword('');
                            setRestrictToCanvases(false);
                            setShowCanvasPicker(false);
                            setSelectedCanvasIds([]);
                            void loadWorkspaceCanvases();
                        }}
                        className="flex items-center gap-2 rounded-lg border border-[#d6d4eb] px-4 py-2.5 text-sm font-medium text-[#655ac9] transition-colors hover:bg-gray-50 bg-white"
                        disabled={!canManageMembers}
                    >
                        <Link2 className="h-4 w-4" />
                        Create invite link
                    </button>
                    <button
                        onClick={() => {
                            if (!canManageMembers) {
                                return;
                            }
                            setShowInviteUserModal(true);
                        }}
                        className="flex items-center gap-2 rounded-lg bg-[#655ac9] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#584eb2]"
                        disabled={!canManageMembers}
                    >
                        <Mail className="h-4 w-4" />
                        Invite user
                    </button>
                </div>
            </div>

            <section className="mb-8 grid gap-6 border-b border-[#f0f0f5] pb-10 md:grid-cols-[280px_minmax(0,1fr)] md:items-start">
                <div>
                    <div className="flex items-center gap-2">
                        <h2 className="text-base font-semibold text-[#655ac9]">Pending invitations</h2>
                        <span className="flex min-w-[20px] items-center justify-center rounded-full bg-[#f4f3fb] px-1.5 py-0.5 text-xs font-semibold text-[#8b85cc]">
                            {pendingInvitations.length}
                        </span>
                    </div>
                    <p className="mt-2 max-w-[220px] text-sm text-gray-500">
                        You won&apos;t be billed for invited users until they redeem the invitation.
                    </p>
                </div>

                {pendingInvitations.length === 0 ? (
                    <div className="py-1 text-sm text-gray-500">
                        There aren&apos;t any pending invitations currently.
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-xl border border-[#ecebfa] bg-white">
                        <table className="w-full">
                            <thead className="bg-[#f6f5fd]">
                                <tr>
                                    <th className="px-5 py-3 text-left text-sm font-medium text-slate-600">Link</th>
                                    <th className="px-5 py-3 text-left text-sm font-medium text-slate-600">Password</th>
                                    <th className="px-5 py-3 text-left text-sm font-medium text-slate-600">Canvas access</th>
                                    <th className="px-5 py-3 text-left text-sm font-medium text-slate-600">Role</th>
                                    <th className="px-5 py-3 text-left text-sm font-medium text-slate-600">
                                        <div className="flex items-center gap-1.5 group relative cursor-help">
                                            Joined
                                            <HelpCircle className="h-4 w-4 text-slate-400" />
                                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 rounded bg-[#1e1e24] px-3 py-2 text-center text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 z-10 pointer-events-none">
                                                How many users joined through this invitation
                                                <div className="absolute -top-1 left-1/2 -translate-x-1/2 border-4 border-transparent border-b-[#1e1e24]" />
                                            </div>
                                        </div>
                                    </th>
                                    <th className="w-24 px-5 py-3" />
                                </tr>
                            </thead>
                            <tbody>
                                {pendingInvitations.map((invitation) => (
                                    <tr key={invitation.id} className="border-b border-[#ecebfa] last:border-b-0">
                                        <td className="px-5 py-4">
                                            {invitation.type === 'link' ? (
                                                <div className="flex w-fit items-center gap-2 rounded-lg bg-[#f6f5fd] px-4 py-2 text-sm">
                                                    <span className="max-w-[340px] truncate text-slate-600">
                                                        {window.location.origin}/invite/{invitation.link_code}
                                                    </span>
                                                    <button
                                                        onClick={() => copyInvitationLink(invitation)}
                                                        className="text-slate-500 transition-colors hover:text-slate-700"
                                                        title="Copy link"
                                                    >
                                                        <Copy className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-3">
                                                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                                                        <Mail className="h-5 w-5" />
                                                    </div>
                                                    <span className="font-medium text-slate-900">{invitation.email}</span>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-5 py-4">
                                            {invitation.type === 'link' && invitation.password ? (
                                                <div className="flex w-fit items-center gap-2 rounded-lg bg-[#f6f5fd] px-3 py-2 text-sm">
                                                    <span className="font-medium text-slate-700">
                                                        {revealedPasswords[invitation.id]
                                                            ? invitation.password
                                                            : getMaskedPassword(invitation.password)}
                                                    </span>
                                                    <button
                                                        onClick={() => toggleInvitationPassword(invitation.id)}
                                                        className="text-slate-500 transition-colors hover:text-slate-700"
                                                        title={revealedPasswords[invitation.id] ? 'Hide password' : 'Show password'}
                                                    >
                                                        {revealedPasswords[invitation.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                    </button>
                                                    <button
                                                        onClick={() => copyInvitationPassword(invitation.password)}
                                                        className="text-slate-500 transition-colors hover:text-slate-700"
                                                        title="Copy password"
                                                    >
                                                        <Copy className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className="text-sm text-slate-400">No password</span>
                                            )}
                                        </td>
                                        <td className="px-5 py-4">
                                            {invitation.canvas_ids && invitation.canvas_ids.length > 0 ? (
                                                invitation.canvas_ids && invitation.canvas_ids.length > 0 ? (
                                                    <span className="text-sm text-slate-700">
                                                        {invitation.canvas_ids.length} selected
                                                    </span>
                                                ) : (
                                                    <span className="text-sm text-slate-400">All canvases</span>
                                                )
                                            ) : invitation.type === 'link' ? (
                                                <span className="text-sm text-slate-400">All canvases</span>
                                            ) : (
                                                <span className="text-sm text-slate-400">-</span>
                                            )}
                                        </td>
                                        <td className="px-5 py-4">
                                            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${getRolePillClassName(invitation.role)}`}>
                                                {workspaceRoleLabels[invitation.role].label.toLowerCase()}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4 text-sm text-slate-600">
                                            {invitation.uses}
                                            {invitation.max_uses === null || invitation.max_uses === undefined
                                                ? ' joined'
                                                : ` of ${invitation.max_uses}`}
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className="ml-auto grid w-[112px] grid-cols-[32px_32px_32px] items-center justify-items-center gap-2">
                                                <button
                                                    onClick={() => openUpdateInvitationModal(invitation)}
                                                    className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                                                    title="Update invitation"
                                                    disabled={!canManageMembers}
                                                >
                                                    <Edit2 className="h-4 w-4" />
                                                </button>
                                                {invitation.type === 'email' ? (
                                                    <button
                                                        onClick={() => resendInvitation(invitation)}
                                                        className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                                                        title="Resend invitation"
                                                    >
                                                        <Mail className="h-4 w-4" />
                                                    </button>
                                                ) : (
                                                    <span className="h-8 w-8" aria-hidden="true" />
                                                )}
                                                <button
                                                    onClick={() => revokeInvitation(invitation)}
                                                    className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                                                    title={invitation.type === 'link' ? 'Delete link' : 'Revoke invitation'}
                                                    disabled={!canManageMembers}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <section className="grid gap-6 md:grid-cols-[280px_minmax(0,1fr)] md:items-start">
                <div>
                    <div className="flex items-center gap-2">
                        <h2 className="text-base font-semibold text-[#655ac9]">Members</h2>
                        <span className="flex min-w-[20px] items-center justify-center rounded-full bg-[#f4f3fb] px-1.5 py-0.5 text-xs font-semibold text-[#8b85cc]">
                            {visibleMembers.length}
                        </span>
                    </div>
                    <p className="mt-2 max-w-[250px] text-sm text-gray-500">
                        You will be billed for each member at the end of your billing cycle. See invoices for details.
                    </p>
                </div>

                <div className="overflow-hidden rounded-xl border border-[#ecebfa] bg-white">
                    <table className="w-full">
                        <thead className="bg-[#f6f5fd]">
                            <tr>
                                <th className="px-5 py-3 text-left text-sm font-medium text-slate-600">
                                    <span className="inline-flex items-center gap-1.5">
                                        User
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
                                            <line x1="21" x2="3" y1="6" y2="6"></line>
                                            <line x1="15" x2="3" y1="12" y2="12"></line>
                                            <line x1="9" x2="3" y1="18" y2="18"></line>
                                        </svg>
                                    </span>
                                </th>
                                <th className="px-5 py-3 text-left text-sm font-medium text-slate-600">
                                    <span className="inline-flex items-center gap-1.5">
                                        Role
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400">
                                            <path d="M11 5h10"></path>
                                            <path d="M11 9h7"></path>
                                            <path d="M11 13h4"></path>
                                            <path d="m3 17 3 3 3-3"></path>
                                            <path d="M6 18V4"></path>
                                        </svg>
                                    </span>
                                </th>
                                <th className="w-28 px-5 py-3" />
                            </tr>
                        </thead>
                        <tbody>
                            {visibleMembers.map((member) => (
                                <tr key={member.membership_id} className="border-b border-gray-100 last:border-b-0">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            {member.avatar_url ? (
                                                <img
                                                    src={member.avatar_url}
                                                    alt={member.display_name || member.email}
                                                    className="h-11 w-11 rounded-full object-cover"
                                                />
                                            ) : (
                                                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#c04724] text-base font-semibold text-white">
                                                    {getInitials(member)}
                                                </div>
                                            )}
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="truncate font-semibold text-slate-900">
                                                        {member.display_name || member.email}
                                                    </span>
                                                    {member.user_id === currentUser?.id && (
                                                        <span className="rounded-full bg-[#655ac9] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                                                            You
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="truncate text-sm text-slate-500">{member.email}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${getRolePillClassName(member.role)}`}>
                                            {workspaceRoleLabels[member.role].label.toLowerCase()}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => member.role !== 'owner' && openEditRoleModal(member)}
                                                className="rounded-lg p-2 text-gray-300 transition-colors hover:bg-gray-100 hover:text-gray-500 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                                title="Edit role"
                                                disabled={!canManageMembers || member.role === 'owner'}
                                            >
                                                <Edit2 className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => member.role !== 'owner' && handleRemoveMember(member)}
                                                className="rounded-lg p-2 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                                title="Remove member"
                                                disabled={!canManageMembers || member.role === 'owner' || removingMemberId === member.membership_id}
                                            >
                                                {removingMemberId === member.membership_id ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Trash2 className="h-4 w-4" />
                                                )}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {showInviteLinkModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="mx-4 w-full max-w-md rounded-xl bg-white shadow-xl">
                        <div className="flex items-center justify-between p-6 pb-2">
                            <h2 className="text-xl font-bold text-[#1f165a]">Create invite link</h2>
                            <button onClick={closeInviteLinkModal} className="rounded-lg p-1 transition-colors hover:bg-gray-100">
                                <X className="h-5 w-5 text-gray-400" />
                            </button>
                        </div>
                        <div className="border-b border-[#f0f0f5] mx-6" />

                        <div className="space-y-6 flex flex-col p-6">
                            {!generatedLink ? (
                                <>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="mb-2 block text-sm font-medium text-slate-600">Role</label>
                                            <RoleDropdown value={inviteLinkRole} onChange={setInviteLinkRole} name="create-role" />
                                        </div>

                                        <div>
                                            <label className="flex items-center gap-3 cursor-pointer mt-4">
                                                <input
                                                    type="checkbox"
                                                    checked={restrictToDomain}
                                                    onChange={(e) => setRestrictToDomain(e.target.checked)}
                                                    className="h-4 w-4 rounded border-gray-300 text-[#655ac9] focus:ring-[#655ac9]"
                                                />
                                                <span className="text-sm text-gray-600">Restrict to a specific email domain</span>
                                            </label>

                                            {restrictToDomain && (
                                                <div className="mt-3">
                                                    <input
                                                        type="text"
                                                        value={inviteLinkEmailDomain}
                                                        onChange={(e) => setInviteLinkEmailDomain(e.target.value)}
                                                        placeholder="company.com"
                                                        className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-[#655ac9] focus:outline-none focus:ring-1 focus:ring-[#655ac9]"
                                                    />
                                                </div>
                                            )}
                                        </div>

                                        <div className="rounded-2xl bg-[#f6f5fd] p-4">
                                            <label className="flex cursor-pointer items-center justify-between gap-3">
                                                <span className="text-sm font-medium text-slate-700">Require password</span>
                                                <input
                                                    type="checkbox"
                                                    checked={requirePassword}
                                                    onChange={(e) => {
                                                        const nextChecked = e.target.checked;
                                                        setRequirePassword(nextChecked);
                                                        if (nextChecked && !generatedPassword) {
                                                            setGeneratedPassword(generateInvitationPassword());
                                                        }
                                                        if (!nextChecked) {
                                                            setGeneratedPassword('');
                                                        }
                                                    }}
                                                    className="h-4 w-4 rounded border-gray-300 text-[#655ac9] focus:ring-[#655ac9]"
                                                />
                                            </label>

                                            {requirePassword && (
                                                <div className="mt-4 space-y-2">
                                                    <label className="block text-sm font-medium text-slate-600">Password</label>
                                                    <div className="flex gap-2">
                                                        <input
                                                            type="text"
                                                            value={generatedPassword}
                                                            onChange={(e) => setGeneratedPassword(e.target.value)}
                                                            className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-[#655ac9] focus:outline-none focus:ring-1 focus:ring-[#655ac9]"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => setGeneratedPassword(generateInvitationPassword())}
                                                            className="rounded-lg border border-[#d6d4eb] px-3 py-2 text-sm font-medium text-[#655ac9] transition-colors hover:bg-white"
                                                        >
                                                            Regenerate
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="rounded-2xl bg-[#f6f5fd] p-4">
                                            <label className="flex cursor-pointer items-center justify-between gap-3">
                                                <span className="text-sm font-medium text-slate-700">Restrict canvas access</span>
                                                <input
                                                    type="checkbox"
                                                    checked={restrictToCanvases}
                                                    onChange={(e) => {
                                                        const nextChecked = e.target.checked;
                                                        setRestrictToCanvases(nextChecked);
                                                        if (!nextChecked) {
                                                            setShowCanvasPicker(false);
                                                            setSelectedCanvasIds([]);
                                                        } else {
                                                            setShowCanvasPicker(true);
                                                            if (workspaceCanvasOptions.length === 0) {
                                                                void loadWorkspaceCanvases();
                                                            }
                                                        }
                                                    }}
                                                    className="h-4 w-4 rounded border-gray-300 text-[#655ac9] focus:ring-[#655ac9]"
                                                />
                                            </label>

                                            {restrictToCanvases && (
                                                <div className="mt-4 space-y-3">
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowCanvasPicker((prev) => !prev)}
                                                        className="flex w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-slate-700"
                                                    >
                                                        <span>
                                                            {selectedCanvasIds.length > 0
                                                                ? `${selectedCanvasIds.length} canvas${selectedCanvasIds.length === 1 ? '' : 'es'} selected`
                                                                : 'Select canvases'}
                                                        </span>
                                                        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${showCanvasPicker ? 'rotate-180' : ''}`} />
                                                    </button>

                                                    {showCanvasPicker && (
                                                        <div className="max-h-56 space-y-3 overflow-y-auto rounded-lg border border-gray-200 bg-white p-3">
                                                            {loadingCanvasOptions ? (
                                                                <div className="flex items-center gap-2 text-sm text-slate-500">
                                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                                    Loading canvases...
                                                                </div>
                                                            ) : workspaceCanvasOptions.length === 0 ? (
                                                                <p className="text-sm text-slate-500">No canvases found in this workspace.</p>
                                                            ) : (
                                                                Object.entries(groupedCanvasOptions).map(([groupName, canvases]) => (
                                                                    <div key={groupName}>
                                                                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                                                            {groupName}
                                                                        </p>
                                                                        <div className="space-y-1">
                                                                            {canvases.map((canvas) => (
                                                                                <label
                                                                                    key={canvas.id}
                                                                                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                                                                                >
                                                                                    <input
                                                                                        type="checkbox"
                                                                                        checked={selectedCanvasIds.includes(canvas.id)}
                                                                                        onChange={() => toggleCanvasSelection(canvas.id)}
                                                                                        className="h-4 w-4 rounded border-gray-300 text-[#655ac9] focus:ring-[#655ac9]"
                                                                                    />
                                                                                    <span className="truncate">{canvas.title}</span>
                                                                                </label>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                ))
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="space-y-4">
                                    <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                                        <div className="mb-2 flex items-center gap-2 text-green-700">
                                            <Check className="h-5 w-5" />
                                            <span className="font-medium">Invite link created!</span>
                                        </div>
                                        <p className="text-sm text-green-600">Share this link with the people you want to invite.</p>
                                    </div>

                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={generatedLink}
                                            readOnly
                                            className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-700"
                                        />
                                        <button
                                            onClick={copyGeneratedLink}
                                            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${linkCopied ? 'bg-green-100 text-green-700' : 'bg-[#655ac9] text-white hover:bg-[#584eb2]'
                                                }`}
                                        >
                                            {linkCopied ? (
                                                <>
                                                    <Check className="h-4 w-4" />
                                                    Copied
                                                </>
                                            ) : (
                                                <>
                                                    <Copy className="h-4 w-4" />
                                                    Copy
                                                </>
                                            )}
                                        </button>
                                    </div>

                                    {requirePassword && generatedPassword && (
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={generatedPassword}
                                                readOnly
                                                className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-700"
                                            />
                                            <button
                                                onClick={() => copyInvitationPassword(generatedPassword)}
                                                className="flex items-center gap-2 rounded-lg bg-[#655ac9] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#584eb2]"
                                            >
                                                <Copy className="h-4 w-4" />
                                                Copy password
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="flex items-center justify-end gap-3 p-6 pt-0">
                            <button
                                onClick={closeInviteLinkModal}
                                className="rounded-lg px-4 py-2 text-sm font-medium text-[#655ac9] transition-colors hover:bg-purple-50"
                            >
                                {generatedLink ? 'Done' : 'Cancel'}
                            </button>
                            {!generatedLink && (
                                <button
                                    onClick={handleCreateInviteLink}
                                    disabled={creatingLink || !canManageMembers}
                                    className="flex items-center gap-2 rounded-lg bg-[#9e27b0] px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-[#8e24aa] disabled:opacity-50"
                                    style={{ backgroundColor: '#8a2be2' }}
                                >
                                    {creatingLink && <Loader2 className="h-4 w-4 animate-spin" />}
                                    Create
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {showUpdateInvitationModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="mx-4 w-full max-w-md rounded-xl bg-white shadow-xl">
                        <div className="flex items-center justify-between p-6 pb-2">
                            <h2 className="text-xl font-bold text-[#1f165a]">Update invitation</h2>
                            <button
                                onClick={() => {
                                    setShowUpdateInvitationModal(false);
                                    setUpdatingInvitationId(null);
                                    setUpdatingInvitationType(null);
                                    setUpdateInvitationRestrictToCanvases(false);
                                    setUpdateInvitationCanvasIds([]);
                                    setShowUpdateInvitationCanvasPicker(false);
                                }}
                                className="rounded-lg p-1 transition-colors hover:bg-gray-100"
                            >
                                <X className="h-5 w-5 text-gray-400" />
                            </button>
                        </div>
                        <div className="border-b border-[#f0f0f5] mx-6" />

                        <div className="space-y-6 flex flex-col p-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="mb-2 block text-sm font-medium text-slate-600">Role</label>
                                    <RoleDropdown value={updateLinkRole} onChange={setUpdateLinkRole} name="update-role" />
                                </div>

                                {updatingInvitationType === 'link' && (
                                    <div>
                                        <label className="flex items-center gap-3 cursor-pointer mt-4">
                                            <input
                                                type="checkbox"
                                                checked={updateLinkRestrictDomain}
                                                onChange={(e) => setUpdateLinkRestrictDomain(e.target.checked)}
                                                className="h-4 w-4 rounded border-gray-300 text-[#655ac9] focus:ring-[#655ac9]"
                                            />
                                            <span className="text-sm text-gray-600">Restrict to a specific email domain</span>
                                        </label>

                                        {updateLinkRestrictDomain && (
                                            <div className="mt-3">
                                                <input
                                                    type="text"
                                                    value={updateLinkEmailDomain}
                                                    onChange={(e) => setUpdateLinkEmailDomain(e.target.value)}
                                                    placeholder="company.com"
                                                    className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-[#655ac9] focus:outline-none focus:ring-1 focus:ring-[#655ac9]"
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="rounded-2xl bg-[#f6f5fd] p-4">
                                    <label className="flex cursor-pointer items-center justify-between gap-3">
                                        <span className="text-sm font-medium text-slate-700">Restrict canvas access</span>
                                        <input
                                            type="checkbox"
                                            checked={updateInvitationRestrictToCanvases}
                                            onChange={(e) => {
                                                const nextChecked = e.target.checked;
                                                setUpdateInvitationRestrictToCanvases(nextChecked);
                                                if (!nextChecked) {
                                                    setShowUpdateInvitationCanvasPicker(false);
                                                    setUpdateInvitationCanvasIds([]);
                                                } else {
                                                    setShowUpdateInvitationCanvasPicker(true);
                                                    if (workspaceCanvasOptions.length === 0) {
                                                        void loadWorkspaceCanvases();
                                                    }
                                                }
                                            }}
                                            className="h-4 w-4 rounded border-gray-300 text-[#655ac9] focus:ring-[#655ac9]"
                                        />
                                    </label>

                                    {updateInvitationRestrictToCanvases && (
                                        <div className="mt-4 space-y-3">
                                            <button
                                                type="button"
                                                onClick={() => setShowUpdateInvitationCanvasPicker((prev) => !prev)}
                                                className="flex w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-slate-700"
                                            >
                                                <span>
                                                    {updateInvitationCanvasIds.length > 0
                                                        ? `${updateInvitationCanvasIds.length} canvas${updateInvitationCanvasIds.length === 1 ? '' : 'es'} selected`
                                                        : 'Select canvases'}
                                                </span>
                                                <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${showUpdateInvitationCanvasPicker ? 'rotate-180' : ''}`} />
                                            </button>

                                            {showUpdateInvitationCanvasPicker && (
                                                <div className="max-h-56 space-y-3 overflow-y-auto rounded-lg border border-gray-200 bg-white p-3">
                                                    {loadingCanvasOptions ? (
                                                        <div className="flex items-center gap-2 text-sm text-slate-500">
                                                            <Loader2 className="h-4 w-4 animate-spin" />
                                                            Loading canvases...
                                                        </div>
                                                    ) : workspaceCanvasOptions.length === 0 ? (
                                                        <p className="text-sm text-slate-500">No canvases found in this workspace.</p>
                                                    ) : (
                                                        Object.entries(groupedCanvasOptions).map(([groupName, canvases]) => (
                                                            <div key={groupName}>
                                                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                                                    {groupName}
                                                                </p>
                                                                <div className="space-y-1">
                                                                    {canvases.map((canvas) => (
                                                                        <label
                                                                            key={canvas.id}
                                                                            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                                                                        >
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={updateInvitationCanvasIds.includes(canvas.id)}
                                                                                onChange={() => setUpdateInvitationCanvasIds((prev) =>
                                                                                    prev.includes(canvas.id)
                                                                                        ? prev.filter((id) => id !== canvas.id)
                                                                                        : [...prev, canvas.id]
                                                                                )}
                                                                                className="h-4 w-4 rounded border-gray-300 text-[#655ac9] focus:ring-[#655ac9]"
                                                                            />
                                                                            <span className="truncate">{canvas.title}</span>
                                                                        </label>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 p-6 pt-0">
                            <button
                                onClick={() => {
                                    setShowUpdateInvitationModal(false);
                                    setUpdatingInvitationId(null);
                                    setUpdatingInvitationType(null);
                                    setUpdateInvitationRestrictToCanvases(false);
                                    setUpdateInvitationCanvasIds([]);
                                    setShowUpdateInvitationCanvasPicker(false);
                                }}
                                className="rounded-lg px-4 py-2 text-sm font-bold text-[#655ac9] transition-colors hover:bg-purple-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleUpdateInvitation}
                                disabled={updatingLink || !canManageMembers}
                                className="flex items-center gap-2 rounded-lg bg-[#655ac9] px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#584eb2] disabled:opacity-50"
                            >
                                {updatingLink && <Loader2 className="h-4 w-4 animate-spin" />}
                                Update
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showInviteUserModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="mx-4 w-full max-w-md rounded-xl bg-white shadow-xl">
                        <div className="flex items-center justify-between border-b border-gray-200 p-6">
                            <h2 className="text-xl font-semibold text-gray-900">Invite user</h2>
                            <button onClick={closeInviteUserModal} className="rounded-lg p-1 transition-colors hover:bg-gray-100">
                                <X className="h-5 w-5 text-gray-400" />
                            </button>
                        </div>

                        <div className="space-y-6 p-6">
                            <div>
                                <label className="mb-2 block text-sm font-medium text-gray-700">Email</label>
                                <input
                                    type="text"
                                    value={inviteEmails}
                                    onChange={(e) => setInviteEmails(e.target.value)}
                                    placeholder="Email(s) of the user(s) you want to invite"
                                    className="w-full rounded-lg border border-gray-200 px-4 py-3 font-sans focus:border-transparent focus:ring-2 focus:ring-purple-500"
                                />
                            </div>

                            <div>
                                <label className="mb-2 block text-sm font-medium text-gray-700">Role</label>
                                <div className="relative">
                                    <select
                                        value={inviteUserRole}
                                        onChange={(e) => setInviteUserRole(e.target.value as InvitableWorkspaceRole)}
                                        className="w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 font-sans text-gray-900 focus:border-transparent focus:ring-2 focus:ring-purple-500"
                                    >
                                        <option value="admin">admin</option>
                                        <option value="member">member</option>
                                        <option value="readonly">read only</option>
                                    </select>
                                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                                </div>
                                <p className="mt-2 text-sm text-gray-500">{workspaceRoleDescriptions[inviteUserRole]}</p>
                            </div>

                            <div className="rounded-2xl bg-[#f6f5fd] p-4">
                                <label className="flex cursor-pointer items-center justify-between gap-3">
                                    <span className="text-sm font-medium text-slate-700">Restrict canvas access</span>
                                    <input
                                        type="checkbox"
                                        checked={restrictInviteUsersToCanvases}
                                        onChange={(e) => {
                                            const nextChecked = e.target.checked;
                                            setRestrictInviteUsersToCanvases(nextChecked);
                                            if (!nextChecked) {
                                                setShowInviteUserCanvasPicker(false);
                                                setInviteUserCanvasIds([]);
                                            } else {
                                                setShowInviteUserCanvasPicker(true);
                                                if (workspaceCanvasOptions.length === 0) {
                                                    void loadWorkspaceCanvases();
                                                }
                                            }
                                        }}
                                        className="h-4 w-4 rounded border-gray-300 text-[#655ac9] focus:ring-[#655ac9]"
                                    />
                                </label>

                                {restrictInviteUsersToCanvases && (
                                    <div className="mt-4 space-y-3">
                                        <button
                                            type="button"
                                            onClick={() => setShowInviteUserCanvasPicker((prev) => !prev)}
                                            className="flex w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-slate-700"
                                        >
                                            <span>
                                                {inviteUserCanvasIds.length > 0
                                                    ? `${inviteUserCanvasIds.length} canvas${inviteUserCanvasIds.length === 1 ? '' : 'es'} selected`
                                                    : 'Select canvases'}
                                            </span>
                                            <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${showInviteUserCanvasPicker ? 'rotate-180' : ''}`} />
                                        </button>

                                        {showInviteUserCanvasPicker && (
                                            <div className="max-h-56 space-y-3 overflow-y-auto rounded-lg border border-gray-200 bg-white p-3">
                                                {loadingCanvasOptions ? (
                                                    <div className="flex items-center gap-2 text-sm text-slate-500">
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                        Loading canvases...
                                                    </div>
                                                ) : workspaceCanvasOptions.length === 0 ? (
                                                    <p className="text-sm text-slate-500">No canvases found in this workspace.</p>
                                                ) : (
                                                    Object.entries(groupedCanvasOptions).map(([groupName, canvases]) => (
                                                        <div key={groupName}>
                                                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                                                {groupName}
                                                            </p>
                                                            <div className="space-y-1">
                                                                {canvases.map((canvas) => (
                                                                    <label
                                                                        key={canvas.id}
                                                                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                                                                    >
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={inviteUserCanvasIds.includes(canvas.id)}
                                                                            onChange={() => setInviteUserCanvasIds((prev) =>
                                                                                prev.includes(canvas.id)
                                                                                    ? prev.filter((id) => id !== canvas.id)
                                                                                    : [...prev, canvas.id]
                                                                            )}
                                                                            className="h-4 w-4 rounded border-gray-300 text-[#655ac9] focus:ring-[#655ac9]"
                                                                        />
                                                                        <span className="truncate">{canvas.title}</span>
                                                                    </label>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 rounded-b-xl border-t border-gray-200 bg-gray-50 p-6">
                            <button
                                onClick={closeInviteUserModal}
                                className="rounded-lg px-4 py-2 text-sm font-medium text-purple-600 transition-colors hover:bg-purple-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleInviteUser}
                                disabled={invitingUser || !inviteEmails.trim() || !canManageMembers}
                                className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
                            >
                                {invitingUser && <Loader2 className="h-4 w-4 animate-spin" />}
                                Invite
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {editingMember && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="mx-4 w-full max-w-md rounded-xl bg-white shadow-xl">
                        <div className="flex items-center justify-between border-b border-gray-200 p-6">
                            <h2 className="text-xl font-semibold text-gray-900">Edit member role</h2>
                            <button onClick={closeEditRoleModal} className="rounded-lg p-1 transition-colors hover:bg-gray-100">
                                <X className="h-5 w-5 text-gray-400" />
                            </button>
                        </div>

                        <div className="space-y-6 p-6">
                            <div className="text-sm text-gray-600">
                                Updating role for <span className="font-medium text-gray-900">{editingMember.email}</span>
                            </div>

                            <div>
                                <label className="mb-2 block text-sm font-medium text-gray-700">Role</label>
                                <div className="relative">
                                    <select
                                        value={editingRole}
                                        onChange={(e) => setEditingRole(e.target.value as InvitableWorkspaceRole)}
                                        className="w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-purple-500"
                                    >
                                        <option value="admin">admin</option>
                                        <option value="member">member</option>
                                        <option value="readonly">read only</option>
                                    </select>
                                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                                </div>
                                <p className="mt-2 text-sm text-gray-500">{workspaceRoleDescriptions[editingRole]}</p>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 rounded-b-xl border-t border-gray-200 bg-gray-50 p-6">
                            <button
                                onClick={closeEditRoleModal}
                                className="rounded-lg px-4 py-2 text-sm font-medium text-purple-600 transition-colors hover:bg-purple-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleUpdateMemberRole}
                                disabled={savingRole || !canManageMembers}
                                className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
                            >
                                {savingRole && <Loader2 className="h-4 w-4 animate-spin" />}
                                Save role
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

