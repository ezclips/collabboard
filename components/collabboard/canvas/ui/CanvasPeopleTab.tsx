'use client';

/**
 * PATCH-362. The "People" tab of Share canvas: who joined this board through a
 * share link, and removing one. Split out of CanvasShareModal (which is over the
 * 400-line component ceiling) so the modal only renders it.
 *
 * Loads once on mount (the modal mounts it when the tab is opened). A removal
 * asks inline -- no browser confirm() -- and a failure is shown, never swallowed.
 */

import React, { useEffect, useState } from 'react';
import { Loader2, UserMinus } from 'lucide-react';

import { boardPersonRoleLabel, type BoardPerson } from '@/lib/domain/sharing/boardPeople';

export interface CanvasPeopleTabProps {
  readonly canvasId: string;
}

const FORBIDDEN = 'Only the board owner can manage access.';

export default function CanvasPeopleTab({ canvasId }: CanvasPeopleTabProps) {
  const [people, setPeople] = useState<readonly BoardPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void (async () => {
      try {
        const response = await fetch(`/api/boards/${canvasId}/collaborators`);
        const body = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok) {
          setError(
            response.status === 403
              ? FORBIDDEN
              : (typeof body?.error === 'string' && body.error ? body.error : 'Could not load people.'),
          );
          setPeople([]);
          return;
        }
        setPeople(Array.isArray(body?.people) ? (body.people as BoardPerson[]) : []);
      } catch {
        if (!cancelled) setError('Could not load people.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [canvasId]);

  const removePerson = async (userId: string) => {
    setRemovingId(userId);
    setError('');
    try {
      const response = await fetch(`/api/boards/${canvasId}/collaborators/${userId}`, { method: 'DELETE' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(
          response.status === 403
            ? FORBIDDEN
            : (typeof body?.error === 'string' && body.error ? body.error : 'Could not remove this person.'),
        );
        return;
      }
      setPeople((current) => current.filter((person) => person.userId !== userId));
      setConfirmRemoveId(null);
    } catch {
      setError('Could not remove this person.');
    } finally {
      setRemovingId(null);
    }
  };

  if (loading) {
    return (
      <div data-board-people="true" className="flex items-center gap-2 py-6 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading people…
      </div>
    );
  }

  return (
    <div data-board-people="true" className="space-y-3">
      {error ? (
        <p data-person-error="true" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {people.length === 0 && !error ? (
        <p className="py-4 text-sm text-gray-500">No one has joined through a share link yet.</p>
      ) : (
        <ul className="space-y-2">
          {people.map((person) => (
            <li
              key={person.userId}
              data-person-row="true"
              className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-gray-800">{person.name}</span>
                  {person.isGuest ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                      Guest
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                  {person.email ? <span className="truncate">{person.email}</span> : null}
                  <span>{boardPersonRoleLabel(person.role)}</span>
                </div>
              </div>

              {confirmRemoveId === person.userId ? (
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-gray-600">Remove {person.name}?</span>
                  <button
                    type="button"
                    data-person-remove-confirm="true"
                    onClick={() => void removePerson(person.userId)}
                    disabled={removingId === person.userId}
                    className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRemoveId(null)}
                    className="rounded-lg px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  data-person-remove="true"
                  onClick={() => setConfirmRemoveId(person.userId)}
                  className="flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
                >
                  <UserMinus className="h-3.5 w-3.5" />
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-gray-500">
        Removed people can join again while a share link is still valid.
      </p>
    </div>
  );
}
