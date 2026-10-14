'use client';

/**
 * PATCH-358. The join card an unsigned visitor sees on a board share link.
 *
 * "Join as guest" signs in anonymously through the BROWSER's own client (so the
 * sign-in costs the visitor's own IP, per the per-IP auth limits) with the typed
 * name as `display_name`, then refreshes: the server page sees a session and the
 * PATCH-357 redeem flow runs unchanged. Nothing is written here.
 */

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';

import { normalizeGuestName } from '@/lib/domain/auth/guest';
import { supabaseBrowser } from '@/lib/supabase/browser';

export interface GuestJoinCardProps {
  readonly token: string;
  readonly boardTitle: string | null;
}

const DISABLED_MESSAGE = 'Guest access is not available yet. Sign in or create an account instead.';
const RATE_LIMITED_MESSAGE = 'Too many people joined from this network just now. Try again in a few minutes.';
const FAILED_MESSAGE = 'Could not join as a guest. Try again.';

export default function GuestJoinCard({ token, boardTitle }: GuestJoinCardProps) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);

  const handleJoin = async () => {
    if (joining) return;
    const normalized = normalizeGuestName(name);
    if (!normalized.ok) {
      setError(normalized.error);
      return;
    }

    setJoining(true);
    setError('');
    try {
      const { error: signInError } = await supabaseBrowser().auth.signInAnonymously({
        options: { data: { display_name: normalized.name } },
      });
      if (signInError) {
        const message = signInError.message ?? '';
        const status = (signInError as { status?: number }).status;
        if (message.includes('Anonymous sign-ins are disabled')) {
          setError(DISABLED_MESSAGE);
        } else if (status === 429) {
          setError(RATE_LIMITED_MESSAGE);
        } else {
          console.error('Guest sign-in failed:', signInError);
          setError(FAILED_MESSAGE);
        }
        return;
      }
      // The server page re-renders with a session and runs the redeem flow.
      router.refresh();
    } catch (err) {
      console.error('Guest sign-in failed:', err);
      setError(FAILED_MESSAGE);
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div data-guest-join-card="true" className="w-full max-w-sm rounded-xl bg-white p-8 shadow-lg">
        <div className="mb-6 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-blue-500" aria-hidden="true" />
          <h1 className="text-lg font-semibold text-gray-800">
            {boardTitle ? `Join “${boardTitle}”` : 'Join this board'}
          </h1>
        </div>
        <p className="mb-4 text-sm text-gray-500">
          Type a name to take part as a guest. No account needed.
        </p>

        <label htmlFor="guest-name" className="mb-1 block text-sm font-medium text-gray-700">
          Your name
        </label>
        <input
          id="guest-name"
          data-guest-name="true"
          type="text"
          value={name}
          maxLength={80}
          onChange={(event) => {
            setName(event.target.value);
            if (error) setError('');
          }}
          onKeyDown={(event) => { if (event.key === 'Enter') void handleJoin(); }}
          placeholder="Your name"
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        {error && (
          <p data-guest-error="true" role="alert" className="mt-2 text-xs text-red-600">{error}</p>
        )}

        <button
          type="button"
          data-guest-join="true"
          onClick={() => void handleJoin()}
          disabled={joining}
          className="mt-4 w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {joining ? 'Joining…' : 'Join as guest'}
        </button>

        <p className="mt-4 text-center text-sm text-gray-500">
          <a
            data-guest-signin="true"
            href={`/auth?redirect=${encodeURIComponent(`/share/${token}`)}`}
            className="font-medium text-blue-600 hover:underline"
          >
            Sign in or create an account
          </a>
        </p>
      </div>
    </div>
  );
}
