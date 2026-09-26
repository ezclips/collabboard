// @vitest-environment jsdom
//
// PATCH-193. KnowledgeSourceOpenOverride: the wrapper a host nested inside a
// modal uses so its own close runs BEFORE the enclosing open.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SourceReference } from '@/lib/domain/knowledge/knowledgePersistence';
import {
  KnowledgeSourceOpenOverride,
  KnowledgeSourceReferenceProvider,
  useKnowledgeSourceOpen,
} from './KnowledgeSourceReferenceContext';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
function mount(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(ui);
  });
  mounted.push({ root, container });
  return container;
}
afterEach(() => {
  for (const m of mounted) {
    act(() => {
      m.root.unmount();
    });
    m.container.remove();
  }
  mounted = [];
});

const reference = { pageStart: 2 } as unknown as SourceReference;

let seen: ((reference: SourceReference) => void) | null | undefined;
function Probe() {
  seen = useKnowledgeSourceOpen();
  return <div data-testid="probe" />;
}

describe('KnowledgeSourceOpenOverride (PATCH-193)', () => {
  it('runs before() THEN the enclosing opener, with the same reference', () => {
    const order: string[] = [];
    const before = vi.fn(() => order.push('before'));
    const parent = vi.fn(() => order.push('parent'));

    mount(
      <KnowledgeSourceReferenceProvider index={new Map<string, readonly SourceReference[]>()} onOpenSourceReference={parent}>
        <KnowledgeSourceOpenOverride before={before}>
          <Probe />
        </KnowledgeSourceOpenOverride>
      </KnowledgeSourceReferenceProvider>,
    );

    expect(typeof seen).toBe('function');
    act(() => {
      seen?.(reference);
    });
    expect(order).toEqual(['before', 'parent']);
    expect(parent).toHaveBeenCalledWith(reference);
  });

  it('a null parent stays null, so a host with no opener keeps the inert label', () => {
    mount(
      <KnowledgeSourceOpenOverride before={vi.fn()}>
        <Probe />
      </KnowledgeSourceOpenOverride>,
    );
    expect(seen).toBeNull();
  });
});
