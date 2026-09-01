// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CanvasCard from './CanvasCard';

// CanvasCard uses the app router for navigation; the menu under test does not.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

/**
 * Permanent deletion from Trash.
 *
 * The menu item itself is proven by rendering the card and opening its real
 * right-click menu. The dashboard half (confirm dialog, which endpoint is
 * called, double-submit guard) is proven at source level, because that page is
 * a whole authenticated data-loading screen -- but the assertions below pin the
 * exact behaviours rather than merely checking that some code exists.
 */

const ROOT = path.resolve(__dirname, '../..');
const PAGE = fs.readFileSync(path.join(ROOT, 'app/dashboard/page.tsx'), 'utf8');
const CARD = fs.readFileSync(path.join(ROOT, 'components/dashboard/CanvasCard.tsx'), 'utf8');

// Radix renders its menu into a portal on document.body; without this, one
// test's open menu would still be in the DOM when the next one asserts.
afterEach(() => { document.body.innerHTML = ''; });

function mount(node: React.ReactElement) {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => { createRoot(host).render(node); });
  return host;
}

function card(props: Record<string, unknown>) {
  return mount(
    <CanvasCard
      id="board-1"
      title="Column Canvas2"
      layout="columns"
      updatedAt={new Date().toISOString()}
      {...props}
    />,
  );
}

/** Opens the Radix context menu the way a right-click does. */
function openContextMenu(host: HTMLElement) {
  const trigger = host.querySelector('[data-slot="context-menu-trigger"]')
    ?? host.firstElementChild as Element;
  act(() => {
    trigger.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2 }));
  });
  return document.body.textContent ?? '';
}

describe('1 + 2. the menu item is Trash-only', () => {
  it('a trashed card offers Open and Delete permanently', () => {
    const host = card({ onDeletePermanently: vi.fn() });
    const menu = openContextMenu(host);
    expect(menu).toContain('Delete permanently');
  });

  it('an active card is unchanged -- no permanent delete without the handler', () => {
    const host = card({ onDelete: vi.fn(), onToggleFavorite: vi.fn() });
    const menu = openContextMenu(host);
    expect(menu).toContain('Move to Trash');
    expect(menu).not.toContain('Delete permanently');
  });

  it('the item is destructive and reports the id it was given', () => {
    const onDeletePermanently = vi.fn();
    const host = card({ onDeletePermanently });
    openContextMenu(host);
    const item = Array.from(document.querySelectorAll('[role="menuitem"]'))
      .find((el) => el.textContent?.includes('Delete permanently')) as HTMLElement | undefined;
    expect(item).toBeTruthy();
    expect(item!.getAttribute('data-variant')).toBe('destructive');
    act(() => { item!.click(); });
    expect(onDeletePermanently).toHaveBeenCalledWith('board-1');
  });

  it('the card itself performs no deletion -- it only reports intent', () => {
    expect(CARD).not.toMatch(/fetch\(|supabase/);
  });
});

describe('3 + 4 + 5. confirmation before anything is deleted', () => {
  it('clicking the item opens a confirm dialog rather than deleting', () => {
    // The handler only records the target; nothing is sent from it.
    const request = PAGE.slice(
      PAGE.indexOf('const handleRequestPermanentDelete'),
      PAGE.indexOf('const handleConfirmPermanentDelete'),
    );
    expect(request).toContain('setPermanentDeleteTarget');
    expect(request).not.toContain('fetch(');
  });

  it('the dialog names the actual canvas and warns it cannot be undone', () => {
    expect(PAGE).toContain('Delete canvas permanently?');
    expect(PAGE).toContain('{permanentDeleteTarget?.title}');
    expect(PAGE).toContain('permanently deleted. This cannot be undone.');
  });

  it('Cancel closes without deleting', () => {
    const dialog = PAGE.slice(
      PAGE.indexOf('Delete canvas permanently?'),
      PAGE.indexOf('open={isCreateFolderOpen}'),
    );
    const cancel = dialog.slice(dialog.indexOf('Cancel') - 400, dialog.indexOf('Cancel'));
    expect(cancel).toContain('setPermanentDeleteTarget(null)');
    expect(cancel).not.toContain('handleConfirmPermanentDelete');
  });
});

describe('6 + 7 + 10. the delete authority', () => {
  const confirm = PAGE.slice(
    PAGE.indexOf('const handleConfirmPermanentDelete'),
    PAGE.indexOf('const handleToggleFavorite'),
  );

  it('sends exactly DELETE /api/boards/{id} through the existing route', () => {
    expect(confirm).toContain('`/api/boards/${encodeURIComponent(String(target.id))}`');
    expect(confirm).toContain("method: 'DELETE'");
  });

  it('introduces no direct Supabase delete and no new endpoint', () => {
    expect(confirm).not.toContain('supabase');
    expect(confirm).not.toContain(".from('boards')");
    // The board route was not modified by this patch.
    const route = fs.readFileSync(path.join(ROOT, 'app/api/boards/[id]/route.ts'), 'utf8');
    expect(route).toContain('deleteKnowledgeBoard');
  });

  it('a second click cannot issue a second DELETE', () => {
    expect(confirm).toContain('if (!permanentDeleteTarget || isDeletingPermanently) return;');
    expect(confirm).toContain('setIsDeletingPermanently(true)');
    expect(confirm).toContain('setIsDeletingPermanently(false)');
    // and the button itself is disabled while in flight
    expect(PAGE).toContain('disabled={isDeletingPermanently}');
  });
});

describe('8 + 9. success and failure behaviour', () => {
  const confirm = PAGE.slice(
    PAGE.indexOf('const handleConfirmPermanentDelete'),
    PAGE.indexOf('const handleToggleFavorite'),
  );

  it('success removes the canvas from local state and closes the dialog', () => {
    expect(confirm).toContain('setCanvases(prev => prev.filter');
    expect(confirm).toContain('setPermanentDeleteTarget(null)');
  });

  it('failure keeps the canvas visible and reports the error', () => {
    // The not-ok branch reports and returns BEFORE any local removal, so a
    // failed delete can never make the canvas disappear optimistically.
    const notOkAt = confirm.indexOf('if (!response.ok)');
    const removalAt = confirm.indexOf('setCanvases(prev => prev.filter');
    expect(notOkAt).toBeGreaterThan(-1);
    expect(notOkAt).toBeLessThan(removalAt);
    const notOkBranch = confirm.slice(notOkAt, removalAt);
    expect(notOkBranch).toContain('toast.error');
    expect(notOkBranch).toContain('return;');
    expect(confirm).toContain('catch {');
  });
});
