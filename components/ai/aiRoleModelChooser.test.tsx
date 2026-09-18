// @vitest-environment jsdom

import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AI_ROLE_EDIT, AI_ROLE_SOURCE } from '@/lib/ai/aiRoles';

/**
 * THE SHARED CHOOSER, ON THE SURFACES THAT HAD NO WAY TO CHANGE A MODEL.
 *
 * The board chat chooser's own rules are pinned by boardAiChatWiring.test.tsx,
 * which must keep passing UNEDITED -- that file is the proof the extraction
 * changed no chat behaviour. This file is the proof the SAME rules now hold on
 * the two surfaces that previously offered no choice at all.
 *
 * THE RULE BEING PROTECTED, and it is the one that took a live defect to find:
 * the chooser must never NAME a provider it has not read. The server resolves
 * the role's STORED preference on every request, so a chooser that could not
 * load has no idea what is in force -- and "CollabBoard Default", rendered as a
 * fact during a slow or failed load, is a definite wrong answer where no answer
 * was available.
 */

const mocks = vi.hoisted(() => ({
  fetchAIProviders: vi.fn(),
  fetchAIRoles: vi.fn(),
  saveAIRole: vi.fn(),
}));

vi.mock('@/components/settings/ai/aiSettingsClient', () => ({
  fetchAIProviders: mocks.fetchAIProviders,
  fetchAIRoles: mocks.fetchAIRoles,
  saveAIRole: mocks.saveAIRole,
}));

import AIRoleModelChooser from './AIRoleModelChooser';

const CONNECTIONS = [
  { id: 'conn-1', providerType: 'openai', displayName: 'Work key', keyHint: '7f3a',
    defaultModel: 'gpt-4o', supportsImages: true, verifiedAt: null,
    createdAt: '', updatedAt: '' },
];

let host: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  mocks.fetchAIProviders.mockResolvedValue(CONNECTIONS);
  mocks.fetchAIRoles.mockResolvedValue({});
  mocks.saveAIRole.mockResolvedValue(undefined);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  host?.remove();
  vi.clearAllMocks();
});

async function mount(element: React.ReactElement) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(element); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

const selectOf = (prefix: string) =>
  host.querySelector(`[data-${prefix}-model=""]`) as HTMLSelectElement;

/** Each surface, with the role it must write and the namespace it must expose. */
const SURFACES = [
  { name: 'selected-text AI (Edit & Rewrite)', prefix: 'selected-text-ai', role: AI_ROLE_EDIT, label: 'Edit & Rewrite model' },
  { name: 'knowledge source AI (Source AI)', prefix: 'knowledge-source-ai', role: AI_ROLE_SOURCE, label: 'Source AI model' },
] as const;

describe.each(SURFACES)('$name', ({ prefix, role, label }) => {
  const render = (extra: Partial<React.ComponentProps<typeof AIRoleModelChooser>> = {}) => (
    <AIRoleModelChooser
      role={role}
      label={label}
      attributePrefix={prefix}
      saveErrorMessage="Could not change the model."
      {...extra}
    />
  );

  it('offers the user\'s connections once it has actually read them', async () => {
    await mount(render());
    const select = selectOf(prefix);
    expect(select.getAttribute(`data-${prefix}-model-status`)).toBe('ready');
    const options = Array.from(select.options).map((o) => o.textContent ?? '');
    expect(options).toContain('CollabBoard Default');
    expect(options).toContain('Work key');
    // The display name identifies the connection; the masked hint answered
    // "which KEY", which is not the question.
    expect(options.join(' ')).not.toContain('7f3a');
    expect(options.join(' ')).not.toMatch(/sk-|apiKey|secret|Bearer/);
  });

  it('names no provider while it is still reading which one is stored', async () => {
    mocks.fetchAIProviders.mockReturnValue(new Promise(() => {}));
    mocks.fetchAIRoles.mockReturnValue(new Promise(() => {}));
    await mount(render());
    const select = selectOf(prefix);

    expect(select.getAttribute(`data-${prefix}-model-status`)).toBe('loading');
    for (const option of Array.from(select.options)) {
      expect(option.textContent ?? '').not.toMatch(/CollabBoard|Work key/);
    }
    expect(select.disabled).toBe(true);
  });

  it('a chooser that could not load says so and refuses to pretend it can change anything', async () => {
    mocks.fetchAIRoles.mockRejectedValue(new Error('offline'));
    await mount(render());
    const select = selectOf(prefix);

    expect(select.getAttribute(`data-${prefix}-model-status`)).toBe('unavailable');
    for (const option of Array.from(select.options)) {
      expect(option.textContent ?? '').not.toMatch(/CollabBoard|Work key/);
    }
    expect(select.disabled).toBe(true);
    expect(select.title).toMatch(/Settings/);
    expect(mocks.saveAIRole).not.toHaveBeenCalled();
  });

  it('writes THIS surface\'s role through the existing role authority', async () => {
    await mount(render());
    const select = selectOf(prefix);
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!;
      setter.call(select, 'conn-1');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => { await Promise.resolve(); });
    // The role is the whole point of the parameterisation: a copy-paste that
    // left AI_ROLE_CHAT in place would silently repoint another surface's model.
    expect(mocks.saveAIRole).toHaveBeenCalledWith(role, 'conn-1', null);
    // The model id stays null -- the connection's default is the resolver's
    // fallback, and choosing one here would be a second place that decides it.
    expect(mocks.saveAIRole.mock.calls[0][2]).toBeNull();
  });

  it('a reflected selection reverts when the save fails, and says so', async () => {
    mocks.saveAIRole.mockRejectedValue(new Error('nope'));
    const onError = vi.fn();
    await mount(render({ onError }));
    const select = selectOf(prefix);
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!;
      setter.call(select, 'conn-1');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(onError).toHaveBeenCalledWith('Could not change the model.');
    expect(selectOf(prefix).value).toBe('');
  });

  it('is disabled while the surface has a request in flight', async () => {
    await mount(render({ disabled: true }));
    expect(selectOf(prefix).disabled).toBe(true);
  });
});

describe('the chooser is not execution authority', () => {
  it('never calls an execution route, and holds no credential vocabulary', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'components/ai/AIRoleModelChooser.tsx'), 'utf8');
    const executable = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

    // It talks to the settings API only. A selection can therefore never ride
    // along with a message, on any surface that mounts it.
    expect(executable).not.toContain('/ai/chat');
    expect(executable).not.toContain('/ai/text-action');
    expect(executable).not.toMatch(/apiKey|connectionSecret|endpoint|baseUrl/);
  });

  it('keeps the three-state status, which is what stops it naming an unread model', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'components/ai/AIRoleModelChooser.tsx'), 'utf8');
    expect(source).toContain("'loading' | 'ready' | 'unavailable'");
    expect(source).toContain('STORED preference');
    expect(source).not.toMatch(/which is the managed default/);
  });
});
