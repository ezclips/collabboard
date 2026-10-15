// @vitest-environment jsdom
//
// PATCH-370. The pending-approval bar: the label always, Approve/Decline only
// when the viewer may approve, and Decline asks inline before deleting.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import PendingApprovalBar from './PendingApprovalBar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement;

async function mount(props: Partial<React.ComponentProps<typeof PendingApprovalBar>>) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<PendingApprovalBar canApprove={false} onApprove={() => {}} onDecline={() => {}} {...props} />);
  });
}

const q = (selector: string) => host.querySelector(selector) as HTMLElement | null;
const click = async (el: HTMLElement | null) => { await act(async () => { el!.click(); }); };

afterEach(async () => {
  if (root) { const r = root; await act(async () => r.unmount()); root = null; }
  host?.remove();
  document.body.innerHTML = '';
});

describe('PATCH-370 PendingApprovalBar', () => {
  it('always shows the label', async () => {
    await mount({});
    expect(q('[data-pending-approval="true"]')).not.toBeNull();
    expect(host.textContent).toContain('Waiting for approval');
  });

  it('shows the label only when the viewer cannot approve', async () => {
    await mount({ canApprove: false });
    expect(q('[data-approve-post="true"]')).toBeNull();
    expect(q('[data-decline-post="true"]')).toBeNull();
  });

  it('approves on click', async () => {
    const onApprove = vi.fn();
    await mount({ canApprove: true, onApprove });
    await click(q('[data-approve-post="true"]'));
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it('asks inline before declining, then deletes', async () => {
    const onDecline = vi.fn();
    await mount({ canApprove: true, onDecline });
    await click(q('[data-decline-post="true"]'));
    expect(onDecline).not.toHaveBeenCalled();
    expect(q('[data-decline-post-confirm="true"]')).not.toBeNull();
    await click(q('[data-decline-post-confirm="true"]'));
    expect(onDecline).toHaveBeenCalledTimes(1);
  });

  it('can cancel the decline', async () => {
    const onDecline = vi.fn();
    await mount({ canApprove: true, onDecline });
    await click(q('[data-decline-post="true"]'));
    const cancel = Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'Cancel') as HTMLElement;
    await click(cancel);
    expect(q('[data-decline-post-confirm="true"]')).toBeNull();
    expect(onDecline).not.toHaveBeenCalled();
  });
});
