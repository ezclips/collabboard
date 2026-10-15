// @vitest-environment jsdom
//
// PATCH-370 Addendum 2. A CONTAINER's own padlet never passes through
// PostCardContent (only its children do), so a pending/guest container gets the
// bar, the dashed outline and the guest band from RowColumnContainerCard itself.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import RowColumnContainerCard from './RowColumnContainerCard';
import type { Padlet } from '@/types/collabboard';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  }
});

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
function mount(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(ui); });
  mounted.push({ root, container });
  return container;
}
afterEach(async () => {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
  for (const m of mounted) { act(() => { m.root.unmount(); }); m.container.remove(); }
  mounted = [];
});

const container = (metadata: Record<string, unknown>): Padlet =>
  ({ id: 'c-1', title: 'Container', content: '', type: 'container', metadata: { childPadletIds: [], ...metadata } } as unknown as Padlet);

const q = (host: HTMLElement, selector: string) => host.querySelector(selector);

describe('PATCH-370 RowColumnContainerCard guest container', () => {
  it('marks its root with data-post-card-id', () => {
    const host = mount(<RowColumnContainerCard padlet={container({})} allPadlets={[]} />);
    expect(q(host, '[data-post-card-id="c-1"]')).not.toBeNull();
  });

  it('shows the bar with buttons for the owner of a pending container', () => {
    const host = mount(
      <RowColumnContainerCard
        padlet={container({ pendingApproval: true })}
        allPadlets={[]}
        canApproveGuestPosts
        onApproveGuestPost={() => {}}
        onDeclineGuestPost={() => {}}
      />,
    );
    expect(q(host, '[data-pending-approval="true"]')).not.toBeNull();
    expect(q(host, '[data-approve-post="true"]')).not.toBeNull();
    expect(q(host, '[data-decline-post="true"]')).not.toBeNull();
  });

  it('shows the label only for the author of a pending container', () => {
    const host = mount(
      <RowColumnContainerCard
        padlet={container({ pendingApproval: true })}
        allPadlets={[]}
        onApproveGuestPost={() => {}}
        onDeclineGuestPost={() => {}}
      />,
    );
    expect(q(host, '[data-pending-approval="true"]')).not.toBeNull();
    expect(q(host, '[data-approve-post="true"]')).toBeNull();
  });

  it('shows no bar without the approve callback', () => {
    const host = mount(<RowColumnContainerCard padlet={container({ pendingApproval: true })} allPadlets={[]} />);
    expect(q(host, '[data-pending-approval="true"]')).toBeNull();
  });

  it('approves a container with its metadata minus pendingApproval', () => {
    const onApproveGuestPost = vi.fn();
    const host = mount(
      <RowColumnContainerCard
        padlet={container({ pendingApproval: true, createdBy: 'u1' })}
        allPadlets={[]}
        canApproveGuestPosts
        onApproveGuestPost={onApproveGuestPost}
        onDeclineGuestPost={() => {}}
      />,
    );
    act(() => { (q(host, '[data-approve-post="true"]') as HTMLElement).click(); });
    expect(onApproveGuestPost).toHaveBeenCalledWith('c-1', expect.objectContaining({ createdBy: 'u1' }));
    expect((onApproveGuestPost.mock.calls[0][1] as Record<string, unknown>).pendingApproval).toBeUndefined();
  });

  it('shows the guest band for a guest container, unless hideGuestStrip', () => {
    const guest = container({ createdByGuest: true, createdBy: 'a1000000-0000-4000-8000-0000000000b1' });

    const host = mount(<RowColumnContainerCard padlet={guest} allPadlets={[]} />);
    expect(q(host, '[data-guest-strip="true"]')).not.toBeNull();

    const opted = mount(<RowColumnContainerCard padlet={guest} allPadlets={[]} hideGuestStrip />);
    expect(q(opted, '[data-guest-strip="true"]')).toBeNull();
  });

  it('has no band for a non-guest container', () => {
    const host = mount(<RowColumnContainerCard padlet={container({ createdBy: 'u1' })} allPadlets={[]} />);
    expect(q(host, '[data-guest-strip="true"]')).toBeNull();
  });
});
