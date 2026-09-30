import { describe, expect, it } from 'vitest';

import { planReattach } from './reattachEdge';
import type { FreeformGraphEdge } from '@/types/graphTypes';

function edge(id: string, source: string, target: string): FreeformGraphEdge {
  return {
    id,
    board_id: 'board1',
    source_post_id: source,
    target_post_id: target,
    relation_type: 'solid',
    direction: 'forward',
    label: null,
    style: null,
    created_at: '',
    updated_at: '',
  } as FreeformGraphEdge;
}

describe('PATCH-228 planReattach', () => {
  const e1 = edge('e1', 'A', 'B');

  it('dropping an end on the post it already attaches to is a noop', () => {
    expect(planReattach(e1, 'source', 'A', [e1])).toEqual({ kind: 'noop' });
    expect(planReattach(e1, 'target', 'B', [e1])).toEqual({ kind: 'noop' });
  });

  it('a duplicate in either direction is rejected', () => {
    const forward = edge('e2', 'C', 'B');
    const backward = edge('e3', 'B', 'C');
    expect(planReattach(e1, 'source', 'C', [e1, forward])).toEqual({ kind: 'duplicate' });
    expect(planReattach(e1, 'source', 'C', [e1, backward])).toEqual({ kind: 'duplicate' });
  });

  it('the edge\'s own id is ignored in the duplicate check', () => {
    // e1 is A->B; its own row must not count as the duplicate for a new pair.
    expect(planReattach(e1, 'source', 'C', [e1])).toEqual({
      kind: 'update',
      patch: { source_post_id: 'C' },
    });
  });

  it('the source end produces a source patch; the target end a target patch', () => {
    expect(planReattach(e1, 'source', 'C', [e1])).toEqual({
      kind: 'update',
      patch: { source_post_id: 'C' },
    });
    expect(planReattach(e1, 'target', 'C', [e1])).toEqual({
      kind: 'update',
      patch: { target_post_id: 'C' },
    });
  });
});
