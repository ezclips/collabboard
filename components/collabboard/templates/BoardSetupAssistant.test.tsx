// @vitest-environment jsdom
//
// PATCH-356. The board-setup assistant: presets, the description, Generate ->
// preview, and Create -> the picker's applyTemplate. The request helper is
// stubbed; the template is built for real and must pass boardTemplateSchema.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ requestBoardSetup: vi.fn() }));
vi.mock('@/lib/infra/ai/requestBoardSetup', () => ({ requestBoardSetup: mocks.requestBoardSetup }));

import { BoardSetupAssistant } from './BoardSetupAssistant';
import { boardTemplateSchema } from '@/lib/domain/canvas/boardTemplates';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement;

const RESULT = {
  title: 'Retro',
  intro: 'A short retro board.',
  columns: [{ title: 'Went well', items: [{ type: 'note', title: 'Wins', text: 'What worked?' }] }],
};

async function mount(props: {
  onCreate?: (template: unknown) => Promise<boolean>;
  onBack?: () => void;
} = {}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <BoardSetupAssistant
        boardId="board-1"
        onCreate={(props.onCreate ?? (async () => true)) as never}
        onBack={props.onBack ?? (() => {})}
      />,
    );
  });
}

const q = (selector: string) => host.querySelector(selector) as HTMLElement | null;
const click = async (element: HTMLElement | null) => {
  await act(async () => { element!.click(); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
};
const setTextarea = async (selector: string, value: string) => {
  await act(async () => {
    const textarea = q(selector) as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
    setter.call(textarea, value);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => { await Promise.resolve(); });
};

afterEach(async () => {
  if (root) { const r = root; await act(async () => r.unmount()); root = null; }
  host?.remove();
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

beforeEach(() => { mocks.requestBoardSetup.mockReset(); });

describe('PATCH-356 BoardSetupAssistant: input', () => {
  it('Generate is off until a preset or a description is chosen', async () => {
    await mount();
    expect((q('[data-board-setup-generate]') as HTMLButtonElement).disabled).toBe(true);
    await click(q('[data-board-setup-preset="retrospective"]'));
    expect((q('[data-board-setup-generate]') as HTMLButtonElement).disabled).toBe(false);
    // Clicking the same preset again unticks it.
    await click(q('[data-board-setup-preset="retrospective"]'));
    expect((q('[data-board-setup-generate]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('sends the chosen preset', async () => {
    mocks.requestBoardSetup.mockResolvedValue({ ok: true, result: RESULT });
    await mount();
    await click(q('[data-board-setup-preset="retrospective"]'));
    await click(q('[data-board-setup-generate]'));
    expect(mocks.requestBoardSetup).toHaveBeenCalledWith({
      boardId: 'board-1', preset: 'retrospective', description: undefined,
    });
  });

  it('sends a typed description', async () => {
    mocks.requestBoardSetup.mockResolvedValue({ ok: true, result: RESULT });
    await mount();
    await setTextarea('[data-board-setup-description]', 'A German team retro');
    await click(q('[data-board-setup-generate]'));
    expect(mocks.requestBoardSetup).toHaveBeenCalledWith({
      boardId: 'board-1', preset: undefined, description: 'A German team retro',
    });
  });

  it('shows the counter and the credit line', async () => {
    await mount();
    expect(q('[data-board-setup-counter]')?.textContent).toContain('/500');
    expect(host.textContent).toContain('Uses 1 AI credit');
  });
});

describe('PATCH-356 BoardSetupAssistant: preview and create', () => {
  async function generate(props: { onCreate?: (template: unknown) => Promise<boolean> } = {}) {
    mocks.requestBoardSetup.mockResolvedValue({ ok: true, result: RESULT });
    await mount(props);
    await click(q('[data-board-setup-preset="retrospective"]'));
    await click(q('[data-board-setup-generate]'));
  }

  it('previews the board and its columns', async () => {
    await generate();
    const preview = q('[data-board-setup-preview]');
    expect(preview).not.toBeNull();
    expect(preview!.textContent).toContain('Retro');
    expect(preview!.textContent).toContain('Went well');
    expect(preview!.textContent).toContain('Wins');
  });

  it('Create calls onCreate with a schema-valid template', async () => {
    const onCreate = vi.fn(async (_template: unknown) => true);
    await generate({ onCreate });
    await click(q('[data-board-setup-create]'));
    expect(onCreate).toHaveBeenCalledTimes(1);
    const template = onCreate.mock.calls[0][0] as unknown;
    const parsed = boardTemplateSchema.safeParse(template);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
  });

  it('a failed Create shows an inline error', async () => {
    const onCreate = vi.fn(async (_template: unknown) => false);
    await generate({ onCreate });
    await click(q('[data-board-setup-create]'));
    expect(q('[data-board-setup-error]')?.textContent)
      .toContain('The board could not be created. Nothing was changed');
  });

  it('Try again returns to the input form', async () => {
    await generate();
    await click(q('[data-board-setup-try-again]'));
    expect(q('[data-board-setup-preview]')).toBeNull();
    expect(q('[data-board-setup-generate]')).not.toBeNull();
  });
});

describe('PATCH-356 BoardSetupAssistant: errors and Back', () => {
  it('shows the request error inline', async () => {
    mocks.requestBoardSetup.mockResolvedValue({ ok: false, status: 500, message: 'Server said no.' });
    await mount();
    await click(q('[data-board-setup-preset="brainstorm"]'));
    await click(q('[data-board-setup-generate]'));
    expect(q('[data-board-setup-error]')?.textContent).toContain('Server said no.');
    expect(q('[data-board-setup-preview]')).toBeNull();
  });

  it('shows the unusable-answer message when the result is null', async () => {
    mocks.requestBoardSetup.mockResolvedValue({ ok: true, result: null });
    await mount();
    await click(q('[data-board-setup-preset="brainstorm"]'));
    await click(q('[data-board-setup-generate]'));
    expect(q('[data-board-setup-error]')?.textContent).toContain("couldn't be used");
  });

  it('Back calls onBack', async () => {
    const onBack = vi.fn();
    await mount({ onBack });
    await click(q('[data-board-setup-back]'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
