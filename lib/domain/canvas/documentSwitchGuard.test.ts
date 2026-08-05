import { describe, expect, it } from 'vitest';
import { decideDocumentSwitch, type QueuedDocumentAction } from './documentSwitchGuard';

const openDoc: QueuedDocumentAction = {
  kind: 'open-document',
  post: { id: 'target-1', title: 'Target', content: '', metadata: {} } as any,
  destination: 'document-editor',
};

describe('decideDocumentSwitch (PATCH-149B2-ii §32.12 O4-C)', () => {
  it('7: no current Document -> proceed', () => {
    expect(decideDocumentSwitch({ destination: null, isDirty: false }, openDoc)).toEqual({ type: 'proceed' });
    // isDirty is meaningless with no destination; must still proceed.
    expect(decideDocumentSwitch({ destination: null, isDirty: true }, openDoc)).toEqual({ type: 'proceed' });
  });

  it('8: read-only current -> proceed-after-clear, regardless of isDirty', () => {
    expect(decideDocumentSwitch({ destination: 'document-viewer', isDirty: false }, openDoc))
      .toEqual({ type: 'proceed-after-clear' });
    expect(decideDocumentSwitch({ destination: 'document-viewer', isDirty: true }, openDoc))
      .toEqual({ type: 'proceed-after-clear' });
  });

  it('9: clean editable current -> proceed-after-clear', () => {
    expect(decideDocumentSwitch({ destination: 'document-editor', isDirty: false }, openDoc))
      .toEqual({ type: 'proceed-after-clear' });
  });

  it('10/11: dirty editable current -> blocked, with the exact queued action preserved intact', () => {
    const decision = decideDocumentSwitch({ destination: 'document-editor', isDirty: true }, openDoc);
    expect(decision.type).toBe('blocked');
    expect(decision).toEqual({ type: 'blocked', queued: openDoc });
    if (decision.type === 'blocked') {
      expect(decision.queued.kind).toBe('open-document');
      // Complete post + destination, not an id alone (§32.12 "never an id alone").
      expect((decision.queued as any).post).toEqual(openDoc.post);
      expect((decision.queued as any).destination).toBe('document-editor');
    }
  });

  it('is a pure function: repeated calls with the same input produce equal, independent results', () => {
    const current = { destination: 'document-editor' as const, isDirty: true };
    const a = decideDocumentSwitch(current, openDoc);
    const b = decideDocumentSwitch(current, openDoc);
    expect(a).toEqual(b);
    expect(a).not.toBe(b); // no shared mutable identity between calls
  });

  it('supports the open-tool and open-drawing-editor action kinds identically to open-document', () => {
    const tool: QueuedDocumentAction = { kind: 'open-tool', toolType: 'note' };
    const drawing: QueuedDocumentAction = { kind: 'open-drawing-editor', padlet: { id: 'p1' } as any };
    expect(decideDocumentSwitch({ destination: 'document-editor', isDirty: true }, tool)).toEqual({ type: 'blocked', queued: tool });
    expect(decideDocumentSwitch({ destination: 'document-editor', isDirty: true }, drawing)).toEqual({ type: 'blocked', queued: drawing });
    expect(decideDocumentSwitch({ destination: 'document-editor', isDirty: false }, tool)).toEqual({ type: 'proceed-after-clear' });
  });
});
