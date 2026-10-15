// @vitest-environment jsdom
//
// PATCH-370. The shared body gains the guest features: a pending-approval bar
// (only when pending AND the callbacks are given), a guest-colour band (unless
// the caller opts out), and a `data-post-card-id` root for the pill to scroll to.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import PostCardContent from './PostCardContent';
import type { Padlet } from '@/types/collabboard';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function mount(padlet: Padlet, props: Partial<React.ComponentProps<typeof PostCardContent>> = {}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => { root!.render(<PostCardContent padlet={padlet} {...props} />); });
}

const note = (metadata: Record<string, unknown>): Padlet =>
  ({ id: 'p-1', title: 'Note', content: 'hello', type: 'text', metadata } as unknown as Padlet);

const q = (selector: string) => host!.querySelector(selector);

describe('PATCH-370 PostCardContent guest features', () => {
  it('marks its root with data-post-card-id, never data-padlet-id', () => {
    mount(note({}));
    expect(q('[data-post-card-id="p-1"]')).not.toBeNull();
    expect(q('[data-padlet-id]')).toBeNull();
  });

  it('renders the approval bar only when pending AND the callbacks are given', () => {
    const pending = note({ pendingApproval: true });

    mount(pending);
    expect(q('[data-pending-approval="true"]')).toBeNull();

    mount(pending, { canApproveGuestPosts: true, onApproveGuestPost: () => {}, onDeclineGuestPost: () => {} });
    expect(q('[data-pending-approval="true"]')).not.toBeNull();
    expect(q('[data-approve-post="true"]')).not.toBeNull();
  });

  it('shows the label only (no buttons) for the author', () => {
    mount(note({ pendingApproval: true }), { onApproveGuestPost: () => {}, onDeclineGuestPost: () => {} });
    expect(q('[data-pending-approval="true"]')).not.toBeNull();
    expect(q('[data-approve-post="true"]')).toBeNull();
  });

  it('approves with the metadata minus pendingApproval', () => {
    const onApproveGuestPost = vi.fn();
    mount(note({ pendingApproval: true, createdBy: 'u1' }), { canApproveGuestPosts: true, onApproveGuestPost, onDeclineGuestPost: () => {} });
    act(() => { (q('[data-approve-post="true"]') as HTMLElement).click(); });
    expect(onApproveGuestPost).toHaveBeenCalledWith('p-1', { createdBy: 'u1' });
  });

  it('renders the guest-colour band for a guest post, unless hideGuestStrip', () => {
    const guest = note({ createdByGuest: true, createdBy: 'a1000000-0000-4000-8000-0000000000b1' });

    mount(guest);
    expect(q('[data-guest-strip="true"]')).not.toBeNull();

    mount(guest, { hideGuestStrip: true });
    expect(q('[data-guest-strip="true"]')).toBeNull();
  });

  it('has no band for a non-guest post', () => {
    mount(note({ createdBy: 'u1' }));
    expect(q('[data-guest-strip="true"]')).toBeNull();
  });
});
