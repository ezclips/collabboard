// @vitest-environment jsdom

import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchAIProviders: vi.fn(),
  fetchAIRoles: vi.fn(),
  saveAIRole: vi.fn(),
}));

vi.mock('@/components/settings/ai/aiSettingsClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../settings/ai/aiSettingsClient')>()),
  fetchAIProviders: mocks.fetchAIProviders,
  fetchAIRoles: mocks.fetchAIRoles,
  saveAIRole: mocks.saveAIRole,
}));

import BoardAiChatModelChooser from './BoardAiChatModelChooser';
import { AI_ROLE_CHAT, AI_ROLES, isAIRole } from '@/lib/ai/aiRoles';
import { AI_ROLES as SETTINGS_ROLES, AI_ROLE_LABELS } from '../settings/ai/aiSettingsClient';

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const executable = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const CLIENT = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
const READER = read('components/collabboard/KnowledgeSourceReaderDrawer.tsx');
const CHOOSER = read('components/collabboard/BoardAiChatModelChooser.tsx');

let root: Root | null = null;
let host: HTMLElement;

async function mountChooser() {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(<BoardAiChatModelChooser />); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return host;
}

const connection = {
  id: 'conn-1', providerType: 'openai' as const, displayName: 'Work key',
  keyHint: '7f3a', defaultModel: 'gpt-4o', verifiedAt: null,
  createdAt: 'c', updatedAt: 'u',
};

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
  mocks.fetchAIProviders.mockResolvedValue([connection]);
  mocks.fetchAIRoles.mockResolvedValue({ [AI_ROLE_CHAT]: { connectionId: null, modelId: null } });
  mocks.saveAIRole.mockResolvedValue(undefined);
});
afterEach(async () => {
  if (root) { const r = root; await act(async () => r.unmount()); }
  root = null;
});

describe('36-42. the provider/model chooser is the existing role preference', () => {
  it('36. AI_ROLE_CHAT is a supported preference role everywhere the contract needs it', () => {
    // One canonical registry, and the settings client now derives from it
    // rather than keeping a competing literal list.
    expect(isAIRole(AI_ROLE_CHAT)).toBe(true);
    expect(AI_ROLES).toContain(AI_ROLE_CHAT);
    expect(SETTINGS_ROLES).toContain(AI_ROLE_CHAT);
    expect(AI_ROLE_LABELS[AI_ROLE_CHAT]).toBe('Board Chat');
    // The roles GET answers for every known role instead of a fourth copy.
    expect(read('app/api/settings/ai-roles/route.ts')).toContain('const ROLES = AI_ROLES;');
  });

  it('37. CollabBoard Default is the first option and the resting value', async () => {
    await mountChooser();
    const select = host.querySelector('[data-board-ai-chat-model=""]') as HTMLSelectElement;
    expect(select.options[0].textContent).toMatch(/CollabBoard Default/);
    expect(select.value).toBe('');
  });

  it('38. the user\'s own connections are offered, identified but never revealed', async () => {
    await mountChooser();
    const options = Array.from(host.querySelectorAll('option')).map((o) => o.textContent ?? '');
    expect(options.some((text) => text.includes('Work key'))).toBe(true);
    // Enough to tell two keys apart -- the masked hint the settings API already
    // publishes -- and nothing that could be used as a credential.
    expect(options.join(' ')).toContain('••7f3a');
    expect(options.join(' ')).not.toMatch(/sk-|apiKey|secret|Bearer/);
  });

  it('39. choosing writes through the existing role authority, not a new API', async () => {
    await mountChooser();
    const select = host.querySelector('[data-board-ai-chat-model=""]') as HTMLSelectElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!;
      setter.call(select, 'conn-1');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => { await Promise.resolve(); });
    expect(mocks.saveAIRole).toHaveBeenCalledWith(AI_ROLE_CHAT, 'conn-1', null);
  });

  it('a reflected selection reverts when the save fails, and says so safely', async () => {
    mocks.saveAIRole.mockRejectedValue(new Error('nope'));
    const onError = vi.fn();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => { root!.render(<BoardAiChatModelChooser onError={onError} />); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    const select = host.querySelector('[data-board-ai-chat-model=""]') as HTMLSelectElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!;
      setter.call(select, 'conn-1');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(onError).toHaveBeenCalledWith('Could not change the chat model.');
    expect((host.querySelector('[data-board-ai-chat-model=""]') as HTMLSelectElement).value).toBe('');
  });

  it('40-42. the chooser never becomes execution authority', () => {
    const chooser = executable(CHOOSER);
    // It talks to the settings API only; the chat route is never called from
    // here, so a selection cannot ride along with a message.
    expect(chooser).not.toContain('/ai/chat');
    expect(chooser).not.toMatch(/apiKey|connectionSecret|endpoint|baseUrl/);
    // And the drawer's POST body carries no execution fields either, so a
    // broken BYOK choice still fails at the resolver rather than falling back.
    const drawer = executable(read('components/collabboard/BoardAiChatDrawer.tsx'));
    // Asserted on the REQUEST, not on the file: the drawer legitimately reads
    // provider/model off a stored assistant turn to display it. What must not
    // happen is either travelling with a send.
    const body = drawer.slice(drawer.indexOf('body: JSON.stringify('), drawer.indexOf('});', drawer.indexOf('body: JSON.stringify(')));
    expect(body).toContain('{ message: content }');
    expect(body).toContain('{ threadId: activeThreadId, message: content }');
    expect(body).not.toMatch(/provider|model|apiKey|connectionId/);
  });
});

describe('1-9. the reader close seam', () => {
  const reader = executable(READER);

  it('1. the reader mount stays unconditional', () => {
    const mount = CLIENT.indexOf('<KnowledgeSourceReaderDrawer');
    expect(mount).toBeGreaterThan(-1);
    const preceding = CLIENT.slice(Math.max(0, mount - 400), mount).trimEnd();
    // The invariant the existing suites already hold: no && and no ternary.
    expect(preceding.endsWith('&&')).toBe(false);
    expect(preceding.endsWith('?')).toBe(false);
    expect(CLIENT.slice(mount - 200, mount)).not.toContain('isBoardAiChatOpen');
  });

  it('2-4. the close request is a monotonic id handled once', () => {
    expect(reader).toContain('closeSidePanelRequestId?: number;');
    expect(reader).toContain('const handledCloseRequestRef = useRef<number | null>(null);');
    // The same latch shape the two open requests already use.
    expect(reader).toContain('if (handledCloseRequestRef.current === closeSidePanelRequestId) return;');
    expect(reader).toContain('handledCloseRequestRef.current = closeSidePanelRequestId;');
    // A new id can close again, because the ref stores the LAST id, not a flag.
    expect(reader).not.toContain('const [closed, setClosed]');
  });

  it('5. a request while the reader is closed does nothing', () => {
    expect(reader).toContain('if (reader === null) return;');
  });

  it('6. the focused workspace is never closed by it', () => {
    expect(reader).toContain("if (presentation !== 'side-panel') return;");
    // Ordered before the close, so a workspace request cannot fall through.
    const effect = reader.slice(reader.indexOf('handledCloseRequestRef.current = closeSidePanelRequestId;'));
    expect(effect.indexOf("presentation !== 'side-panel'")).toBeLessThan(effect.indexOf('closeReader();'));
  });

  it('7. it reuses the existing close authority rather than resetting state itself', () => {
    const effect = reader.slice(
      reader.indexOf('if (closeSidePanelRequestId === undefined) return;'),
      reader.indexOf('}, [closeSidePanelRequestId, presentation]);'),
    );
    expect(effect).toContain('closeReader();');
    // No second reset: the read-generation guard stays inside closeReader.
    expect(effect).not.toContain('setReader(null)');
    expect(effect).not.toContain('readGenerationRef');
  });

  it('8-9. the blocking-editor yield and Escape precedence are untouched', () => {
    expect(reader).toContain("const yieldsToEditor = isWorkspace && blockingEditorOpen;");
    expect(reader).toContain('if (yieldsToEditor) return;');
    expect(reader).toContain('if (document.querySelector(KNOWLEDGE_LIBRARY_SELECTOR)) return;');
  });
});

describe('10-15. one right-side dock, two directions', () => {
  it('11. opening Chat asks the docked reader to yield', () => {
    expect(CLIENT).toContain('const openBoardAiChat = useCallback(() => {');
    expect(CLIENT).toContain('setCloseSidePanelRequestId((current) => current + 1);');
    expect(CLIENT).toContain('closeSidePanelRequestId={closeSidePanelRequestId}');
  });

  it('12. opening the docked reader closes Chat', () => {
    const opener = CLIENT.slice(
      CLIENT.indexOf('const requestKnowledgeDocumentOpen'),
      CLIENT.indexOf('const requestKnowledgeDocumentOpen') + 1200,
    );
    expect(opener).toContain('setIsBoardAiChatOpen(false);');
    expect(opener).toContain("const presentation = request.presentation ?? 'side-panel';");
  });

  it('13. the two directions are the ONLY ownership rule, and it lives in one place', () => {
    // Monotonic and never reset, so every open is a fresh intent.
    expect(CLIENT).toContain('const [closeSidePanelRequestId, setCloseSidePanelRequestId] = useState(0);');
    expect((CLIENT.match(/setCloseSidePanelRequestId\(/g) ?? []).length).toBe(2);
  });

  it('14-15. the workspace is untouched and the reader is never unmounted', () => {
    // Nothing conditions the mount, and no unmount path was introduced.
    expect(CLIENT).not.toContain('isBoardAiChatOpen && <KnowledgeSourceReaderDrawer');
    expect(CLIENT).not.toContain("knowledgeReaderPresentation === 'workspace' ?");
    // The close request is scoped in the reader, not by the board guessing.
    expect(executable(READER)).toContain("if (presentation !== 'side-panel') return;");
  });
});

describe('the board-level entry point', () => {
  it('mounts Chat as a shell sibling of the reader, not inside the sidebar', () => {
    const readerMount = CLIENT.indexOf('<KnowledgeSourceReaderDrawer');
    const chatMount = CLIENT.indexOf('<BoardAiChatDrawer');
    expect(chatMount).toBeGreaterThan(readerMount);
    expect(CLIENT.indexOf('</CanvasViewport>')).toBeLessThan(chatMount);
    expect(CLIENT).toContain('blockingEditorOpen={isBlockingEditorModalOpen}');
  });

  it('offers exactly one Board AI action, available to viewers', () => {
    expect((CLIENT.match(/data-board-ai-chat-open="true"/g) ?? []).length).toBe(1);
    // The element itself, from its opening tag to its close -- a wider window
    // would pick up unrelated board chrome and prove nothing.
    const marker = CLIENT.indexOf('data-board-ai-chat-open="true"');
    const button = CLIENT.slice(CLIENT.lastIndexOf('<button', marker), CLIENT.indexOf('</button>', marker));
    // Private reasoning is a read, so the entry point is NOT behind the
    // toolbar capability that gates board mutation.
    expect(button).not.toContain('canUseCanvasToolbar');
    // And its render guard is about editors owning the screen, not permission.
    const guard = CLIENT.slice(marker - 700, marker);
    expect(guard).toContain('!isBlockingEditorModalOpen && !isBoardAiChatOpen');
    expect(guard).not.toContain('canUseCanvasToolbar &&');
    expect(button).toContain('aria-label="Board AI"');
    expect(button).toContain('toggleBoardAiChat');
  });

  it('45,48. Chat offers no board mutation and no object-level AI entry points', () => {
    // Save as Note, context chips and per-card AI belong to later slices; a
    // viewer and an editor therefore see the same private surface.
    const drawer = executable(read('components/collabboard/BoardAiChatDrawer.tsx'));
    for (const forbidden of ['Save as Note', 'Add to Chat', 'Ask AI', 'createNote', 'padletToEdit']) {
      expect(drawer).not.toContain(forbidden);
    }
    expect((CLIENT.match(/data-board-ai-chat-open/g) ?? []).length).toBe(1);
  });
});
