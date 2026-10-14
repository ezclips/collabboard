'use client';

/**
 * PATCH-363. A small pill, bottom-right of the canvas viewport, showing who is
 * on the board right now. Hover (or a click, for touch) opens the full list.
 *
 * Shown whenever the channel is live -- even when only I am present, so the
 * owner sees "just me". Hidden while connecting or when the channel is
 * unavailable.
 */

import React, { useState } from 'react';

import { initials, overflow, type PresencePerson } from '@/lib/domain/presence/boardPresence';
import type { BoardPresenceStatus } from './useBoardPresence';

export interface BoardPresenceStackProps {
  readonly people: readonly PresencePerson[];
  readonly status: BoardPresenceStatus;
  readonly myUserId: string;
}

const AVATAR = 28;
const MAX_AVATARS = 5;

function Avatar({ person, ring }: { person: PresencePerson; ring: boolean }) {
  return (
    <span
      className="flex items-center justify-center rounded-full text-[11px] font-semibold text-white"
      style={{
        width: AVATAR,
        height: AVATAR,
        backgroundColor: person.color,
        boxShadow: ring ? '0 0 0 2px #ffffff, 0 0 0 4px #6366f1' : '0 0 0 2px #ffffff',
      }}
      title={person.name}
    >
      {initials(person.name)}
    </span>
  );
}

export default function BoardPresenceStack({ people, status, myUserId }: BoardPresenceStackProps) {
  const [open, setOpen] = useState(false);

  if (status !== 'live' || people.length === 0) return null;

  const { visible, hidden } = overflow(people, MAX_AVATARS);

  return (
    <div
      data-presence-stack="true"
      className="fixed z-[1500]"
      style={{ bottom: 16, right: 16 }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {open ? (
        <div
          data-presence-list="true"
          className="mb-2 w-56 rounded-xl border border-gray-200 bg-white p-2 shadow-xl"
        >
          <ul className="space-y-0.5">
            {people.map((person) => (
              <li key={person.userId} className="flex items-center gap-2 rounded-lg px-1 py-1">
                <Avatar person={person} ring={person.userId === myUserId} />
                <span className="min-w-0 flex-1 truncate text-sm text-gray-800">
                  {person.name}
                  {person.userId === myUserId ? <span className="text-gray-400"> (you)</span> : null}
                </span>
                {person.isGuest ? (
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                    Guest
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={`${people.length} ${people.length === 1 ? 'person' : 'people'} on this board`}
        className="flex items-center rounded-full border border-gray-200 bg-white p-1 shadow-lg"
      >
        {visible.map((person, index) => (
          <span
            key={person.userId}
            data-presence-person="true"
            style={{ marginLeft: index === 0 ? 0 : -8, zIndex: visible.length - index }}
          >
            <Avatar person={person} ring={person.userId === myUserId} />
          </span>
        ))}
        {hidden.length > 0 ? (
          <span
            data-presence-overflow="true"
            className="flex items-center justify-center rounded-full bg-slate-200 text-[11px] font-semibold text-slate-700"
            style={{ width: AVATAR, height: AVATAR, marginLeft: -8, boxShadow: '0 0 0 2px #ffffff' }}
          >
            +{hidden.length}
          </span>
        ) : null}
      </button>
    </div>
  );
}
