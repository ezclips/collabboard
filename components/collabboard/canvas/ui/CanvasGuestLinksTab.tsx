'use client';

/**
 * PATCH-365. The "Guest link" tab of Share canvas: create a /share guest link,
 * list this board's active links, copy / show QR / turn off.
 *
 * Mirrors CanvasPeopleTab: loads on mount, inline confirm (no browser confirm()),
 * errors shown and never swallowed. Creating uses the EXISTING POST /api/share-link.
 * The password is shown ONCE after creating -- the server only keeps its hash.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, QrCode } from 'lucide-react';
import { toast } from 'sonner';

import {
  GUEST_LINK_EXPIRY_OPTIONS,
  guestLinkExpiryLabel,
  guestLinkPermissionLabel,
  type GuestLink,
  type GuestLinkPermission,
} from '@/lib/domain/sharing/guestLinks';
import GuestLinkQrOverlay from './GuestLinkQrOverlay';
import GuestApprovalToggle from './GuestApprovalToggle';
import GuestNamesToggle from './GuestNamesToggle';

export interface CanvasGuestLinksTabProps {
  readonly canvasId: string;
  readonly canvasTitle: string;
}

const FORBIDDEN = 'Only the board owner can manage access.';
const PASSWORD_MIN = 4;
const PASSWORD_MAX = 128;

export default function CanvasGuestLinksTab({ canvasId, canvasTitle }: CanvasGuestLinksTabProps) {
  const [links, setLinks] = useState<readonly GuestLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState('');
  const [permission, setPermission] = useState<GuestLinkPermission>('edit');
  const [expiryIndex, setExpiryIndex] = useState(2); // 7 days
  const [passwordOn, setPasswordOn] = useState(false);
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [confirmOffId, setConfirmOffId] = useState<string | null>(null);
  const [turningOffId, setTurningOffId] = useState<string | null>(null);
  const [qrLink, setQrLink] = useState<GuestLink | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/boards/${canvasId}/share-links`);
    const body = await response.json().catch(() => ({}));
    if (response.status === 403) {
      setForbidden(true);
      setLinks([]);
      return;
    }
    if (!response.ok) {
      setError(typeof body?.error === 'string' && body.error ? body.error : 'Could not load guest links.');
      setLinks([]);
      return;
    }
    setLinks(Array.isArray(body?.links) ? (body.links as GuestLink[]) : []);
  }, [canvasId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void (async () => {
      try {
        await load();
      } catch {
        if (!cancelled) setError('Could not load guest links.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [load]);

  const create = async () => {
    if (creating) return;
    if (passwordOn && password.trim().length < PASSWORD_MIN) {
      setError(`The password needs at least ${PASSWORD_MIN} characters.`);
      return;
    }
    setCreating(true);
    setError('');
    setCreatedPassword(null);
    try {
      const days = GUEST_LINK_EXPIRY_OPTIONS[expiryIndex]?.days ?? null;
      const response = await fetch('/api/share-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boardId: canvasId,
          permission,
          shareTarget: 'board',
          expirationDays: days,
          password: passwordOn ? password.trim() : null,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof body?.error === 'string' && body.error ? body.error : 'Could not create the link.');
        return;
      }
      if (passwordOn && password.trim()) setCreatedPassword(password.trim());
      setPasswordOn(false);
      setPassword('');
      await load();
    } catch {
      setError('Could not create the link.');
    } finally {
      setCreating(false);
    }
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied to clipboard');
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const copyPassword = async () => {
    if (!createdPassword) return;
    try {
      await navigator.clipboard.writeText(createdPassword);
      toast.success('Password copied to clipboard');
    } catch {
      toast.error('Failed to copy password');
    }
  };

  const turnOff = async (linkId: string) => {
    setTurningOffId(linkId);
    setError('');
    try {
      const response = await fetch(`/api/boards/${canvasId}/share-links/${linkId}`, { method: 'DELETE' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof body?.error === 'string' && body.error ? body.error : 'Could not turn off this link.');
        return;
      }
      setLinks((current) => current.filter((link) => link.id !== linkId));
      setConfirmOffId(null);
    } catch {
      setError('Could not turn off this link.');
    } finally {
      setTurningOffId(null);
    }
  };

  if (loading) {
    return (
      <div data-guest-links="true" className="flex items-center gap-2 py-6 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading guest links…
      </div>
    );
  }

  if (forbidden) {
    return (
      <div data-guest-links="true" className="py-4">
        <p data-guest-link-error="true" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {FORBIDDEN}
        </p>
      </div>
    );
  }

  const now = new Date();

  return (
    <div data-guest-links="true" className="space-y-4">
      {/* PATCH-367. Self-sufficient: shows only to the board owner. */}
      <GuestApprovalToggle boardId={canvasId} />
      {/* PATCH-368. Under the approval toggle. */}
      <GuestNamesToggle boardId={canvasId} />

      {error ? (
        <p data-guest-link-error="true" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {createdPassword ? (
        <div className="space-y-1 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
          <p className="text-xs text-green-700">Password created — copy it now; it is not shown again.</p>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={createdPassword}
              data-guest-link-new-password="true"
              className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm text-gray-700"
            />
            <button
              type="button"
              onClick={() => void copyPassword()}
              className="rounded-lg bg-[#655ac9] px-3 py-1 text-xs font-medium text-white hover:bg-[#584eb2]"
            >
              Copy
            </button>
          </div>
        </div>
      ) : null}

      <div className="space-y-3 rounded-xl border border-gray-200 p-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Permission</label>
          <select
            data-guest-link-permission="true"
            value={permission}
            onChange={(event) => setPermission(event.target.value as GuestLinkPermission)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900"
          >
            <option value="view">Can view</option>
            <option value="comment">Can comment</option>
            <option value="edit">Can edit</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Expiry</label>
          <select
            data-guest-link-expiry="true"
            value={expiryIndex}
            onChange={(event) => setExpiryIndex(Number(event.target.value))}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900"
          >
            {GUEST_LINK_EXPIRY_OPTIONS.map((option, index) => (
              <option key={option.label} value={index}>{option.label}</option>
            ))}
          </select>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            data-guest-link-password-toggle="true"
            checked={passwordOn}
            onChange={(event) => setPasswordOn(event.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-[#655ac9] focus:ring-[#655ac9]"
          />
          Require a password
        </label>

        {passwordOn ? (
          <input
            type="password"
            data-guest-link-password="true"
            value={password}
            maxLength={PASSWORD_MAX}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900"
          />
        ) : null}

        <button
          type="button"
          data-guest-link-create="true"
          onClick={() => void create()}
          disabled={creating}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#8a2be2] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#7a24cb] disabled:opacity-50"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Create guest link
        </button>
      </div>

      {links.length === 0 ? (
        <p className="text-sm text-gray-500">No guest links yet.</p>
      ) : (
        <ul className="space-y-2">
          {links.map((link) => (
            <li
              key={link.id}
              data-guest-link-row="true"
              data-guest-link-id={link.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-800">{guestLinkPermissionLabel(link.permission)}</span>
                  {link.isPasswordProtected ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">Password</span>
                  ) : null}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                  <span>{guestLinkExpiryLabel(link.expiresAt, now)}</span>
                  <span>·</span>
                  <span>{link.accessCount} opened</span>
                </div>
              </div>

              {confirmOffId === link.id ? (
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-gray-600">Turn off?</span>
                  <button
                    type="button"
                    data-guest-link-off-confirm="true"
                    onClick={() => void turnOff(link.id)}
                    disabled={turningOffId === link.id}
                    className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Turn off
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmOffId(null)}
                    className="rounded-lg px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    data-guest-link-copy="true"
                    onClick={() => void copy(link.url)}
                    className="rounded-lg px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    data-guest-link-qr="true"
                    onClick={() => setQrLink(link)}
                    className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                  >
                    <QrCode className="h-3.5 w-3.5" />
                    QR code
                  </button>
                  <button
                    type="button"
                    data-guest-link-off="true"
                    onClick={() => setConfirmOffId(link.id)}
                    className="rounded-lg px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    Turn off
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-gray-500">
        Turning a link off stops new people joining. Remove people who already joined on the People tab.
      </p>

      {qrLink ? (
        <GuestLinkQrOverlay url={qrLink.url} title={canvasTitle} onClose={() => setQrLink(null)} />
      ) : null}
    </div>
  );
}
