// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import BoardWikiDrawer from './BoardWikiDrawer';
import type { BoardWikiProposal } from '@/lib/domain/wiki/boardWikiEditing';

/**
 * WIKI UNIT 2 -- the page surface.
 *
 * Three things here are acceptance criteria rather than behaviour checks, and
 * they are grouped at the end: the chain cannot be collapsed away, no path runs
 * from compile output to a stored page without a person acting twice, and the
 * surface is actually MOUNTED somewhere a user can reach -- item 15 was a
 * finished component whose only launcher had been deleted, so it existed and
 * could not be opened.
 */

const BOARD = 'board-1';
const PAGE = 'page-1';
const DOC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const POST = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const componentSource = readFileSync(
  path.join(process.cwd(), 'components/collabboard/BoardWikiDrawer.tsx'), 'utf8');
const hostSource = readFileSync(
  path.join(process.cwd(), 'app/dashboard/canvas/[id]/CanvasClient.tsx'), 'utf8');

const docSourceView = (state: 'current' | 'stale' | 'gone') => ({
  item: { type: 'knowledge-page', knowledgeDocumentId: DOC, pageNumber: 6, label: 'handbook — page 6' },
  version: { kind: 'document', contentSha256: 'sha-1', updatedAt: '2026-09-01T00:00:00Z' },
  state,
});

const postSourceView = (state: 'current' | 'stale' | 'gone') => ({
  item: { type: 'padlet', padletId: POST, label: 'a board post' },
  version: { kind: 'post', updatedAt: '2026-09-01T00:00:00Z' },
  state,
});

const pageBody = (overrides: Record<string, unknown> = {}) => ({
  page: {
    id: PAGE,
    slug: 'horn-replacement',
    title: 'Horn replacement',
    content: 'Line one.\nLine two.',
    compiledAt: null,
    updatedAt: '2026-09-19T10:00:00Z',
  },
  sources: [docSourceView('current')],
  freshness: 'current',
  ...overrides,
});

const proposal: BoardWikiProposal = {
  id: 'proposal-1',
  content: 'Line one.\nRewritten by a compilation.',
  sources: [{ item: postSourceView('current').item, version: { kind: 'post', updatedAt: 'z' } }] as never,
  basedOnContent: 'Line one.\nLine two.',
  createdAt: '2026-09-19T11:00:00Z',
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const saved: { body: unknown } = { body: null };

function stubFetch(pageOverrides: Record<string, unknown> = {}, saveStatus = 200) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'PATCH') {
      saved.body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ page: { id: PAGE, title: 'x', updatedAt: 'y' } }), { status: saveStatus });
    }
    if (init?.method === 'POST') {
      return new Response(JSON.stringify({ page: { id: PAGE, slug: 's', title: 't' } }), { status: 201 });
    }
    if (String(url).endsWith(`/wiki/${PAGE}`)) {
      return new Response(JSON.stringify(pageBody(pageOverrides)), { status: 200 });
    }
    return new Response(JSON.stringify({
      pages: [{ id: PAGE, slug: 'horn-replacement', title: 'Horn replacement', updatedAt: 'u', sourceCount: 1 }],
    }), { status: 200 });
  }));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  saved.body = null;
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.unstubAllGlobals();
});

async function mount(props: Partial<React.ComponentProps<typeof BoardWikiDrawer>> = {}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <BoardWikiDrawer boardId={BOARD} isOpen onClose={vi.fn()} canEdit {...props} />,
    );
  });
  return host;
}

/** Open the only page in the list, which is how every case below starts. */
async function openPage(container: HTMLElement) {
  await act(async () => {
    (container.querySelector(`[data-board-wiki-page-item="${PAGE}"]`) as HTMLButtonElement).click();
  });
}

const content = (c: HTMLElement) => c.querySelector('[data-board-wiki-content="true"]') as HTMLTextAreaElement;
const titleField = (c: HTMLElement) => c.querySelector('[data-board-wiki-title="true"]') as HTMLInputElement;
const saveButton = (c: HTMLElement) => c.querySelector('[data-board-wiki-save="true"]') as HTMLButtonElement;

async function type(element: HTMLTextAreaElement | HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
    'value',
  )!.set!;
  await act(async () => {
    setter.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('reading and editing a page in place', () => {
  it('loads the page and shows its text', async () => {
    stubFetch();
    const container = await mount();
    await openPage(container);
    expect(content(container).value).toBe('Line one.\nLine two.');
    expect(titleField(container).value).toBe('Horn replacement');
  });

  it('Save is dead until something actually changed', async () => {
    stubFetch();
    const container = await mount();
    await openPage(container);
    expect(saveButton(container).disabled).toBe(true);
    await type(content(container), 'Line one.\nEdited.');
    expect(saveButton(container).disabled).toBe(false);
    expect(container.querySelector('[data-board-wiki-dirty="true"]')).not.toBeNull();
  });

  it('a viewer gets the page and its chain, and no controls that write', async () => {
    stubFetch();
    const container = await mount({ canEdit: false });
    await openPage(container);
    expect(content(container).readOnly).toBe(true);
    expect(titleField(container).readOnly).toBe(true);
    expect(saveButton(container)).toBeNull();
    expect(container.querySelector('[data-board-wiki-create="true"]')).toBeNull();
    // But the chain is still there: reading a page includes reading what it
    // was compiled from.
    expect(container.querySelector('[data-board-wiki-sources="true"]')).not.toBeNull();
  });

  it('sends source IDENTITIES with the save, and no version', async () => {
    stubFetch();
    const container = await mount();
    await openPage(container);
    await type(content(container), 'Edited.');
    await act(async () => { saveButton(container).click(); });

    const body = saved.body as { sources: readonly Record<string, unknown>[]; baseUpdatedAt: string };
    expect(body.baseUpdatedAt).toBe('2026-09-19T10:00:00Z');
    expect(body.sources).toHaveLength(1);
    expect(body.sources[0]).not.toHaveProperty('version');
  });

  it('a conflict keeps the user text on screen and says so', async () => {
    // Reloading automatically here would discard exactly the work the conflict
    // is about.
    stubFetch({}, 409);
    const container = await mount();
    await openPage(container);
    await type(content(container), 'My paragraph.');
    await act(async () => { saveButton(container).click(); });

    expect(content(container).value).toBe('My paragraph.');
    expect(container.querySelector('[data-board-wiki-status="true"]')!.textContent)
      .toContain('changed while you were editing it');
  });
});

describe('the sources chain, and the states derived for it', () => {
  it('renders a stale source as changed and a gone source as deleted', async () => {
    stubFetch({
      sources: [docSourceView('stale'), postSourceView('gone')],
      freshness: 'sources-gone',
    });
    const container = await mount({ onOpenCitation: vi.fn() });
    await openPage(container);

    const chips = [...container.querySelectorAll('[data-board-wiki-source]')];
    expect(chips.map((chip) => chip.getAttribute('data-board-wiki-source'))).toEqual(['stale', 'gone']);
    expect(chips[0].textContent).toContain('(changed)');
    expect(chips[1].textContent).toContain('(deleted)');
  });

  it('says the harder thing when a source is gone', async () => {
    // Gone outranks stale: a stale page can be refreshed from its sources and
    // this one cannot be fully refreshed at all.
    stubFetch({ sources: [docSourceView('stale'), postSourceView('gone')], freshness: 'sources-gone' });
    const container = await mount();
    await openPage(container);
    const banner = container.querySelector('[data-board-wiki-freshness="sources-gone"]')!;
    expect(banner.textContent).toContain('no longer exists');
  });

  it('a gone source does not navigate anywhere', async () => {
    // A chip that navigates nowhere reads as a broken page rather than as a
    // deleted source. Item 15's rule, kept.
    const onOpenCitation = vi.fn();
    stubFetch({ sources: [docSourceView('gone')], freshness: 'sources-gone' });
    const container = await mount({ onOpenCitation });
    await openPage(container);

    const chip = container.querySelector('[data-board-wiki-source="gone"]')!;
    expect(chip.tagName).toBe('SPAN');
    await act(async () => { (chip as HTMLElement).click(); });
    expect(onOpenCitation).not.toHaveBeenCalled();
  });

  it('a live knowledge source opens its page in the reader', async () => {
    const onOpenCitation = vi.fn();
    stubFetch();
    const container = await mount({ onOpenCitation });
    await openPage(container);
    await act(async () => {
      (container.querySelector('[data-board-wiki-source="current"]') as HTMLButtonElement).click();
    });
    expect(onOpenCitation).toHaveBeenCalledWith({ knowledgeDocumentId: DOC, pageNumber: 6 });
  });

  it('a page written by hand says so rather than showing an empty list', async () => {
    stubFetch({ sources: [] });
    const container = await mount();
    await openPage(container);
    expect(container.querySelector('[data-board-wiki-sources="true"]')!.textContent)
      .toContain('written by hand');
  });
});

describe('refresh is a proposal: diff, apply, discard', () => {
  it('shows no Refresh control at all while no compiler exists', async () => {
    // Unit 3 supplies it. Rendering it inert would promise something no code
    // does -- which is how a surface starts lying about itself.
    stubFetch();
    const container = await mount();
    await openPage(container);
    expect(container.querySelector('[data-board-wiki-refresh="true"]')).toBeNull();
  });

  it('shows a line diff rather than two walls of text', async () => {
    stubFetch();
    const container = await mount({ onRequestRecompile: async () => proposal });
    await openPage(container);
    await act(async () => {
      (container.querySelector('[data-board-wiki-refresh="true"]') as HTMLButtonElement).click();
    });

    const kinds = [...container.querySelectorAll('[data-board-wiki-diff-line]')]
      .map((line) => line.getAttribute('data-board-wiki-diff-line'));
    expect(kinds).toEqual(['same', 'removed', 'added']);
  });

  it('APPLY writes to the draft and stores nothing', async () => {
    stubFetch();
    const container = await mount({ onRequestRecompile: async () => proposal });
    await openPage(container);
    await act(async () => {
      (container.querySelector('[data-board-wiki-refresh="true"]') as HTMLButtonElement).click();
    });
    await act(async () => {
      (container.querySelector('[data-board-wiki-proposal-apply="true"]') as HTMLButtonElement).click();
    });

    expect(content(container).value).toBe('Line one.\nRewritten by a compilation.');
    // The decisive assertion: applying issued no write. The page is unsaved and
    // the Save button is the only thing that stores anything.
    expect(saved.body).toBeNull();
    expect(saveButton(container).disabled).toBe(false);
    expect(container.querySelector('[data-board-wiki-dirty="true"]')).not.toBeNull();
  });

  it('DISCARD leaves the page exactly as it was', async () => {
    stubFetch();
    const container = await mount({ onRequestRecompile: async () => proposal });
    await openPage(container);
    await act(async () => {
      (container.querySelector('[data-board-wiki-refresh="true"]') as HTMLButtonElement).click();
    });
    await act(async () => {
      (container.querySelector('[data-board-wiki-proposal-discard="true"]') as HTMLButtonElement).click();
    });

    expect(container.querySelector('[data-board-wiki-proposal="true"]')).toBeNull();
    expect(content(container).value).toBe('Line one.\nLine two.');
    expect(saveButton(container).disabled).toBe(true);
  });

  it('applying never touches the title, because a proposal has none', async () => {
    stubFetch();
    const container = await mount({ onRequestRecompile: async () => proposal });
    await openPage(container);
    await type(titleField(container), 'A title a person chose');
    await act(async () => {
      (container.querySelector('[data-board-wiki-refresh="true"]') as HTMLButtonElement).click();
    });
    await act(async () => {
      (container.querySelector('[data-board-wiki-proposal-apply="true"]') as HTMLButtonElement).click();
    });
    expect(titleField(container).value).toBe('A title a person chose');
  });
});

describe('A RECOMPILE ARRIVES WHILE THE USER HAS UNSAVED EDITS', () => {
  it('warns, and changes nothing until the user chooses', async () => {
    stubFetch();
    const container = await mount({ onRequestRecompile: async () => proposal });
    await openPage(container);
    await type(content(container), 'Half a sentence I am still writ');

    await act(async () => {
      (container.querySelector('[data-board-wiki-refresh="true"]') as HTMLButtonElement).click();
    });

    expect(container.querySelector('[data-board-wiki-proposal-warning="unsaved-edits"]')!.textContent)
      .toContain('not stored anywhere else');
    // The arrival edited nothing.
    expect(content(container).value).toBe('Half a sentence I am still writ');
    expect(saved.body).toBeNull();
  });

  it('warns about BOTH losses when the page also moved underneath the proposal', async () => {
    stubFetch();
    const container = await mount({
      onRequestRecompile: async () => ({ ...proposal, basedOnContent: 'what the page said an hour ago' }),
    });
    await openPage(container);
    await type(content(container), 'and I am editing it');

    await act(async () => {
      (container.querySelector('[data-board-wiki-refresh="true"]') as HTMLButtonElement).click();
    });

    expect(container.querySelector('[data-board-wiki-proposal-warning="unsaved-edits"]')).not.toBeNull();
    expect(container.querySelector('[data-board-wiki-proposal-warning="page-moved"]')).not.toBeNull();
  });

  it('discarding after the warning leaves the unsaved edits intact', async () => {
    // The whole point of the warning is that the user can decline. If declining
    // cost them their text the warning would be a formality.
    stubFetch();
    const container = await mount({ onRequestRecompile: async () => proposal });
    await openPage(container);
    await type(content(container), 'Half a sentence I am still writ');
    await act(async () => {
      (container.querySelector('[data-board-wiki-refresh="true"]') as HTMLButtonElement).click();
    });
    await act(async () => {
      (container.querySelector('[data-board-wiki-proposal-discard="true"]') as HTMLButtonElement).click();
    });
    expect(content(container).value).toBe('Half a sentence I am still writ');
  });
});

describe('UNIT 2 ACCEPTANCE, checked in source rather than behaviour', () => {
  it('NO PATH RUNS FROM COMPILE OUTPUT TO A STORED PAGE', () => {
    // The proposal reaches exactly one place -- the draft -- and the save body
    // is built from the draft by the single domain function that produces one.
    // A `fetch` carrying a proposal anywhere would be the automatic write path.
    expect(componentSource).toContain('setDraft(applyProposalToDraft(draft, proposal))');
    const writes = [...componentSource.matchAll(/method: '(POST|PATCH|PUT|DELETE)'[\s\S]{0,400}?\}\)/g)]
      .map((match) => match[0]);
    expect(writes.length).toBeGreaterThan(0);
    for (const write of writes) expect(write).not.toMatch(/proposal/i);
    expect(componentSource).toContain('body: JSON.stringify(boardWikiSaveRequestFromDraft(draft))');
  });

  it('THE CHAIN CANNOT BE COLLAPSED AWAY', () => {
    // P1 accepted lexical retrieval NOW on the condition that the compiled
    // input set is visible with the page. A collapsed chain is a chain nobody
    // reads, and then the page is an unsourced assertion with a reassuring
    // affordance beside it.
    const chain = componentSource.slice(componentSource.indexOf('data-board-wiki-sources'));
    const section = chain.slice(0, chain.indexOf('</section>'));
    expect(section).not.toMatch(/\bdetails\b|\bsummary\b|collapsed|showSources|isExpanded/i);
    // And it is not conditional on anything: no `canEdit`, no state flag.
    expect(componentSource).not.toMatch(/\{\s*\w+\s*&&\s*\(?\s*<section data-board-wiki-sources/);
  });

  it('THE SURFACE IS MOUNTED, AND HAS A LAUNCHER A USER CAN REACH', () => {
    // Item 15: KnowledgeDocumentsList was finished, tested, and unreachable --
    // its only launcher had been removed by an unrelated change, so a control
    // placed there would have been a control nobody could click. A mount
    // without a launcher is the same defect one step earlier.
    expect(hostSource).toContain("import BoardWikiDrawer from '@/components/collabboard/BoardWikiDrawer'");
    expect(hostSource).toContain('<BoardWikiDrawer');
    expect(hostSource).toContain('data-board-wiki-open="true"');
    // The launcher sets the state the drawer reads, so the two are actually
    // connected rather than merely both present.
    expect(hostSource).toContain('onClick={() => setIsBoardWikiOpen(true)}');
    expect(hostSource).toMatch(/<BoardWikiDrawer[\s\S]{0,400}isOpen=\{isBoardWikiOpen\}/);
  });

  it('the surface yields to a blocking editor, like every other floating control', async () => {
    stubFetch();
    const container = await mount({ blockingEditorOpen: true });
    expect(container.querySelector('[data-board-wiki-drawer="true"]')).toBeNull();
  });
});
