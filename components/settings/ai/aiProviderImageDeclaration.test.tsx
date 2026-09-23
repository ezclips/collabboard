// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * T3 -- THE USER'S DECLARATION, in the one place they make it.
 *
 * The checkbox is the whole user-facing half of this feature, and the property
 * that matters is not that it renders: it is that a connection is text-only
 * unless somebody deliberately ticked it, and that the tick reaches onSubmit
 * unchanged.
 *
 * `aiProviderTypeCarriesImages` is mocked so that ONE provider reports no image
 * path. Every real adapter carries images today, so without this the disabled
 * branch would be unreachable and untested -- and that branch is what explains
 * the absence to a user rather than leaving them wondering. The mock passes the
 * rest of the module through, so AI_PROVIDER_TYPES and the bounds are real.
 */

const UNCARRIED = 'gemini';

vi.mock('@/lib/domain/settings/aiProviderConnection', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/domain/settings/aiProviderConnection')>();
  return {
    ...actual,
    aiProviderTypeCarriesImages: (providerType: string) => providerType !== UNCARRIED,
  };
});

import AIProviderDialog, { type AIProviderDialogSubmit } from './AIProviderDialog';
import type { AIProviderConnection } from '@/lib/domain/settings/aiProviderConnection';

const CONNECTION: AIProviderConnection = {
  id: '11111111-1111-4111-8111-111111111111',
  providerType: 'openai',
  displayName: 'My OpenAI',
  keyHint: 'aB3d',
  defaultModel: 'gpt-4.1-mini',
  supportsImages: false,
  verifiedAt: null,
  createdAt: '2026-02-01T10:00:00.000Z',
  updatedAt: '2026-02-01T10:00:00.000Z',
};

let container: HTMLDivElement;
let root: Root;
let submitted: AIProviderDialogSubmit[];

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  submitted = [];
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

/**
 * Mounts a FRESH root every time. The dialog seeds its checkbox from
 * `connection.supportsImages` in a useState initialiser, which runs once per
 * mount -- re-rendering the same tree with different props would silently keep
 * the first value and make test 3 pass for the wrong reason.
 */
function render(props: Partial<React.ComponentProps<typeof AIProviderDialog>> = {}) {
  act(() => root.unmount());
  root = createRoot(container);
  act(() => {
    root.render(
      <AIProviderDialog
        mode="create"
        connection={null}
        busy={false}
        onSubmit={(values) => submitted.push(values)}
        onClose={() => {}}
        {...props}
      />,
    );
  });
}

/** Create mode keeps Save disabled until a plausible key is present. */
function fillKeyForCreate() {
  const input = container.querySelector<HTMLInputElement>('input[aria-label="API key"]');
  act(() => {
    if (!input) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, 'sk-test-abcdefgh');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const checkbox = () =>
  container.querySelector<HTMLInputElement>('input[aria-label="This model accepts images"]');

function click(element: Element | null) {
  act(() => {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function save() {
  const button = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Save'));
  click(button ?? null);
}

function setProvider(value: string) {
  const select = container.querySelector<HTMLSelectElement>('select[aria-label="Provider"]');
  act(() => {
    if (!select) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    setter?.call(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

describe('T3. the image declaration checkbox', () => {
  it('1. appears in create and in edit, and nowhere a declaration is meaningless', () => {
    render({ mode: 'create' });
    expect(checkbox(), 'create').not.toBeNull();

    render({ mode: 'edit', connection: CONNECTION });
    expect(checkbox(), 'edit').not.toBeNull();

    // These modes do not write connection metadata at all.
    for (const mode of ['replace-key', 'test-model', 'delete'] as const) {
      render({ mode, connection: CONNECTION });
      expect(checkbox(), mode).toBeNull();
    }
  });

  it('2. starts UNTICKED on create -- text-only until someone says otherwise', () => {
    render({ mode: 'create' });
    expect(checkbox()?.checked).toBe(false);

    fillKeyForCreate();
    save();
    // And an untouched box submits an explicit false, not an omitted field.
    expect(submitted[0].supportsImages).toBe(false);
  });

  it('3. reflects what the connection already declares when editing', () => {
    render({ mode: 'edit', connection: { ...CONNECTION, supportsImages: true } });
    expect(checkbox()?.checked).toBe(true);

    render({ mode: 'edit', connection: { ...CONNECTION, supportsImages: false } });
    expect(checkbox()?.checked).toBe(false);
  });

  it('4. carries the tick through to onSubmit', () => {
    render({ mode: 'create' });
    click(checkbox());
    expect(checkbox()?.checked).toBe(true);

    fillKeyForCreate();
    save();
    expect(submitted[0].supportsImages).toBe(true);
  });

  it('5. is DISABLED with a reason for a provider whose adapter cannot carry an image', () => {
    render({ mode: 'create' });
    expect(checkbox()?.disabled, 'a provider that can carry').toBe(false);
    expect(container.textContent).toContain('Used only for attachments you add in Board AI');

    setProvider(UNCARRIED);

    expect(checkbox()?.disabled, 'a provider that cannot').toBe(true);
    // Shown and explained, never hidden: an option that silently vanishes for
    // one provider leaves the user guessing why.
    expect(checkbox(), 'still rendered').not.toBeNull();
    expect(container.textContent).toContain('Image attachments are not available for this provider yet');
  });

  it('6. cannot submit a true for a provider that cannot carry one', () => {
    render({ mode: 'create' });
    // Tick it while the provider CAN carry images, then switch to one that
    // cannot. The stale tick must not survive into the submitted value.
    click(checkbox());
    expect(checkbox()?.checked).toBe(true);

    setProvider(UNCARRIED);
    expect(checkbox()?.checked, 'and the box shows false too').toBe(false);

    fillKeyForCreate();
    save();
    expect(submitted[0].providerType).toBe(UNCARRIED);
    expect(submitted[0].supportsImages).toBe(false);
  });
});

/**
 * PATCH-163. THE TIME-LIMIT NOTE.
 *
 * It renders every entry in `AI_TIME_BUDGETS` and nothing else numeric, so the
 * numbers have one home and cannot be hardcoded into this component. A stale
 * note is worse than no note: it would tell someone a limit the product does not
 * honour.
 */
describe('PATCH-163: the time-limit note under the model field', () => {
  it('renders every AI_TIME_BUDGETS entry, from the table', async () => {
    const { AI_TIME_BUDGETS } = await import('@/lib/ai/aiTimeBudgets');
    render();

    const note = container.querySelector('[data-ai-time-budgets="true"]');
    expect(note).not.toBeNull();
    expect(note!.textContent).toContain('How long CollabBoard waits for an answer:');
    for (const budget of AI_TIME_BUDGETS) {
      expect(note!.textContent, budget.feature).toContain(budget.feature);
      expect(note!.textContent, `${budget.feature} seconds`).toContain(`${budget.seconds} s`);
    }
  });

  it('contains no number that is not in the table', async () => {
    const { AI_TIME_BUDGETS } = await import('@/lib/ai/aiTimeBudgets');
    render();
    const note = container.querySelector('[data-ai-time-budgets="true"]');
    const allowed = new Set(AI_TIME_BUDGETS.map((budget) => String(budget.seconds)));

    // Every integer in the note must be one of the table's values.
    const numbers = note!.textContent!.match(/\d+/g) ?? [];
    expect(numbers.length).toBeGreaterThan(0);
    for (const number of numbers) {
      expect(allowed.has(number), `unexpected number ${number} in the note`).toBe(true);
    }
    // And the count of numbers equals the entries, so none is emitted twice.
    expect(numbers.length).toBe(AI_TIME_BUDGETS.length);
  });

  it('is absent in test-model mode, where no model is being chosen', () => {
    render({ mode: 'test-model' });
    expect(container.querySelector('[data-ai-time-budgets="true"]')).toBeNull();
  });
});
