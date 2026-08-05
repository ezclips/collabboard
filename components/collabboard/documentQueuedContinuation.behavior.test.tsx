// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { decideDocumentSwitch, type QueuedDocumentAction } from '@/lib/domain/canvas/documentSwitchGuard';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// PATCH-149B2-ii §36: mirrors CanvasClient's guard/continuation wiring against the real
// decideDocumentSwitch. `reenter` selects the shipped cc95a1b defect (discard calls the
// guarded wrapper, whose closure still holds pre-discard state) vs the §36 correction
// (discard calls the unguarded execution core). §36.3's source assertions bind production
// to this mechanism; this file proves the mechanism itself under real React batching.
function Harness({ reenter, ran }: { reenter: boolean; ran: string[] }) {
  const [destination, setDestination] = React.useState<'document-editor' | null>('document-editor');
  const [isDirty, setIsDirty] = React.useState(true);
  const [queued, setQueued] = React.useState<QueuedDocumentAction | null>(null);
  const resolve = (a: QueuedDocumentAction) => {
    const d = decideDocumentSwitch({ destination, isDirty }, a);
    if (d.type === 'blocked') { setQueued(a); return true; }
    if (d.type === 'proceed-after-clear') { setDestination(null); setIsDirty(false); }
    return false;
  };
  const executeToolAction = (t: string) => ran.push(`tool:${t}`);
  const handleToolClick = (t: string) => { if (!resolve({ kind: 'open-tool', toolType: t })) executeToolAction(t); };
  const executePadletTypeEditor = (p: any) => ran.push(`edit:${p.id}`);
  const openPadletInTypeEditor = (p: any) => { if (!resolve({ kind: 'open-drawing-editor', padlet: p })) executePadletTypeEditor(p); };
  const discard = () => {
    const action = queued;                       // 1. capture
    setQueued(null);                             // 2. clear queue (closes confirmation)
    setDestination(null); setIsDirty(false);     // 3-5. clear Document + parent dirty
    if (!action) return;                         // 6. execute captured continuation
    if (action.kind === 'open-tool') (reenter ? handleToolClick : executeToolAction)(action.toolType);
    else if (action.kind === 'open-drawing-editor') (reenter ? openPadletInTypeEditor : executePadletTypeEditor)(action.padlet);
  };
  return (
    <div>
      <button id="tool" onClick={() => handleToolClick('note')} />
      <button id="edit" onClick={() => openPadletInTypeEditor({ id: 'p1', type: 'card' })} />
      {queued && <button id="discard" onClick={discard} />}
      <span id="q">{queued ? 'queued' : 'empty'}</span>
    </div>
  );
}

let cleanup: Array<() => void> = [];
afterEach(() => { cleanup.forEach((fn) => act(fn)); cleanup = []; });

function drive(reenter: boolean, trigger: 'tool' | 'edit') {
  const ran: string[] = [];
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  cleanup.push(() => { root.unmount(); container.remove(); });
  act(() => { root.render(<Harness reenter={reenter} ran={ran} />); });
  const click = (id: string) => act(() => {
    container.querySelector<HTMLButtonElement>(`#${id}`)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  click(trigger);                                            // dirty Document + request action
  expect(ran).toHaveLength(0);                               // target must not open early
  expect(container.querySelector('#q')!.textContent).toBe('queued');
  expect(container.querySelector('#discard')).not.toBeNull(); // confirmation visible
  click('discard');                                           // exactly ONE Discard click
  return { ran, container };
}

describe('PATCH-149B2-ii §36: queued continuation runs once on the first Discard click', () => {
  for (const [trigger, expected] of [['tool', 'tool:note'], ['edit', 'edit:p1']] as const) {
    it(`${trigger}: one Discard executes the action exactly once and empties the queue`, () => {
      const { ran, container } = drive(false, trigger);
      expect(ran).toEqual([expected]);                        // exact count, not "at least once"
      expect(container.querySelector('#q')!.textContent).toBe('empty');
      expect(container.querySelector('#discard')).toBeNull(); // no second Discard needed
    });

    it(`${trigger}: re-entering the guard re-queues instead of executing (cc95a1b defect)`, () => {
      const { ran, container } = drive(true, trigger);
      expect(ran).toHaveLength(0);                            // did not execute on first click
      expect(container.querySelector('#q')!.textContent).toBe('queued'); // queue repopulated
      expect(container.querySelector('#discard')).not.toBeNull();        // 2nd click required
    });
  }
});
