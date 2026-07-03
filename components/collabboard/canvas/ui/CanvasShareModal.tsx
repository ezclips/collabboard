"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { canManageWorkspace, workspaceRoleDescriptions, type InvitableWorkspaceRole, type WorkspaceRole } from '@/lib/workspace/context';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { Check, ChevronDown, Copy, Link2, Loader2, Mail, X } from 'lucide-react';
import { toast } from 'sonner';

interface CanvasShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  canvasId: string;
  canvasTitle: string;
  currentWorkspaceRole: WorkspaceRole | null;
}

type ShareTab = 'email' | 'link';

function generateInvitationPassword() {
  return Math.random().toString(36).substring(2, 10);
}

export default function CanvasShareModal({
  isOpen,
  onClose,
  canvasId,
  canvasTitle,
  currentWorkspaceRole,
}: CanvasShareModalProps) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const canManageShare = canManageWorkspace(currentWorkspaceRole);
  const [activeTab, setActiveTab] = useState<ShareTab>('email');
  const [inviteEmails, setInviteEmails] = useState('');
  const [inviteUserRole, setInviteUserRole] = useState<InvitableWorkspaceRole>('member');
  const [invitingUser, setInvitingUser] = useState(false);
  const [inviteLinkRole, setInviteLinkRole] = useState<InvitableWorkspaceRole>('member');
  const [restrictToDomain, setRestrictToDomain] = useState(false);
  const [inviteLinkEmailDomain, setInviteLinkEmailDomain] = useState('');
  const [requirePassword, setRequirePassword] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [creatingLink, setCreatingLink] = useState(false);
  const [generatedLink, setGeneratedLink] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab('email');
    setInviteEmails('');
    setInviteUserRole('member');
    setInviteLinkRole('member');
    setRestrictToDomain(false);
    setInviteLinkEmailDomain('');
    setRequirePassword(false);
    setGeneratedPassword('');
    setCreatingLink(false);
    setGeneratedLink('');
    setLinkCopied(false);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleInviteUser = async () => {
    if (!canManageShare) {
      toast.error('You do not have permission to invite users');
      return;
    }

    const emails = inviteEmails
      .split(/[,\n]/)
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry && entry.includes('@'));

    if (emails.length === 0) {
      toast.error('Please enter valid email addresses');
      return;
    }

    try {
      setInvitingUser(true);
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }

      const response = await fetch('/api/invitations/invite-users', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          emails,
          role: inviteUserRole,
          canvas_ids: [canvasId],
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        toast.error(result.error || 'Failed to send invitations');
        return;
      }

      toast.success(`Invitation${emails.length > 1 ? 's' : ''} sent`);
      onClose();
    } catch (error) {
      console.error('Error inviting users from canvas share modal:', error);
      toast.error('Failed to send invitations');
    } finally {
      setInvitingUser(false);
    }
  };

  const handleCreateInviteLink = async () => {
    if (!canManageShare) {
      toast.error('You do not have permission to create invite links');
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

      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }

      const response = await fetch('/api/invitations/create-link', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          role: inviteLinkRole,
          email_domain: restrictToDomain ? inviteLinkEmailDomain : null,
          password: requirePassword ? (invitationPassword || null) : null,
          canvas_ids: [canvasId],
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        toast.error(result.error || 'Failed to create invite link');
        return;
      }

      setGeneratedLink(`${window.location.origin}/invite/${result.invitation.link_code}`);
      toast.success('Invite link created');
    } catch (error) {
      console.error('Error creating invite link from canvas share modal:', error);
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
      window.setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const copyInvitationPassword = async () => {
    if (!generatedPassword) return;

    try {
      await navigator.clipboard.writeText(generatedPassword);
      toast.success('Password copied to clipboard');
    } catch {
      toast.error('Failed to copy password');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[3100] flex items-center justify-center bg-black/50 px-4" onMouseDown={onClose}>
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-5">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Share canvas</h2>
            <p className="mt-1 text-sm text-gray-500">Invite people directly to {canvasTitle}.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close share modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 px-6 py-6">
          <div className="rounded-2xl bg-[#f6f5fd] p-4">
            <p className="text-sm font-medium text-slate-700">Canvas access</p>
            <p className="mt-1 text-sm text-slate-600">This share flow is restricted to the current canvas.</p>
            <div className="mt-3 rounded-xl border border-[#dfdafb] bg-white px-3 py-2 text-sm text-slate-700">
              {canvasTitle}
            </div>
          </div>

          <div className="flex gap-2 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setActiveTab('email')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
                activeTab === 'email' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Mail className="h-4 w-4" />
              Email invite
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('link')}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
                activeTab === 'link' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Link2 className="h-4 w-4" />
              Invite link
            </button>
          </div>

          {!canManageShare ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Only workspace owners and admins can send invites or create links.
            </div>
          ) : null}

          {activeTab === 'email' ? (
            <div className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Email</label>
                <input
                  type="text"
                  value={inviteEmails}
                  onChange={(event) => setInviteEmails(event.target.value)}
                  placeholder="Email(s) of the user(s) you want to invite"
                  className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-900 focus:border-transparent focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">Role</label>
                <div className="relative">
                  <select
                    value={inviteUserRole}
                    onChange={(event) => setInviteUserRole(event.target.value as InvitableWorkspaceRole)}
                    className="w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 focus:border-transparent focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="admin">admin</option>
                    <option value="member">member</option>
                    <option value="readonly">read only</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                </div>
                <p className="mt-2 text-sm text-gray-500">{workspaceRoleDescriptions[inviteUserRole]}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {!generatedLink ? (
                <>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Role</label>
                    <div className="relative">
                      <select
                        value={inviteLinkRole}
                        onChange={(event) => setInviteLinkRole(event.target.value as InvitableWorkspaceRole)}
                        className="w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 focus:border-transparent focus:ring-2 focus:ring-purple-500"
                      >
                        <option value="admin">admin</option>
                        <option value="member">member</option>
                        <option value="readonly">read only</option>
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                    </div>
                    <p className="mt-2 text-sm text-gray-500">{workspaceRoleDescriptions[inviteLinkRole]}</p>
                  </div>

                  <label className="flex cursor-pointer items-center gap-3 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={restrictToDomain}
                      onChange={(event) => setRestrictToDomain(event.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-[#655ac9] focus:ring-[#655ac9]"
                    />
                    Restrict to a specific email domain
                  </label>

                  {restrictToDomain ? (
                    <input
                      type="text"
                      value={inviteLinkEmailDomain}
                      onChange={(event) => setInviteLinkEmailDomain(event.target.value)}
                      placeholder="company.com"
                      className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm text-gray-900 focus:border-transparent focus:ring-2 focus:ring-purple-500"
                    />
                  ) : null}

                  <label className="flex cursor-pointer items-center gap-3 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={requirePassword}
                      onChange={(event) => {
                        const nextChecked = event.target.checked;
                        setRequirePassword(nextChecked);
                        if (!nextChecked) {
                          setGeneratedPassword('');
                        }
                      }}
                      className="h-4 w-4 rounded border-gray-300 text-[#655ac9] focus:ring-[#655ac9]"
                    />
                    Protect the invite link with a password
                  </label>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                    <div className="mb-2 flex items-center gap-2 text-green-700">
                      <Check className="h-5 w-5" />
                      <span className="font-medium">Invite link created</span>
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
                      type="button"
                      onClick={copyGeneratedLink}
                      className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                        linkCopied ? 'bg-green-100 text-green-700' : 'bg-[#655ac9] text-white hover:bg-[#584eb2]'
                      }`}
                    >
                      {linkCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {linkCopied ? 'Copied' : 'Copy'}
                    </button>
                  </div>

                  {requirePassword && generatedPassword ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={generatedPassword}
                        readOnly
                        className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-700"
                      />
                      <button
                        type="button"
                        onClick={copyInvitationPassword}
                        className="flex items-center gap-2 rounded-lg bg-[#655ac9] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#584eb2]"
                      >
                        <Copy className="h-4 w-4" />
                        Copy password
                      </button>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-200 bg-gray-50 px-6 py-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-purple-600 transition-colors hover:bg-purple-50"
          >
            {activeTab === 'link' && generatedLink ? 'Done' : 'Cancel'}
          </button>
          {activeTab === 'email' ? (
            <button
              type="button"
              onClick={handleInviteUser}
              disabled={invitingUser || !inviteEmails.trim() || !canManageShare}
              className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
            >
              {invitingUser ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Invite
            </button>
          ) : !generatedLink ? (
            <button
              type="button"
              onClick={handleCreateInviteLink}
              disabled={creatingLink || !canManageShare}
              className="flex items-center gap-2 rounded-lg bg-[#8a2be2] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#7a24cb] disabled:opacity-50"
            >
              {creatingLink ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Create
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
