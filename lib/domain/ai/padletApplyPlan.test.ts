import { describe, expect, it } from 'vitest';

import { executePadletApplyPlan, planPadletApply, remapSectionIds, type PadletApplyPlanOptions, type PadletApplyPost, type PadletApplySection } from './padletApplyPlan';
import type { PadletProposedChange } from './padletChangeProposals';

const change = (over: Partial<PadletProposedChange> & Pick<PadletProposedChange, 'kind' | 'label'>): PadletProposedChange => ({ ...over });

const options = (over: Partial<PadletApplyPlanOptions> = {}): PadletApplyPlanOptions => {
  let counter = 0;
  return {
    boardId: 'board-1',
    layout: 'wall',
    now: '2026-01-01T00:00:00.000Z',
    newId: () => `new-${(counter += 1)}`,
    ...over,
  };
};

const container = (id: string, childPadletIds: string[] = [], extra: Record<string, unknown> = {}): PadletApplyPost => ({
  id,
  type: 'container',
  metadata: { kind: 'container', isContainer: true, childPadletIds, ...extra },
});

const post = (id: string, metadata: Record<string, unknown> = {}): PadletApplyPost => ({ id, type: 'text', metadata });

/** The last metadata write addressed to one post. */
function lastMetadata(writes: ReturnType<typeof planPadletApply>['writes'], postId: string): Record<string, unknown> | null {
  const hits = writes.filter((write) => write.kind === 'update-metadata' && write.postId === postId);
  const last = hits[hits.length - 1];
  return last && last.kind === 'update-metadata' ? last.metadata : null;
}

/** Every `insert-post` row's metadata. */
function insertedMetadata(writes: ReturnType<typeof planPadletApply>['writes']): Record<string, unknown>[] {
  return writes
    .filter((write) => write.kind === 'insert-post')
    .map((write) => (write.kind === 'insert-post' ? (write.row.metadata as Record<string, unknown>) : {}));
}

describe('planPadletApply', () => {
  it('grows one container by N in order, from the working copy', () => {
    const changes = [
      change({ kind: 'create', label: 'A', panelId: 'c1', panelKind: 'container', title: 'A' }),
      change({ kind: 'create', label: 'B', panelId: 'c1', panelKind: 'container', title: 'B' }),
      change({ kind: 'create', label: 'C', panelId: 'c1', panelKind: 'container', title: 'C' }),
    ];
    const plan = planPadletApply(changes, [container('c1', [])], [], options());

    expect(plan.results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    // Each insert carries parentId = the container.
    expect(insertedMetadata(plan.writes).map((meta) => meta.parentId)).toEqual(['c1', 'c1', 'c1']);
    // The container's childPadletIds holds ALL THREE, in order -- the bug was
    // that every change read the render-time list and wrote just one child.
    expect(lastMetadata(plan.writes, 'c1')).toEqual({
      kind: 'container',
      isContainer: true,
      childPadletIds: ['new-1', 'new-2', 'new-3'],
    });
  });

  it('keeps existing children when adding to a container', () => {
    const changes = [
      change({ kind: 'create', label: 'A', panelId: 'c1', panelKind: 'container', title: 'A' }),
      change({ kind: 'create', label: 'B', panelId: 'c1', panelKind: 'container', title: 'B' }),
    ];
    const plan = planPadletApply(changes, [container('c1', ['old-1', 'old-2'])], [], options());
    expect((lastMetadata(plan.writes, 'c1')?.childPadletIds as string[])).toEqual(['old-1', 'old-2', 'new-1', 'new-2']);
  });

  it('gives N posts in one section distinct ascending sectionPosition', () => {
    // `board_sections.id` is a BIGINT live; the posts store it as a string.
    const sections: PadletApplySection[] = [{ id: 197, position: 0 }];
    const changes = [
      change({ kind: 'create', label: 'A', panelId: '197', panelKind: 'section', title: 'A' }),
      change({ kind: 'move', label: 'Move P', postId: 'p1', panelId: '197', panelKind: 'section' }),
      change({ kind: 'create', label: 'B', panelId: '197', panelKind: 'section', title: 'B' }),
    ];
    const plan = planPadletApply(changes, [post('p1', { sectionId: '196', sectionPosition: 0 })], sections, options());

    expect(plan.results.every((r) => r.ok)).toBe(true);
    const created = insertedMetadata(plan.writes);
    const moved = lastMetadata(plan.writes, 'p1');
    const positions = [
      Number(created[0].sectionPosition),
      Number(moved?.sectionPosition),
      Number(created[1].sectionPosition),
    ];
    // Distinct and ascending in proposal order, and all under the numeric
    // section id (as a string).
    expect(positions).toEqual([0, 1, 2]);
    expect(created[0].sectionId).toBe('197');
    expect(moved?.sectionId).toBe('197');
  });

  it('gives K create-panels distinct ascending section positions', () => {
    const changes = [
      change({ kind: 'create-panel', label: 'A', panelKind: 'section', newPanelName: 'Alpha' }),
      change({ kind: 'create-panel', label: 'B', panelKind: 'section', newPanelName: 'Beta' }),
      change({ kind: 'create-panel', label: 'C', panelKind: 'section', newPanelName: 'Gamma' }),
    ];
    const plan = planPadletApply(changes, [], [{ id: 197, position: 0 }, { id: 198, position: 1 }], options());
    const positions = plan.writes
      .filter((write) => write.kind === 'insert-section')
      .map((write) => (write.kind === 'insert-section' ? write.position : -1));
    expect(positions).toEqual([2, 3, 4]);
  });

  it('gives K create-panels distinct ascending wall positions', () => {
    const changes = [
      change({ kind: 'create-panel', label: 'A', panelKind: 'container', newPanelName: 'Alpha' }),
      change({ kind: 'create-panel', label: 'B', panelKind: 'container', newPanelName: 'Beta' }),
    ];
    const plan = planPadletApply(changes, [container('c1', [], { wallPosition: 4 })], [], options());
    const orders = insertedMetadata(plan.writes).map((meta) => Number(meta.wallPosition));
    expect(orders).toEqual([5, 6]);
  });

  it('uses position_in_timeline on the timeline layout', () => {
    const changes = [
      change({ kind: 'create-panel', label: 'A', panelKind: 'container', newPanelName: 'Alpha' }),
      change({ kind: 'create-panel', label: 'B', panelKind: 'container', newPanelName: 'Beta' }),
    ];
    const plan = planPadletApply(changes, [container('c1', [], { position_in_timeline: 0 })], [], options({ layout: 'timeline' }));
    const orders = insertedMetadata(plan.writes).map((meta) => Number(meta.position_in_timeline));
    expect(orders).toEqual([1, 2]);
    expect(insertedMetadata(plan.writes).every((meta) => meta.wallPosition === undefined)).toBe(true);
  });

  it('removes a moved post from its old container and adds it to the new one', () => {
    const changes = [change({ kind: 'move', label: 'Move P', postId: 'p1', panelId: 'c2', panelKind: 'container' })];
    const plan = planPadletApply(
      changes,
      [container('c1', ['p1', 'p9']), container('c2', []), post('p1', { parentId: 'c1' })],
      [],
      options(),
    );

    expect(lastMetadata(plan.writes, 'c1')?.childPadletIds).toEqual(['p9']);
    expect(lastMetadata(plan.writes, 'c2')?.childPadletIds).toEqual(['p1']);
    expect(lastMetadata(plan.writes, 'p1')?.parentId).toBe('c2');
  });

  it('lets a later change address a panel a create-panel made in the same batch', () => {
    const changes = [
      change({ kind: 'create-panel', label: 'New', panelKind: 'section', newPanelName: 'Ideas' }),
      change({ kind: 'create', label: 'A', newPanelName: 'Ideas', panelKind: 'section', title: 'A' }),
    ];
    const plan = planPadletApply(changes, [], [], options());
    const section = plan.writes.find((write) => write.kind === 'insert-section');
    expect(section).toBeDefined();
    expect(insertedMetadata(plan.writes)[0].sectionId).toBe('new-1');
  });

  it('clears a container parent when a post moves into a section', () => {
    const changes = [change({ kind: 'move', label: 'Move P', postId: 'p1', panelId: '197', panelKind: 'section' })];
    const plan = planPadletApply(changes, [container('c1', ['p1']), post('p1', { parentId: 'c1' })], [{ id: 197, position: 0 }], options());
    expect(lastMetadata(plan.writes, 'c1')?.childPadletIds).toEqual([]);
    const moved = lastMetadata(plan.writes, 'p1');
    expect(moved?.sectionId).toBe('197');
    expect(moved?.parentId).toBeUndefined();
  });

  it('updates only the fields a change sets', () => {
    const changes = [change({ kind: 'update', label: 'Rename', postId: 'p1', title: 'New title' })];
    const plan = planPadletApply(changes, [post('p1', { sectionId: '197' })], [], options());
    const write = plan.writes.find((entry) => entry.kind === 'update-fields');
    expect(write).toEqual({ changeIndex: 0, kind: 'update-fields', postId: 'p1', fields: { title: 'New title' } });
  });

  it('fails a change whose post or panel is missing, without touching the rest', () => {
    const changes = [
      change({ kind: 'update', label: 'Rename', postId: 'missing', title: 'X' }),
      change({ kind: 'create', label: 'A', panelId: 'c1', panelKind: 'container', title: 'A' }),
    ];
    const plan = planPadletApply(changes, [container('c1', [])], [], options());
    expect(plan.results[0].ok).toBe(false);
    expect(plan.results[1]).toEqual({ ok: true });
    expect(plan.writes.some((write) => write.changeIndex === 0)).toBe(false);
  });

  it('never emits a delete', () => {
    const changes = [change({ kind: 'move', label: 'Move P', postId: 'p1', panelId: 'c2', panelKind: 'container' })];
    const plan = planPadletApply(changes, [container('c1', ['p1']), container('c2', []), post('p1', { parentId: 'c1' })], [], options());
    expect(plan.writes.map((write) => write.kind)).not.toContain('delete');
  });
});

describe('remapSectionIds', () => {
  it('rewrites an insert-post row and an update-metadata payload through the map', () => {
    const map = new Map([['new-1', '512']]);
    const row = remapSectionIds(
      { changeIndex: 0, kind: 'insert-post', row: { id: 'p9', metadata: { sectionId: 'new-1', sectionPosition: 0 } } },
      map,
    );
    expect((row as any).row.metadata.sectionId).toBe('512');

    const update = remapSectionIds(
      { changeIndex: 0, kind: 'update-metadata', postId: 'p1', metadata: { sectionId: 'new-1', sectionPosition: 1 } },
      map,
    );
    expect((update as any).metadata.sectionId).toBe('512');
  });

  it('leaves an unmapped id, an empty map and non-section writes untouched', () => {
    const map = new Map([['new-1', '512']]);
    const other = { changeIndex: 0, kind: 'update-metadata' as const, postId: 'p1', metadata: { sectionId: '197' } };
    expect(remapSectionIds(other, map)).toBe(other);
    expect(remapSectionIds(other, new Map())).toBe(other);
    const fields = { changeIndex: 0, kind: 'update-fields' as const, postId: 'p1', fields: { title: 'X' } };
    expect(remapSectionIds(fields, map)).toBe(fields);
  });
});

describe('executePadletApplyPlan', () => {
  it('maps a created section to its DB id for every later write', async () => {
    // The live bug (Addendum 2): the plan invents a placeholder section id, the
    // INSERT returns a BIGINT, and the later moves kept the placeholder -- so
    // after a reload those posts belonged to no column and vanished.
    const changes = [
      change({ kind: 'create-panel', label: 'New', panelKind: 'section', newPanelName: 'Ideas' }),
      change({ kind: 'move', label: 'Move A', postId: 'p1', panelKind: 'section', newPanelName: 'Ideas' }),
      change({ kind: 'move', label: 'Move B', postId: 'p2', panelKind: 'section', newPanelName: 'Ideas' }),
    ];
    const plan = planPadletApply(changes, [post('p1'), post('p2')], [], options());

    const requested: string[] = [];
    const metadataWrites: Record<string, unknown>[] = [];
    const results = await executePadletApplyPlan(plan, {
      insertSection: async ({ placeholderId }) => { requested.push(placeholderId); return '512'; },
      insertPost: async () => {},
      updateFields: async () => {},
      updateMetadata: async (_postId, metadata) => { metadataWrites.push(metadata); },
    });

    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    // The executor asked the DB for the section the plan had named.
    expect(requested).toEqual(['new-1']);
    // BOTH moves carry the REAL id, never the placeholder.
    expect(metadataWrites).toHaveLength(2);
    expect(metadataWrites.map((meta) => meta.sectionId)).toEqual(['512', '512']);
    expect(metadataWrites.every((meta) => meta.sectionId !== 'new-1')).toBe(true);
  });

  it('maps a created section for a post INSERTED into it too', async () => {
    const changes = [
      change({ kind: 'create-panel', label: 'New', panelKind: 'section', newPanelName: 'Ideas' }),
      change({ kind: 'create', label: 'A', panelKind: 'section', newPanelName: 'Ideas', title: 'A' }),
    ];
    const plan = planPadletApply(changes, [], [], options());
    const rows: Record<string, unknown>[] = [];
    await executePadletApplyPlan(plan, {
      insertSection: async () => '512',
      insertPost: async (row) => { rows.push(row); },
      updateFields: async () => {},
      updateMetadata: async () => {},
    });
    expect((rows[0].metadata as Record<string, unknown>).sectionId).toBe('512');
  });

  it('stops the batch and reports the failure when a write throws', async () => {
    const changes = [
      change({ kind: 'update', label: 'Rename', postId: 'p1', title: 'X' }),
      change({ kind: 'update', label: 'Rename', postId: 'p2', title: 'Y' }),
    ];
    const plan = planPadletApply(changes, [post('p1'), post('p2')], [], options());
    const failures: unknown[] = [];
    let calls = 0;
    const results = await executePadletApplyPlan(plan, {
      insertSection: async () => null,
      insertPost: async () => {},
      updateFields: async () => { calls += 1; throw new Error('boom'); },
      updateMetadata: async () => {},
      onFailure: (error) => { failures.push(error); },
    });
    expect(calls).toBe(1);
    expect(results).toEqual([{ ok: false, message: 'Could not apply this change' }]);
    expect(failures).toHaveLength(1);
  });

  it('stops before any write when the plan already failed a change', async () => {
    const changes = [
      change({ kind: 'update', label: 'Rename', postId: 'missing', title: 'X' }),
      change({ kind: 'update', label: 'Rename', postId: 'p2', title: 'Y' }),
    ];
    const plan = planPadletApply(changes, [post('p2')], [], options());
    let calls = 0;
    const results = await executePadletApplyPlan(plan, {
      insertSection: async () => null,
      insertPost: async () => {},
      updateFields: async () => { calls += 1; },
      updateMetadata: async () => {},
    });
    expect(calls).toBe(0);
    expect(results).toEqual([{ ok: false, message: 'Could not find the post' }]);
  });
});
