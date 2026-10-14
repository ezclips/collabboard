// @vitest-environment jsdom
//
// PATCH-369. The shared switch row: label, an info icon whose hint is its title
// (and an aria-describedby sr-only node), and the switch on the right.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ShareSwitchRow from './ShareSwitchRow';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement;

async function mount(props: Partial<React.ComponentProps<typeof ShareSwitchRow>>) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <ShareSwitchRow
        label="Freeze board"
        hint="Nobody else can change anything."
        checked={false}
        onToggle={() => {}}
        {...props}
      />,
    );
  });
}

const switchEl = () => host.querySelector('[role="switch"]') as HTMLButtonElement | null;

afterEach(async () => {
  if (root) { const r = root; await act(async () => r.unmount()); root = null; }
  host?.remove();
  document.body.innerHTML = '';
});

describe('PATCH-369 ShareSwitchRow', () => {
  it('renders the label and the hint as a title and an sr-only node', async () => {
    await mount({});
    expect(host.textContent).toContain('Freeze board');
    const hint = host.querySelector('[data-share-switch-hint]') as HTMLElement;
    expect(hint.getAttribute('title')).toBe('Nobody else can change anything.');
    expect(host.textContent).toContain('Nobody else can change anything.');

    const button = switchEl()!;
    const describedBy = button.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const described = Array.from(host.querySelectorAll('span')).find((el) => el.id === describedBy);
    expect(described?.textContent).toBe('Nobody else can change anything.');
  });

  it('renders the switch state and calls onToggle', async () => {
    const onToggle = vi.fn();
    await mount({ checked: true, onToggle });
    expect(switchEl()!.getAttribute('aria-checked')).toBe('true');
    expect(switchEl()!.getAttribute('aria-label')).toBe('Freeze board');
    await act(async () => { switchEl()!.click(); });
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('honours disabled', async () => {
    const onToggle = vi.fn();
    await mount({ disabled: true, onToggle });
    expect(switchEl()!.disabled).toBe(true);
    await act(async () => { switchEl()!.click(); });
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('spreads the toggle own data hook onto the switch', async () => {
    await mount({ switchData: { 'data-board-freeze-toggle': 'true' } });
    expect(host.querySelector('[data-board-freeze-toggle="true"]')).not.toBeNull();
  });

  it('renders children under the row', async () => {
    await mount({ children: <p data-under="true">2 posts already waiting</p> });
    expect(host.querySelector('[data-under="true"]')?.textContent).toBe('2 posts already waiting');
  });
});
