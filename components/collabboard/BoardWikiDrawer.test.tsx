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
 * The archive and the download are stubbed, not exercised: JSZip's output is
 * its own project's business, and a real saveAs would be a jsdom no-op that
 * proves nothing. What IS asserted is everything between the response and
 * them -- which entries were put in the archive, under which names, and
 * whether anything was handed to the browser at all when the bundle was bad.
 */
const zipState = vi.hoisted(() => ({
  entries: [] as { name: string; content: string }[],
  generated: 0,
  savedBlob: null as unknown,
  savedName: null as string | null,
}));

vi.mock('jszip', () => ({
  default: class {
    file(name: string, content: string) {
      zipState.entries.push({ name, content });
    }
    async generateAsync() {
      zipState.generated += 1;
      return new Blob(['archive']);
    }
  },
}));

vi.mock('file-saver', () => ({
  saveAs: (blob: unknown, name: string) => {
    zipState.savedBlob = blob;
    zipState.savedName = name;
  },
}));

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
const deleted: { calls: number; method: string | null } = { calls: 0, method: null };

/** What the export endpoint answers with. Reset per test, like the rest. */
const exported: { status: number; body: unknown } = { status: 200, body: null };

function stubFetch(pageOverrides: Record<string, unknown> = {}, saveStatus = 200, deleteStatus = 200) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).endsWith('/wiki/export')) {
      return new Response(JSON.stringify(exported.body), { status: exported.status });
    }
    if (init?.method === 'DELETE') {
      deleted.calls += 1;
      deleted.method = 'DELETE';
      return new Response(JSON.stringify({ deleted: deleteStatus === 200 }), { status: deleteStatus });
    }
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
  deleted.calls = 0;
  deleted.method = null;
  exported.status = 200;
  exported.body = { files: { 'index.md': '# Board wiki\n', 'horn-replacement.md': 'page text' } };
  zipState.entries = [];
  zipState.generated = 0;
  zipState.savedBlob = null;
  zipState.savedName = null;
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

  it('COMPILES ON THE TITLE, not on the page\'s own content', async () => {
    // Feeding a compilation its own previous output drifts a page away from the
    // board over successive refreshes. The title is the one thing on the page a
    // person definitely wrote.
    const onRequestRecompile = vi.fn(async () => proposal);
    stubFetch();
    const container = await mount({ onRequestRecompile });
    await openPage(container);
    await act(async () => {
      (container.querySelector('[data-board-wiki-refresh="true"]') as HTMLButtonElement).click();
    });
    expect(onRequestRecompile).toHaveBeenCalledWith(PAGE, 'Horn replacement');
  });

  it('SAYS "nothing on that topic" AND "try again" DIFFERENTLY', async () => {
    // Two different answers that were collapsed into one message: a rejected
    // compilation (409) is worth another go, and a board with nothing to say on
    // the topic (404) is not. Telling someone to retry the second wastes their
    // time and a provider call every time.
    stubFetch();
    const empty = await mount({ onRequestRecompile: async () => null });
    await openPage(empty);
    await act(async () => {
      (empty.querySelector('[data-board-wiki-refresh="true"]') as HTMLButtonElement).click();
    });
    expect(empty.querySelector('[data-board-wiki-proposal="true"]')).toBeNull();
    expect(empty.querySelector('[data-board-wiki-status="true"]')!.textContent)
      .toContain('nothing on that topic');

    act(() => root?.unmount());
    host?.remove();

    stubFetch();
    const rejected = await mount({ onRequestRecompile: async () => { throw new Error('retry'); } });
    await openPage(rejected);
    await act(async () => {
      (rejected.querySelector('[data-board-wiki-refresh="true"]') as HTMLButtonElement).click();
    });
    expect(rejected.querySelector('[data-board-wiki-status="true"]')!.textContent).toContain('Try again');
  });

  it('a failed compilation does not leave the surface stuck busy', async () => {
    // The `finally` matters: without it a thrown compile leaves every control
    // disabled until the drawer is reopened.
    stubFetch();
    const container = await mount({ onRequestRecompile: async () => { throw new Error('retry'); } });
    await openPage(container);
    await type(content(container), 'edited');
    await act(async () => {
      (container.querySelector('[data-board-wiki-refresh="true"]') as HTMLButtonElement).click();
    });
    expect(saveButton(container).disabled).toBe(false);
    expect((container.querySelector('[data-board-wiki-refresh="true"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('THE PASSAGE MARKERS SURVIVE APPLY AND SAVE, unchanged', async () => {
    // The contract end to end on the client: markers arrive in the proposal,
    // land in the draft untouched, and go to storage byte-identical. Strip them
    // anywhere and which sentence came from which passage is lost permanently.
    const marked = { ...proposal, content: 'The horn sits behind it [S1.1].\nOne side suffices [S1.2].' };
    stubFetch();
    const container = await mount({ onRequestRecompile: async () => marked });
    await openPage(container);
    await act(async () => {
      (container.querySelector('[data-board-wiki-refresh="true"]') as HTMLButtonElement).click();
    });
    await act(async () => {
      (container.querySelector('[data-board-wiki-proposal-apply="true"]') as HTMLButtonElement).click();
    });
    expect(content(container).value).toBe(marked.content);

    await act(async () => { saveButton(container).click(); });
    expect((saved.body as { content: string }).content).toBe(marked.content);
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

describe('deleting a page (Unit 2b)', () => {
  it('a viewer is not offered the control at all', async () => {
    stubFetch();
    const container = await mount({ canEdit: false });
    await openPage(container);
    expect(container.querySelector('[data-board-wiki-delete="true"]')).toBeNull();
  });

  it('asks first, and the asking says what is lost', async () => {
    // There is no trash and no undo -- both are real infrastructure built on a
    // guess that someone will want them -- so the only honest protection is
    // telling the truth before the click, in the rollback header's own terms.
    stubFetch();
    const container = await mount();
    await openPage(container);
    await act(async () => {
      (container.querySelector('[data-board-wiki-delete="true"]') as HTMLButtonElement).click();
    });

    const confirm = container.querySelector('[data-board-wiki-delete-confirm="true"]')!;
    expect(confirm.textContent).toContain('cannot be undone');
    expect(confirm.textContent).toContain('not derived data');
    expect(confirm.textContent).toContain('does not produce the same page twice');
    // It names the page, so a mis-click on the wrong page is visible.
    expect(confirm.textContent).toContain('Horn replacement');
    // And nothing has happened yet.
    expect(deleted.calls).toBe(0);
  });

  it('CANCEL leaves the page and its text alone', async () => {
    stubFetch();
    const container = await mount();
    await openPage(container);
    await type(content(container), 'work in progress');
    await act(async () => {
      (container.querySelector('[data-board-wiki-delete="true"]') as HTMLButtonElement).click();
    });
    await act(async () => {
      (container.querySelector('[data-board-wiki-delete-cancel="true"]') as HTMLButtonElement).click();
    });
    expect(container.querySelector('[data-board-wiki-delete-confirm="true"]')).toBeNull();
    expect(content(container).value).toBe('work in progress');
    expect(deleted.calls).toBe(0);
  });

  it('confirming deletes the page and leaves nothing selected', async () => {
    // Leaving the editor open over a page that no longer exists invites a save
    // that would 404; picking the next page would be the surface deciding.
    stubFetch();
    const container = await mount();
    await openPage(container);
    await act(async () => {
      (container.querySelector('[data-board-wiki-delete="true"]') as HTMLButtonElement).click();
    });
    await act(async () => {
      (container.querySelector('[data-board-wiki-delete-confirmed="true"]') as HTMLButtonElement).click();
    });

    expect(deleted.calls).toBe(1);
    expect(deleted.method).toBe('DELETE');
    expect(content(container)).toBeNull();
    expect(container.querySelector('[data-board-wiki-status="true"]')!.textContent).toContain('Page deleted');
  });

  it('a confirmation does not survive changing page', async () => {
    // Otherwise the second click lands on a page the user never asked about.
    stubFetch();
    const container = await mount();
    await openPage(container);
    await act(async () => {
      (container.querySelector('[data-board-wiki-delete="true"]') as HTMLButtonElement).click();
    });
    expect(container.querySelector('[data-board-wiki-delete-confirm="true"]')).not.toBeNull();
    await openPage(container);
    expect(container.querySelector('[data-board-wiki-delete-confirm="true"]')).toBeNull();
  });

  it('a failed delete says so and keeps the page on screen', async () => {
    stubFetch({}, 200, 503);
    const container = await mount();
    await openPage(container);
    await act(async () => {
      (container.querySelector('[data-board-wiki-delete="true"]') as HTMLButtonElement).click();
    });
    await act(async () => {
      (container.querySelector('[data-board-wiki-delete-confirmed="true"]') as HTMLButtonElement).click();
    });
    expect(container.querySelector('[data-board-wiki-status="true"]')!.textContent).toContain('could not be deleted');
    expect(content(container)).not.toBeNull();
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
    // The launcher calls the authority that opens the wiki, so the two are
    // actually connected rather than merely both present.
    //
    // UPDATED DELIBERATELY: this pinned the inline `() => setIsBoardWikiOpen(
    // true)`. An inline setter is how this surface came to open WITHOUT
    // claiming the dock -- the rule has to live somewhere a second caller
    // would inherit it, and an arrow function in JSX is not that place. The
    // opener is now named, and boardDockSurface.test.ts pins that it is the
    // only one.
    expect(hostSource).toContain('onClick={openBoardWiki}');
    expect(hostSource).toContain('const openBoardWiki = useCallback(');
    expect(hostSource).toMatch(/<BoardWikiDrawer[\s\S]{0,400}isOpen=\{isBoardWikiOpen\}/);
  });

  it('THE FLOATING LAUNCHERS ARE MUTUALLY EXCLUSIVE, so neither covers the other drawer', () => {
    // Found live, not here: the Board AI button is z-[1300] and this drawer is
    // z-[1200], so it floated over the drawer's header and elementFromPoint at
    // the wiki's close control returned the Board AI button. The close button
    // rendered, passed its test, and could not be clicked -- item 15 again.
    // jsdom has no layout, so the guard has to be read out of the host.
    const wikiLauncher = hostSource.slice(hostSource.indexOf('data-board-wiki-open="true"') - 400);
    expect(wikiLauncher.slice(0, 400)).toContain('!isBoardAiChatOpen');
    expect(wikiLauncher.slice(0, 400)).toContain('!isKnowledgeReaderOpen');

    const aiLauncher = hostSource.slice(hostSource.indexOf('data-board-ai-chat-open="true"') - 400);
    expect(aiLauncher.slice(0, 400)).toContain('!isBoardWikiOpen');
  });

  it('the editor cannot grow tall enough to push the chain off the page', () => {
    // A flex-1 editor filled the drawer and put "Compiled from" at the bottom
    // of the scroll area -- below the fold on any shorter window. A chain you
    // have to scroll to find is most of the way to a collapsed one.
    const editor = componentSource.slice(componentSource.indexOf('data-board-wiki-content="true"'));
    // Comments stripped: the explanation beside the attribute names the class
    // it exists to keep out, and would satisfy the check it is documenting.
    const attributes = editor.slice(0, editor.indexOf('/>')).replace(/\/\*[\s\S]*?\*\//g, '');
    expect(attributes).toContain('max-h-');
    expect(attributes).not.toContain('flex-1');
  });

  it('the surface yields to a blocking editor, like every other floating control', async () => {
    stubFetch();
    const container = await mount({ blockingEditorOpen: true });
    expect(container.querySelector('[data-board-wiki-drawer="true"]')).toBeNull();
  });
});

describe('the corpus leaves the product as an OKF bundle', () => {
  const exportButton = (c: HTMLElement) =>
    c.querySelector('[data-board-wiki-export="true"]') as HTMLButtonElement;

  async function clickExport(container: HTMLElement) {
    await act(async () => {
      exportButton(container).click();
    });
    // The handler awaits a fetch, a json(), two dynamic imports and
    // generateAsync before it saves. One flush is not enough microtasks.
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
  }

  it('puts every file from the bundle into the archive under its own name', async () => {
    stubFetch();
    const container = await mount();
    await clickExport(container);

    expect(zipState.entries).toEqual([
      { name: 'index.md', content: '# Board wiki\n' },
      { name: 'horn-replacement.md', content: 'page text' },
    ]);
    expect(zipState.generated).toBe(1);
  });

  it('downloads the archive under the dated name', async () => {
    stubFetch();
    const container = await mount();
    await clickExport(container);

    expect(zipState.savedBlob).toBeInstanceOf(Blob);
    expect(zipState.savedName).toMatch(/^board-wiki-export-\d{4}-\d{2}-\d{2}\.zip$/);
  });

  it('reads the bundle from the export segment, not the page list', async () => {
    stubFetch();
    const container = await mount();
    await clickExport(container);

    const urls = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } })
      .mock.calls.map((call) => String(call[0]));
    expect(urls).toContain(`/api/boards/${BOARD}/wiki/export`);
  });

  it('EXPORTS WITHOUT A PAGE SELECTED, because the bundle is the board not the page', async () => {
    stubFetch();
    const container = await mount();
    // No openPage() anywhere above: a person who opens the wiki to take a copy
    // should not have to click into a page first.
    await clickExport(container);
    expect(zipState.generated).toBe(1);
  });

  it('A VIEWER CAN EXPORT. Reading the corpus is a read', async () => {
    stubFetch();
    const container = await mount({ canEdit: false });
    expect(exportButton(container)).not.toBeNull();
    await clickExport(container);
    expect(zipState.generated).toBe(1);
  });

  it('IMPORTS file-saver STATICALLY, because a mock cannot see a bundler', async () => {
    // Found live, not here. `file-saver` is CommonJS with no `module` entry:
    // under the bundler `await import('file-saver')` puts the module on
    // `.default`, so the named `saveAs` destructures to undefined and the
    // download throws -- in a browser only. Every test above passed while that
    // was true, because vi.mock hands back whatever shape it is asked for.
    // The mock cannot be taught about interop; the import form can be pinned.
    //
    // Comments stripped before the negative check: the paragraph in the
    // component explaining this names the very form it forbids, and would
    // fail the assertion it exists to document.
    const code = componentSource
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code).toContain("import { saveAs } from 'file-saver'");
    expect(code).not.toContain("import('file-saver')");
  });

  it('is offered but inert while the board has no pages', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ pages: [] }), { status: 200 })));
    const container = await mount();
    expect(exportButton(container).disabled).toBe(true);
  });
});

describe('an export that fails downloads nothing at all', () => {
  const clickExport = async (c: HTMLElement) => {
    await act(async () => {
      (c.querySelector('[data-board-wiki-export="true"]') as HTMLButtonElement).click();
    });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
  };
  const status = (c: HTMLElement) => c.querySelector('[data-board-wiki-status="true"]');

  it('says so when the route refuses', async () => {
    exported.status = 403;
    exported.body = { error: 'Forbidden' };
    stubFetch();
    const container = await mount();
    await clickExport(container);

    expect(zipState.generated).toBe(0);
    expect(zipState.savedName).toBeNull();
    expect(status(container)?.textContent).toContain('Nothing was downloaded');
  });

  it('REFUSES A BUNDLE WITH NO INDEX rather than saving a partial archive', async () => {
    // The failure this rules out is a person believing they exported their
    // wiki when they exported some of it -- so a bundle that fails the parse
    // must reach neither the archive nor the disk.
    exported.body = { files: { 'horn-replacement.md': 'page text' } };
    stubFetch();
    const container = await mount();
    await clickExport(container);

    expect(zipState.entries).toEqual([]);
    expect(zipState.savedName).toBeNull();
    expect(status(container)?.textContent).toContain('Nothing was downloaded');
  });

  it('NEVER ARCHIVES AN ENTRY NAMED OUTSIDE THE ARCHIVE', async () => {
    // Zip-slip, refused at the client boundary. The whole bundle goes, not
    // just the offending entry.
    exported.body = { files: { 'index.md': 'i', '../escape.md': 'payload' } };
    stubFetch();
    const container = await mount();
    await clickExport(container);

    expect(zipState.entries).toEqual([]);
    expect(zipState.savedName).toBeNull();
    // Asserted as well as the two absences above, which a handler that never
    // ran would satisfy just as well. This one only appears if it ran and
    // refused.
    expect(status(container)?.textContent).toContain('Nothing was downloaded');
  });

  it('survives a response that is not JSON', async () => {
    stubFetch();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (
      String(url).endsWith('/wiki/export')
        ? new Response('<html>gateway</html>', { status: 200 })
        : new Response(JSON.stringify({
          pages: [{ id: PAGE, slug: 'horn-replacement', title: 'Horn replacement', updatedAt: 'u', sourceCount: 1 }],
        }), { status: 200 })
    )));
    const container = await mount();
    await clickExport(container);

    expect(zipState.savedName).toBeNull();
    expect(status(container)?.textContent).toContain('Nothing was downloaded');
  });
});
