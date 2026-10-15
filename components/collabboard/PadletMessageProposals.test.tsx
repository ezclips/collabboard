// @vitest-environment jsdom
//
// PATCH-372. The Padlet proposals checklist: labels, Apply / Discard, the
// read-only case, and the proposals memory across a thread re-read.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import PadletMessageProposals from './PadletMessageProposals';
import type { PadletProposedChange } from '@/lib/domain/ai/padletChangeProposals';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement;

const CHANGES: PadletProposedChange[] = [
  { kind: 'create-panel', label: 'New column “Risks”', panelKind: 'section', newPanelName: 'Risks' },
  { kind: 'create', label: 'New post in “Risks”: “Flaky tests”', panelKind: 'section', newPanelName: 'Risks', title: 'Flaky tests' },
  { kind: 'move', label: 'Move “Ideas · First” to “Done”', postId: 'p1', postTitle: 'Ideas · First', panelId: '198', panelKind: 'section' },
];

async function mount(props: Partial<React.ComponentProps<typeof PadletMessageProposals>>) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <PadletMessageProposals
        message={{ id: 'm1', proposedPadletChanges: CHANGES }}
        canEdit
        {...props}
      />,
    );
  });
  return host;
}

const q = (selector: string) => host.querySelector(selector) as HTMLElement | null;
const all = (selector: string) => Array.from(host.querySelectorAll(selector)) as HTMLElement[];
const click = async (selector: string) => { await act(async () => { q(selector)!.click(); }); };

afterEach(async () => {
  if (root) { const r = root; await act(async () => r.unmount()); root = null; }
  host?.remove();
  document.body.innerHTML = '';
});

describe('PATCH-372 PadletMessageProposals', () => {
  it('renders nothing when the message proposed none', async () => {
    await mount({ message: { id: 'm1', proposedPadletChanges: null } });
    expect(q('[data-padlet-proposals="true"]')).toBeNull();
  });

  it('lists a labelled checkbox per change', async () => {
    await mount({});
    expect(q('[data-padlet-proposals="true"]')).not.toBeNull();
    expect(all('[data-padlet-proposal]')).toHaveLength(3);
    expect(host.textContent).toContain('Proposed changes (3)');
    expect(host.textContent).toContain('New column “Risks”');
    expect(host.textContent).toContain('Move “Ideas · First” to “Done”');
  });

  it('applies the ticked changes and reports the outcome', async () => {
    const onApply = vi.fn(async (chosen: readonly PadletProposedChange[]) => chosen.map(() => ({ ok: true })));
    await mount({ onApply });

    // Untick the middle one.
    await act(async () => { (q('[data-padlet-proposal-checkbox="1"]') as HTMLInputElement).click(); });
    await click('[data-padlet-proposals-apply="true"]');

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0].map((change) => change.kind)).toEqual(['create-panel', 'move']);
    expect(host.textContent).toContain('Applied 2 of 2 changes');
  });

  it('reports a failed change and stops offering Apply', async () => {
    const onApply = vi.fn(async () => ([{ ok: true }, { ok: false, message: 'Could not create the panel' }]));
    await mount({ onApply, message: { id: 'm1', proposedPadletChanges: CHANGES.slice(0, 2) } });
    await click('[data-padlet-proposals-apply="true"]');

    expect(q('[data-padlet-proposals-failures="true"]')?.textContent).toContain('Could not create the panel');
    expect(q('[data-padlet-proposals-apply="true"]')).toBeNull();
    expect(host.textContent).toContain('Applied 1 of 2 changes');
  });

  it('Discard writes nothing', async () => {
    const onApply = vi.fn(async () => []);
    await mount({ onApply });
    await click('[data-padlet-proposals-discard="true"]');
    expect(onApply).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Discarded.');
    expect(q('[data-padlet-proposals-apply="true"]')).toBeNull();
  });

  it('is read-only without the edit authority', async () => {
    await mount({ canEdit: false, onApply: undefined });
    expect(q('[data-padlet-proposals-apply="true"]')).toBeNull();
    expect(q('[data-padlet-proposals-readonly="true"]')).not.toBeNull();
    expect((q('[data-padlet-proposal-checkbox="0"]') as HTMLInputElement).disabled).toBe(true);
  });

  it('keeps the proposals across a re-read that no longer carries them', async () => {
    await mount({});
    // A thread re-read comes back without the proposals; the same message id
    // keeps this instance, and the remembered value with it.
    await act(async () => {
      root!.render(
        <PadletMessageProposals message={{ id: 'm1', proposedPadletChanges: null }} canEdit />,
      );
    });
    expect(all('[data-padlet-proposal]')).toHaveLength(3);
  });
});
