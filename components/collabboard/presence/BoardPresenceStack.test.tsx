// @vitest-environment jsdom
//
// PATCH-363. The presence stack: up to 5 avatars + "+N", and an open list with
// "(you)" and the "Guest" tag.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import BoardPresenceStack from './BoardPresenceStack';
import type { PresencePerson } from '@/lib/domain/presence/boardPresence';
import type { BoardPresenceStatus } from './useBoardPresence';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement;

function person(userId: string, name: string, isGuest = false): PresencePerson {
  return { userId, name, isGuest, color: '#0ea5e9', joinedAt: `2026-01-0${userId.slice(1)}T00:00:00Z` };
}

const PEOPLE: PresencePerson[] = [
  person('u1', 'Ada Lovelace'),
  person('u2', 'Bob'),
  person('u3', 'Guest', true),
  person('u4', 'Dana'),
  person('u5', 'Eve'),
  person('u6', 'Finn'),
  person('u7', 'Gus'),
];

async function mount(people: PresencePerson[], status: BoardPresenceStatus, myUserId = 'u1') {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<BoardPresenceStack people={people} status={status} myUserId={myUserId} />);
  });
}

const all = (selector: string) => Array.from(host.querySelectorAll(selector)) as HTMLElement[];
const q = (selector: string) => host.querySelector(selector) as HTMLElement | null;

afterEach(async () => {
  if (root) { const r = root; await act(async () => r.unmount()); root = null; }
  host?.remove();
  document.body.innerHTML = '';
});

describe('PATCH-363 BoardPresenceStack', () => {
  it('shows at most 5 avatars and a "+N" overflow bubble', async () => {
    await mount(PEOPLE, 'live');
    expect(q('[data-presence-stack]')).not.toBeNull();
    expect(all('[data-presence-person]')).toHaveLength(5);
    expect(q('[data-presence-overflow]')?.textContent).toBe('+2');
  });

  it('opens the list on click, with "(you)" and the "Guest" tag', async () => {
    await mount(PEOPLE, 'live');
    await act(async () => { host.querySelector('button')!.click(); });

    const list = q('[data-presence-list]');
    expect(list).not.toBeNull();
    expect(list?.textContent).toContain('Ada Lovelace');
    expect(list?.textContent).toContain('(you)');
    expect(list?.textContent).toContain('Guest');
  });

  it('hides itself while connecting or unavailable', async () => {
    await mount(PEOPLE, 'connecting');
    expect(q('[data-presence-stack]')).toBeNull();

    if (root) { const r = root; await act(async () => r.unmount()); root = null; }
    host?.remove();

    await mount(PEOPLE, 'unavailable');
    expect(q('[data-presence-stack]')).toBeNull();
  });

  it('shows a stack of one when only I am present', async () => {
    await mount([person('u1', 'Ada Lovelace')], 'live');
    expect(all('[data-presence-person]')).toHaveLength(1);
    expect(q('[data-presence-overflow]')).toBeNull();
  });
});
