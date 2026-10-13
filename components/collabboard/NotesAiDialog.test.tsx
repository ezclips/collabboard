// @vitest-environment jsdom
//
// PATCH-353. "AI on notes": the hook's open/pre-tick rule and the dialog's
// tabs, checklist, generate -> preview, task untick and Add. The request helper
// is stubbed; nothing is written except through onAddPost.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ requestNotesAi: vi.fn() }));
vi.mock('@/lib/infra/ai/requestNotesAi', () => ({ requestNotesAi: mocks.requestNotesAi }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import { NotesAiDialog } from './NotesAiDialog';
import {
  buildNotesAiActionPlanRow,
  buildNotesAiNotes,
  buildNotesAiSummaryRow,
  useNotesAi,
  type NotesAiRowContext,
} from './useNotesAi';
import { NOTES_AI_MAX_NOTES } from '@/lib/domain/ai/notesAi';
import { NotePostContextMenu } from './menus/NotePostContextMenu';
import type { Padlet } from '@/types/collabboard';

// The note menu's own Radix setup (its test file lives here because the
// allowed-files list names the menu but no separate menu test file, and
// components/collabboard/menus/ is not in vitest's include globs).
beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  Element.prototype.scrollIntoView ??= () => {};
  (Element.prototype as unknown as { hasPointerCapture?: () => boolean }).hasPointerCapture ??= () => false;
  (Element.prototype as unknown as { setPointerCapture?: () => void }).setPointerCapture ??= () => {};
  (Element.prototype as unknown as { releasePointerCapture?: () => void }).releasePointerCapture ??= () => {};
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement;

const note = (id: string, title: string, content: string, positionY: number): Padlet => ({
  id, board_id: 'board-1', title, content, type: 'note',
  position_x: 0, position_y: positionY, width: 200, height: 200, created_at: 'n', updated_at: 'n',
});

const NOTES = [note('n1', 'Venue', 'Book the venue', 0), note('n2', 'Catering', 'Find a caterer', 100)];

function Harness({
  notes = NOTES,
  selectedPadletIds = [],
  onAddPost,
}: {
  notes?: Padlet[];
  selectedPadletIds?: string[];
  onAddPost: (row: Padlet) => Promise<void>;
}) {
  const ai = useNotesAi({
    boardId: 'board-1',
    notes,
    selectedPadletIds,
    canEdit: true,
    getFreePostPosition: () => ({ x: 10, y: 20 }),
    getZIndex: () => 7,
    onAddPost,
  });
  return (
    <>
      <button data-testid="open" onClick={() => ai.open(notes[0]?.id ?? '')} />
      <NotesAiDialog {...ai.dialogProps} />
    </>
  );
}

async function mount(props: { notes?: Padlet[]; selectedPadletIds?: string[]; onAddPost?: (row: Padlet) => Promise<void> }) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<Harness notes={props.notes} selectedPadletIds={props.selectedPadletIds} onAddPost={props.onAddPost ?? (async () => {})} />);
  });
}

afterEach(async () => {
  if (root) { const r = root; await act(async () => r.unmount()); root = null; }
  host?.remove();
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

// The dialog portals to document.body.
const q = (selector: string) => document.querySelector(selector) as HTMLElement | null;
const click = async (selector: string) => {
  await act(async () => { q(selector)!.click(); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
};
const openDialog = () => click('[data-testid="open"]');
const checkboxes = () => Array.from(document.querySelectorAll<HTMLInputElement>('[data-notes-ai-note]'));

beforeEach(() => { mocks.requestNotesAi.mockReset(); });

describe('PATCH-353 NotesAiDialog: the open rule and the checklist', () => {
  it('pre-ticks only the clicked note for a single selection', async () => {
    await mount({});
    await openDialog();
    expect(q('[data-notes-ai-dialog="true"]')).not.toBeNull();
    const boxes = checkboxes();
    expect(boxes).toHaveLength(2);
    expect(boxes[0].checked).toBe(true);
    expect(boxes[1].checked).toBe(false);
    expect(q('[data-notes-ai-count="true"]')?.textContent).toContain('1 of 2 notes');
  });

  it('pre-ticks every selected note when the clicked note is part of a multi-selection', async () => {
    await mount({ selectedPadletIds: ['n1', 'n2'] });
    await openDialog();
    const boxes = checkboxes();
    expect(boxes.every((box) => box.checked)).toBe(true);
    expect(q('[data-notes-ai-count="true"]')?.textContent).toContain('2 of 2 notes');
  });

  it('Select all / none toggles every note', async () => {
    await mount({});
    await openDialog();
    await click('[data-notes-ai-select-all="true"]');
    expect(checkboxes().every((box) => box.checked)).toBe(true);
    await click('[data-notes-ai-select-all="true"]');
    expect(checkboxes().every((box) => box.checked)).toBe(false);
  });
});

describe('PATCH-353 NotesAiDialog: generate and preview', () => {
  it('generates a summary and previews it', async () => {
    mocks.requestNotesAi.mockResolvedValue({ ok: true, result: { title: 'T', summary: 'S', points: ['p'] } });
    await mount({});
    await openDialog();
    await click('[data-notes-ai-generate="true"]');
    expect(mocks.requestNotesAi).toHaveBeenCalledTimes(1);
    const request = mocks.requestNotesAi.mock.calls[0][0] as { action: string; notes: unknown[] };
    expect(request.action).toBe('summary');
    expect(request.notes).toHaveLength(1);
    const preview = q('[data-notes-ai-preview="true"]');
    expect(preview).not.toBeNull();
    expect(preview!.textContent).toContain('S');
    expect(preview!.textContent).toContain('p');
  });

  it('shows the action plan and leaves unticked tasks out of Add', async () => {
    const onAddPost = vi.fn(async (_row: Padlet) => {});
    mocks.requestNotesAi.mockResolvedValue({
      ok: true,
      result: { title: 'P', tasks: [{ text: 'A', sourceRefs: ['N1'] }, { text: 'B', sourceRefs: [] }] },
    });
    await mount({ onAddPost });
    await openDialog();
    await click('[data-notes-ai-tab="action_plan"]');
    await click('[data-notes-ai-generate="true"]');
    const tasks = Array.from(document.querySelectorAll<HTMLElement>('[data-notes-ai-task]'));
    expect(tasks).toHaveLength(2);
    // Untick the second task.
    await act(async () => {
      document.querySelectorAll<HTMLInputElement>('[data-notes-ai-task-checkbox]')[1].click();
    });
    await click('[data-notes-ai-add="true"]');
    expect(onAddPost).toHaveBeenCalledTimes(1);
    const row = onAddPost.mock.calls[0][0] as Padlet;
    expect(row.type).toBe('todo');
    expect(JSON.parse(row.content)).toHaveLength(1);
    expect((row.metadata as { tasks: unknown[] }).tasks).toHaveLength(1);
  });

  it('Add builds a text post for a summary', async () => {
    const onAddPost = vi.fn(async (_row: Padlet) => {});
    mocks.requestNotesAi.mockResolvedValue({ ok: true, result: { title: 'T', summary: 'S', points: ['p'] } });
    await mount({ onAddPost });
    await openDialog();
    await click('[data-notes-ai-generate="true"]');
    await click('[data-notes-ai-add="true"]');
    const row = onAddPost.mock.calls[0][0] as Padlet;
    expect(row.type).toBe('text');
    expect(row.title).toBe('T');
    // PATCH-353 Addendum 1: the title is the card header, not repeated in HTML.
    expect(row.content).toBe('<p>S</p><ul><li>p</li></ul>');
    expect(row.width).toBe(320);
    expect(row.height).toBe(320);
    expect((row.metadata as { zIndex: number }).zIndex).toBe(7);
  });

  it('Add builds a todo post for a plan', async () => {
    const onAddPost = vi.fn(async (_row: Padlet) => {});
    mocks.requestNotesAi.mockResolvedValue({
      ok: true, result: { title: 'P', tasks: [{ text: 'A', sourceRefs: ['N1'] }] },
    });
    await mount({ onAddPost });
    await openDialog();
    await click('[data-notes-ai-tab="action_plan"]');
    await click('[data-notes-ai-generate="true"]');
    await click('[data-notes-ai-add="true"]');
    const row = onAddPost.mock.calls[0][0] as Padlet;
    expect(row.type).toBe('todo');
    expect(row.title).toBe('P');
    expect(row.height).toBe(360);
    expect((row.metadata as { todoTitle: string }).todoTitle).toBe('P');
  });
});

describe('PATCH-353 NotesAiDialog: error states', () => {
  it('shows the out-of-credits message from the request', async () => {
    mocks.requestNotesAi.mockResolvedValue({ ok: false, status: 402, message: "You're out of AI credits for this board." });
    await mount({});
    await openDialog();
    await click('[data-notes-ai-generate="true"]');
    expect(q('[data-notes-ai-error="true"]')?.textContent).toContain("You're out of AI credits for this board.");
    expect(q('[data-notes-ai-preview="true"]')).toBeNull();
  });

  it('shows the unusable-answer message when the result is null', async () => {
    mocks.requestNotesAi.mockResolvedValue({ ok: true, result: null });
    await mount({});
    await openDialog();
    await click('[data-notes-ai-generate="true"]');
    expect(q('[data-notes-ai-error="true"]')?.textContent).toContain("couldn't be used");
    expect(q('[data-notes-ai-preview="true"]')).toBeNull();
  });
});

describe('PATCH-353 notesAi row builders', () => {
  const context: NotesAiRowContext = {
    id: 'post-1', boardId: 'board-1', positionX: 10, positionY: 20, zIndex: 7,
    nowIso: '2026-10-13T00:00:00.000Z',
  };

  it('a summary builds a 320x320 text post carrying the summary HTML', () => {
    const row = buildNotesAiSummaryRow({ title: 'T', summary: 'S', points: ['p'] }, context);
    expect(row).toMatchObject({
      id: 'post-1', board_id: 'board-1', title: 'T', type: 'text',
      position_x: 10, position_y: 20, width: 320, height: 320,
      created_at: '2026-10-13T00:00:00.000Z',
    });
    // PATCH-353 Addendum 1: the title is the post's own header, not repeated.
    expect(row.content).toBe('<p>S</p><ul><li>p</li></ul>');
    expect(row.content).not.toContain('T');
    expect((row.metadata as { cardColor: string }).cardColor).toBe('#ffffff');
    expect((row.metadata as { zIndex: number }).zIndex).toBe(7);
  });

  it('an action plan builds a 320x360 todo post', () => {
    const row = buildNotesAiActionPlanRow({ title: 'P', tasks: [{ text: 'A', sourceRefs: ['N1'] }] }, context);
    expect(row).toMatchObject({ type: 'todo', title: 'P', width: 320, height: 360 });
    expect(JSON.parse(row.content)).toEqual([{ id: 'post-1-task-0', text: 'A', completed: false }]);
    expect((row.metadata as { todoTitle: string }).todoTitle).toBe('P');
    expect((row.metadata as { tasks: unknown[] }).tasks).toHaveLength(1);
  });

  it('falls back to a default title', () => {
    expect(buildNotesAiSummaryRow({ title: '', summary: 'S', points: [] }, context).title).toBe('AI summary');
    expect(buildNotesAiActionPlanRow({ title: '', tasks: [{ text: 'A', sourceRefs: [] }] }, context).title).toBe('Action plan');
  });
});

describe('PATCH-353 Addendum 1 buildNotesAiNotes', () => {
  it('sends the note’s own title and the full text, never the first line twice', () => {
    const payload = buildNotesAiNotes([
      note('n1', 'Venue', 'Book the venue', 0),
      note('n2', '', 'Call three places\nand confirm', 0),
    ]);
    expect(payload).toEqual([
      { ref: 'N1', title: 'Venue', text: 'Book the venue' },
      { ref: 'N2', title: '', text: 'Call three places\nand confirm' },
    ]);
  });
});

describe('PATCH-353 Addendum 1 the note-count and length limits', () => {
  it('more than 60 ticked notes explains and disables Generate', async () => {
    const many = Array.from({ length: NOTES_AI_MAX_NOTES + 1 }, (_, index) => note(`m${index}`, '', 'x', index));
    await mount({ notes: many, selectedPadletIds: many.map((entry) => entry.id) });
    await openDialog();
    expect(q('[data-notes-ai-limit="true"]')?.textContent)
      .toContain(`Pick at most ${NOTES_AI_MAX_NOTES} notes (${NOTES_AI_MAX_NOTES + 1} ticked).`);
    expect((q('[data-notes-ai-generate="true"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('too much text together explains and disables Generate', async () => {
    const long = Array.from({ length: 16 }, (_, index) => note(`L${index}`, '', 'x'.repeat(2000), index));
    await mount({ notes: long, selectedPadletIds: long.map((entry) => entry.id) });
    await openDialog();
    expect(q('[data-notes-ai-limit="true"]')?.textContent).toContain('too long together');
    expect((q('[data-notes-ai-generate="true"]') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('PATCH-353 the note menu offers "AI on notes…"', () => {
  async function openMenu(props: Partial<React.ComponentProps<typeof NotePostContextMenu>>) {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(
        <NotePostContextMenu padlet={note('n1', '', '', 0)} onSelect={() => {}} {...props}>
          <button data-testid="menu-trigger">note</button>
        </NotePostContextMenu>,
      );
    });
    const trigger = host.querySelector('[data-testid="menu-trigger"]')!;
    await act(async () => {
      trigger.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    });
  }
  const menuLabels = () => Array.from(document.querySelectorAll('[role="menuitem"]')).map((el) => el.textContent ?? '');

  it('shows the item with the prop, and hides it without', async () => {
    await openMenu({ onAiOnNotes: vi.fn() });
    expect(menuLabels().some((label) => label.includes('AI on notes'))).toBe(true);

    if (root) { act(() => root!.unmount()); root = null; }
    host?.remove();
    document.body.innerHTML = '';

    await openMenu({});
    expect(menuLabels().some((label) => label.includes('AI on notes'))).toBe(false);
  });
});
