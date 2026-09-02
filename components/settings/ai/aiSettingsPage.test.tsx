// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_ROLES } from '@/lib/ai/aiRoles';

/**
 * BYOK AI Settings UI -- Phase 2B.
 *
 * The session-token helper and the toast layer are the only things stubbed;
 * every request goes through the real client module against a stubbed `fetch`,
 * so these assertions cover the actual wire contract the routes expect.
 */

const getSessionAccessToken = vi.fn(async () => 'test-token');
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock('@/lib/infra/supabase/sessionToken', () => ({
  getSessionAccessToken: () => getSessionAccessToken(),
}));

vi.mock('sonner', () => ({
  toast: { success: (m: string) => toastSuccess(m), error: (m: string) => toastError(m) },
}));

import AISettingsPage from '@/app/dashboard/settings/ai/page';

const OPENAI_PROVIDER = {
  id: '11111111-1111-4111-8111-111111111111',
  providerType: 'openai',
  displayName: 'My OpenAI',
  keyHint: 'aB3d',
  defaultModel: 'gpt-4.1-mini',
  verifiedAt: '2026-02-03T14:05:00.000Z',
  createdAt: '2026-02-01T10:00:00.000Z',
  updatedAt: '2026-02-03T14:05:00.000Z',
};

const NO_MODEL_PROVIDER = {
  ...OPENAI_PROVIDER,
  id: '22222222-2222-4222-8222-222222222222',
  displayName: 'Bare Anthropic',
  providerType: 'anthropic',
  defaultModel: null,
  verifiedAt: null,
};

interface FetchCall {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: unknown;
}

let container: HTMLDivElement;
let root: Root;
let calls: FetchCall[];

/** Queue-driven fetch: each entry is [status, payload] for the next request. */
function stubFetch(handler: (url: string, method: string) => { status: number; payload: unknown }) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({
      url,
      method,
      headers,
      body: init?.body ? JSON.parse(init.body as string) : undefined,
    });
    const { status, payload } = handler(url, method);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => payload,
    } as unknown as Response;
  }));
}

const defaultHandler = (url: string, method: string) => {
  if (url.includes('/ai-providers') && method === 'GET') {
    return { status: 200, payload: { providers: [OPENAI_PROVIDER] } };
  }
  if (url.includes('/ai-roles') && method === 'GET') {
    return { status: 200, payload: { roles: { 'source-ai': { connectionId: null, modelId: null }, edit: { connectionId: null, modelId: null } } } };
  }
  return { status: 200, payload: { provider: OPENAI_PROVIDER, success: true, ok: true, verifiedAt: null, role: 'edit' } };
};

async function render() {
  await act(async () => {
    root.render(<AISettingsPage />);
  });
}

function text() {
  return container.textContent ?? '';
}

function findByLabel(label: string): HTMLElement | null {
  return container.querySelector(`[aria-label="${label}"]`);
}

function buttonWithText(label: string): HTMLButtonElement | null {
  return Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent?.trim() === label,
  ) ?? null;
}

/** Scoped to the modal: the role rows have their own "Save" buttons. */
function dialogButton(label: string): HTMLButtonElement | null {
  const dialog = container.querySelector('[role="dialog"]');
  if (!dialog) return null;
  return Array.from(dialog.querySelectorAll('button')).find(
    (button) => button.textContent?.trim() === label,
  ) ?? null;
}

/** The Save button belonging to one role row. */
function roleSaveButton(role: string): HTMLButtonElement | null {
  const row = container.querySelector(`[data-testid="ai-role-row-${role}"]`);
  return (row?.querySelector('button') as HTMLButtonElement | null) ?? null;
}

function requestFor(url: string, method: string): FetchCall | undefined {
  return calls.find((call) => call.url === url && call.method === method);
}

/** Lets chained awaits inside a handler settle, not just the first microtask. */
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function click(element: Element | null) {
  await act(async () => {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await flush();
}

async function setValue(element: HTMLElement | null, value: string) {
  await act(async () => {
    const input = element as HTMLInputElement | HTMLSelectElement;
    const proto = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
}

beforeEach(() => {
  calls = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  getSessionAccessToken.mockResolvedValue('test-token');
  toastSuccess.mockClear();
  toastError.mockClear();
  stubFetch(defaultHandler);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('AI settings: initial load', () => {
  it('1. fetches providers and roles with a bearer token', async () => {
    await render();
    const providerCall = calls.find((call) => call.url === '/api/settings/ai-providers');
    const rolesCall = calls.find((call) => call.url === '/api/settings/ai-roles');
    expect(providerCall?.headers.Authorization).toBe('Bearer test-token');
    expect(rolesCall?.headers.Authorization).toBe('Bearer test-token');
  });

  it('2. renders the CollabBoard Default card and the configured provider', async () => {
    await render();
    expect(text()).toContain('CollabBoard Default');
    expect(text()).toContain('No API key required');
    expect(text()).toContain('My OpenAI');
    expect(text()).toContain('OpenAI');
  });

  it('3. renders the masked key hint and never a raw or encrypted key', async () => {
    await render();
    expect(text()).toContain('••••aB3d');
    expect(text()).not.toContain('apiKey');
    expect(text()).not.toContain('api_key_encrypted');
    expect(text()).not.toContain('ciphertext');
  });

  it('4. renders one row per configurable role, and no more', async () => {
    // Board Chat joined at BCHAT-C: its provider/model is the SAME per-user
    // role preference every other AI surface uses, so it is configured here
    // rather than in a second settings screen. The count follows the canonical
    // registry instead of a hard-coded number, so the next role needs no edit.
    await render();
    for (const role of AI_ROLES) {
      expect(container.querySelector(`[data-testid="ai-role-row-${role}"]`), role).not.toBeNull();
    }
    expect(container.querySelectorAll('[data-testid^="ai-role-row-"]')).toHaveLength(AI_ROLES.length);
    expect(text()).toContain('Source AI');
    expect(text()).toContain('Edit & Rewrite');
    expect(text()).toContain('Board Chat');
  });

  it('5. reflects a stored role selection', async () => {
    stubFetch((url, method) => {
      if (url.includes('/ai-roles') && method === 'GET') {
        return {
          status: 200,
          payload: {
            roles: {
              'source-ai': { connectionId: OPENAI_PROVIDER.id, modelId: 'gpt-4o' },
              edit: { connectionId: null, modelId: null },
            },
          },
        };
      }
      return defaultHandler(url, method);
    });
    await render();
    const select = findByLabel('Provider for Source AI') as HTMLSelectElement;
    expect(select.value).toBe(OPENAI_PROVIDER.id);
    expect((findByLabel('Model for Source AI') as HTMLInputElement).value).toBe('gpt-4o');
  });

  it('6. shows a usable error state and fabricates nothing when loading fails', async () => {
    stubFetch(() => ({ status: 500, payload: { error: 'Could not load provider connections.' } }));
    await render();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Could not load');
    expect(text()).not.toContain('My OpenAI');
    expect(toastError).toHaveBeenCalled();
  });
});

describe('AI settings: add provider', () => {
  it('7. offers exactly the four supported providers, with no DeepSeek or custom option', async () => {
    await render();
    await click(buttonWithText('Add provider'));
    const options = Array.from(
      (findByLabel('Provider') as HTMLSelectElement).querySelectorAll('option'),
    ).map((option) => option.value);
    expect(options).toEqual(['openai', 'anthropic', 'gemini', 'openrouter']);
    expect(text().toLowerCase()).not.toContain('deepseek —');
    expect(text().toLowerCase()).not.toContain('custom');
    expect(text().toLowerCase()).not.toContain('base url');
  });

  it('8. uses a password input with no reveal control', async () => {
    await render();
    await click(buttonWithText('Add provider'));
    expect((findByLabel('API key') as HTMLInputElement).type).toBe('password');
    expect(container.querySelector('[aria-label*="Show"]')).toBeNull();
    expect(container.querySelector('[aria-label*="reveal" i]')).toBeNull();
  });

  it('9. POSTs the exact create contract with a bearer token', async () => {
    await render();
    await click(buttonWithText('Add provider'));
    await setValue(findByLabel('Display name'), 'Work OpenAI');
    await setValue(findByLabel('API key'), 'sk-test-abcdefgh');
    await setValue(findByLabel('Default model'), 'gpt-4.1-mini');
    await click(dialogButton('Save'));

    const post = requestFor('/api/settings/ai-providers', 'POST');
    expect(post?.headers.Authorization).toBe('Bearer test-token');
    expect(post?.body).toEqual({
      providerType: 'openai',
      displayName: 'Work OpenAI',
      apiKey: 'sk-test-abcdefgh',
      defaultModel: 'gpt-4.1-mini',
    });
  });

  it('10. clears the key, closes, and reloads the list after a successful create', async () => {
    await render();
    await click(buttonWithText('Add provider'));
    await setValue(findByLabel('API key'), 'sk-test-abcdefgh');
    await click(dialogButton('Save'));

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(text()).not.toContain('sk-test-abcdefgh');
    const reloads = calls.filter((call) => call.url === '/api/settings/ai-providers' && call.method === 'GET');
    expect(reloads.length).toBeGreaterThan(1);
  });
});

describe('AI settings: edit', () => {
  it('11. cannot change provider type and sends only safe fields', async () => {
    await render();
    await click(buttonWithText('Edit'));
    expect(findByLabel('Provider')).toBeNull();
    expect(findByLabel('API key')).toBeNull();

    await setValue(findByLabel('Display name'), 'Renamed');
    await click(dialogButton('Save'));

    const patch = calls.find((call) => call.method === 'PATCH');
    expect(Object.keys(patch?.body as object).sort()).toEqual(['defaultModel', 'displayName']);
    expect(patch?.body).not.toHaveProperty('verifiedAt');
    expect(patch?.body).not.toHaveProperty('keyHint');
    expect(patch?.body).not.toHaveProperty('providerType');
  });
});

describe('AI settings: replace key', () => {
  it('12. sends only the new key and never renders it afterwards', async () => {
    await render();
    await click(buttonWithText('Replace key'));
    expect((findByLabel('New API key') as HTMLInputElement).type).toBe('password');

    await setValue(findByLabel('New API key'), 'sk-replacement-1234');
    await click(dialogButton('Save'));

    const put = calls.find((call) => call.method === 'PUT' && call.url.endsWith('/key'));
    expect(put?.body).toEqual({ apiKey: 'sk-replacement-1234' });
    expect(text()).not.toContain('sk-replacement-1234');
  });
});

describe('AI settings: test connection', () => {
  it('13. posts to the test endpoint and sends no user content', async () => {
    await render();
    await click(buttonWithText('Test connection'));
    const test = calls.find((call) => call.url.endsWith('/test'));
    expect(test?.method).toBe('POST');
    expect(test?.body).toEqual({});
  });

  it('14. shows a transient success and refreshes the verified timestamp', async () => {
    stubFetch((url, method) => {
      if (url.endsWith('/test')) {
        return { status: 200, payload: { ok: true, verifiedAt: '2026-03-09T09:30:00.000Z' } };
      }
      return defaultHandler(url, method);
    });
    await render();
    await click(buttonWithText('Test connection'));
    expect(text()).toContain('Connection verified');
    expect(text()).toContain('Last verified');
  });

  it('15. a provider auth failure (400) shows a failure without touching the session', async () => {
    stubFetch((url, method) => {
      if (url.endsWith('/test')) {
        return {
          status: 400,
          payload: { error: 'The provider rejected the credential.', category: 'authentication_failed' },
        };
      }
      return defaultHandler(url, method);
    });
    await render();
    await click(buttonWithText('Test connection'));

    expect(text()).toContain('Test failed');
    // The historical stamp survives a failed test.
    expect(text()).toContain('Last verified');
    expect(toastError).toHaveBeenCalledWith('The provider rejected the credential.');
    expect(toastError).not.toHaveBeenCalledWith(expect.stringContaining('session'));
  });

  it('16. a CollabBoard 401 is reported as a session problem instead', async () => {
    stubFetch((url, method) => {
      if (url.endsWith('/test')) return { status: 401, payload: { error: 'Unauthorized' } };
      return defaultHandler(url, method);
    });
    await render();
    await click(buttonWithText('Test connection'));
    expect(toastError).toHaveBeenCalledWith('Your session expired. Please sign in again.');
  });

  it('17. never renders provider model output', async () => {
    stubFetch((url, method) => {
      if (url.endsWith('/test')) return { status: 200, payload: { ok: true, verifiedAt: null } };
      return defaultHandler(url, method);
    });
    await render();
    await click(buttonWithText('Test connection'));
    expect(text()).not.toContain('OK');
  });

  it('18. asks for a model first when the provider has no default', async () => {
    stubFetch((url, method) => {
      if (url === '/api/settings/ai-providers' && method === 'GET') {
        return { status: 200, payload: { providers: [NO_MODEL_PROVIDER] } };
      }
      if (url.endsWith('/test')) return { status: 200, payload: { ok: true, verifiedAt: null } };
      return defaultHandler(url, method);
    });
    await render();
    await click(buttonWithText('Test connection'));

    expect(findByLabel('Model ID for this test')).not.toBeNull();
    await setValue(findByLabel('Model ID for this test'), 'claude-sonnet-4');
    await click(buttonWithText('Run test'));

    const test = calls.find((call) => call.url.endsWith('/test'));
    expect(test?.body).toEqual({ model: 'claude-sonnet-4' });
    // A test-only model must not be persisted to the provider.
    expect(calls.some((call) => call.method === 'PATCH')).toBe(false);
  });
});

describe('AI settings: delete', () => {
  it('19. requires confirmation before issuing the DELETE', async () => {
    await render();
    await click(buttonWithText('Delete'));
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
    expect(text()).toContain('fall back to CollabBoard Default');

    await click(buttonWithText('Delete provider'));
    expect(calls.some((call) => call.method === 'DELETE')).toBe(true);
  });

  it('20. reloads providers AND roles so a freed role shows the default', async () => {
    await render();
    const before = calls.filter((call) => call.url === '/api/settings/ai-roles' && call.method === 'GET').length;
    await click(buttonWithText('Delete'));
    await click(buttonWithText('Delete provider'));
    const after = calls.filter((call) => call.url === '/api/settings/ai-roles' && call.method === 'GET').length;
    expect(after).toBeGreaterThan(before);
  });
});

describe('AI settings: roles', () => {
  it('21. lists CollabBoard Default first, then owned connections', async () => {
    await render();
    const options = Array.from(
      (findByLabel('Provider for Source AI') as HTMLSelectElement).querySelectorAll('option'),
    );
    expect(options[0].value).toBe('');
    expect(options[0].textContent).toContain('CollabBoard Default');
    expect(options[1].value).toBe(OPENAI_PROVIDER.id);
  });

  it('22. saving the default sends null connection and null model', async () => {
    await render();
    await click(roleSaveButton('source-ai'));
    const put = requestFor('/api/settings/ai-roles', 'PUT');
    expect(put).toBeDefined();
    expect(put?.body).toEqual({ role: 'source-ai', connectionId: null, modelId: null });
  });

  it('23. the model field is read-only on CollabBoard Default', async () => {
    await render();
    const model = findByLabel('Model for Source AI') as HTMLInputElement;
    expect(model.disabled).toBe(true);
    expect(model.value).toBe('deepseek-chat');
  });

  it('24. a blank override on a provider with a default saves null and shows the default', async () => {
    await render();
    await setValue(findByLabel('Provider for Source AI'), OPENAI_PROVIDER.id);
    expect(text()).toContain('Uses default: gpt-4.1-mini');

    await click(roleSaveButton('source-ai'));
    const put = requestFor('/api/settings/ai-roles', 'PUT');
    expect(put?.body).toEqual({ role: 'source-ai', connectionId: OPENAI_PROVIDER.id, modelId: null });
  });

  it('25. blocks Save when neither an override nor a provider default exists', async () => {
    stubFetch((url, method) => {
      if (url === '/api/settings/ai-providers' && method === 'GET') {
        return { status: 200, payload: { providers: [NO_MODEL_PROVIDER] } };
      }
      return defaultHandler(url, method);
    });
    await render();
    await setValue(findByLabel('Provider for Source AI'), NO_MODEL_PROVIDER.id);

    expect(text()).toContain('A model is required for this provider.');
    expect(roleSaveButton('source-ai')?.disabled).toBe(true);
  });

  it('26. sends a typed model override verbatim and no execution fields', async () => {
    await render();
    await setValue(findByLabel('Provider for Source AI'), OPENAI_PROVIDER.id);
    await setValue(findByLabel('Model for Source AI'), 'gpt-4o');
    await click(roleSaveButton('source-ai'));

    const put = requestFor('/api/settings/ai-roles', 'PUT');
    expect(put?.body).toEqual({ role: 'source-ai', connectionId: OPENAI_PROVIDER.id, modelId: 'gpt-4o' });
    expect(put?.body).not.toHaveProperty('provider');
    expect(put?.body).not.toHaveProperty('apiKey');
  });
});

describe('AI settings: verification labelling', () => {
  it('27. renders history as "Last verified", never a bare "Verified" badge', async () => {
    await render();
    expect(text()).toContain('Last verified');
    expect(text()).not.toMatch(/(^|[^t] )Verified\b(?! )/);
  });

  it('28. shows nothing verified for a never-tested provider', async () => {
    stubFetch((url, method) => {
      if (url === '/api/settings/ai-providers' && method === 'GET') {
        return { status: 200, payload: { providers: [NO_MODEL_PROVIDER] } };
      }
      return defaultHandler(url, method);
    });
    await render();
    expect(text()).not.toContain('Last verified');
  });
});
