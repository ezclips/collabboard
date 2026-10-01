// @vitest-environment jsdom
//
// PATCH-239 -- every AI picture edits through a plain form; the raw Mermaid code
// is an Advanced escape hatch only.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { StoredAIContent } from '@/lib/ai/contracts';
import { flowCodeFromGraph, mindmapCodeFromTree } from '@/lib/ai/outlineToVisuals';

vi.mock('@/lib/ai/diagram-engine', () => ({
  renderDiagramCode: vi.fn(async () => ({ ok: true, svg: '<svg></svg>' })),
}));

vi.mock('@/components/ai/AIContentRenderer', async () => {
  const ReactModule = await import('react');
  return {
    default: ({ content }: { content?: { data?: unknown } }) =>
      ReactModule.createElement('div', {
        'data-testid': 'preview',
        'data-preview': JSON.stringify(content?.data ?? null),
      }),
  };
});

import AIContentEditModal from './AIContentEditModal';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
function mount(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(ui); });
  mounted.push({ root, container });
  return container;
}
afterEach(() => {
  for (const m of mounted) {
    act(() => { m.root.unmount(); });
    m.container.remove();
  }
  mounted = [];
});

function click(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}
function setInputValue(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function setTextareaValue(input: HTMLTextAreaElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function buttonContaining(root: ParentNode, text: string): HTMLButtonElement {
  const found = Array.from(root.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes(text));
  expect(found, `no button containing "${text}"`).toBeTruthy();
  return found as HTMLButtonElement;
}

const TREE = {
  label: 'Water cycle',
  children: [
    { label: 'Evaporation', children: [{ label: 'Oceans' }] },
    { label: 'Condensation' },
  ],
};

const MINDMAP_DATA = {
  type: 'diagram' as const,
  subtype: 'mindmap' as const,
  renderer: 'diagram_code' as const,
  title: 'Water cycle',
  code: mindmapCodeFromTree(TREE),
  tree: TREE,
};

const MINDMAP_ENVELOPE: StoredAIContent = { mode: 'diagram', version: 1, data: MINDMAP_DATA };

const FLOW = {
  direction: 'LR' as const,
  nodes: [{ id: 'N0', label: 'Start' }, { id: 'N1', label: 'End' }],
  edges: [{ from: 'N0', to: 'N1' }],
};

const FLOW_ENVELOPE: StoredAIContent = {
  mode: 'diagram',
  version: 1,
  data: {
    type: 'diagram',
    subtype: 'flowchart',
    renderer: 'diagram_code',
    title: 'Flow',
    code: flowCodeFromGraph(FLOW),
  },
};

const OUTLINE = {
  title: 'Seasons',
  ordered: false,
  kind: 'levels' as const,
  items: [
    { label: 'Spring', detail: 'warm' },
    { label: 'Summer', detail: 'hot' },
    { label: 'Autumn', detail: 'cool' },
  ],
};

const INFOGRAPHIC_ENVELOPE: StoredAIContent = {
  mode: 'diagram',
  version: 1,
  data: {
    type: 'diagram',
    subtype: 'infographic',
    renderer: 'infographic',
    title: 'Seasons',
    template: 'pyramid',
    outline: OUTLINE,
  },
};

const BAD_FLOW_ENVELOPE: StoredAIContent = {
  mode: 'diagram',
  version: 1,
  data: {
    type: 'diagram',
    subtype: 'flowchart',
    renderer: 'diagram_code',
    title: 'X',
    code: 'flowchart LR\n  subgraph one\n    A --> B\n  end',
  },
};

describe('PATCH-239 AIContentEditModal structured editors', () => {
  it('a tree mind map shows the tree editor and NO code textarea by default', () => {
    const c = mount(<AIContentEditModal isOpen onClose={() => {}} envelope={MINDMAP_ENVELOPE} onSave={() => {}} />);
    expect(c.querySelector('[data-ai-mindmap-editor]')).not.toBeNull();
    expect(c.querySelector('[data-ai-diagram-code]')).toBeNull();
  });

  it('renaming a branch updates the preview and the saved tree AND code', () => {
    const onSave = vi.fn();
    const c = mount(<AIContentEditModal isOpen onClose={() => {}} envelope={MINDMAP_ENVELOPE} onSave={onSave} />);

    setInputValue(c.querySelector('[data-ai-mindmap-branch="0"]') as HTMLInputElement, 'Evaporation X');
    expect(c.querySelector('[data-preview]')!.getAttribute('data-preview')).toContain('Evaporation X');

    click(buttonContaining(c, 'Save changes'));
    const saved = onSave.mock.calls[0][0].aiComponentJson as StoredAIContent;
    const data = saved.data as typeof MINDMAP_DATA;
    expect(data.tree.children![0].label).toBe('Evaporation X');
    expect(data.code).toBe(mindmapCodeFromTree(data.tree));
    expect(data.code).toContain('Evaporation X');
  });

  it('an old code-only mind map is converted to the tree editor and stores tree + code', () => {
    const codeOnly: StoredAIContent = {
      mode: 'diagram',
      version: 1,
      data: { type: 'diagram', subtype: 'mindmap', renderer: 'diagram_code', title: 'Water cycle', code: mindmapCodeFromTree(TREE) },
    };
    const onSave = vi.fn();
    const c = mount(<AIContentEditModal isOpen onClose={() => {}} envelope={codeOnly} onSave={onSave} />);
    expect(c.querySelector('[data-ai-mindmap-editor]')).not.toBeNull();

    click(buttonContaining(c, 'Save changes'));
    const saved = onSave.mock.calls[0][0].aiComponentJson as StoredAIContent;
    const data = saved.data as typeof MINDMAP_DATA;
    expect(data.tree).toEqual(TREE);
    expect(data.code).toBe(mindmapCodeFromTree(TREE));
  });

  it('a flowchart shows Steps/Connections and saving regenerates the code', () => {
    const onSave = vi.fn();
    const c = mount(<AIContentEditModal isOpen onClose={() => {}} envelope={FLOW_ENVELOPE} onSave={onSave} />);
    expect(c.querySelector('[data-ai-flow-editor]')).not.toBeNull();
    expect(c.querySelector('[data-ai-flow-step="0"]')).not.toBeNull();

    setInputValue(c.querySelector('[data-ai-flow-step="0"]') as HTMLInputElement, 'Begin');
    click(c.querySelector('[data-ai-flow-add-step="true"]') as HTMLElement);

    click(buttonContaining(c, 'Save changes'));
    const saved = onSave.mock.calls[0][0].aiComponentJson as StoredAIContent;
    const code = (saved.data as { code: string }).code;
    expect(code).toContain('N0("Begin")');
    expect(code).toContain('N1 --> N2');
  });

  it('an infographic shows the text form, design row and colours, and saves all three', () => {
    const onSave = vi.fn();
    const c = mount(<AIContentEditModal isOpen onClose={() => {}} envelope={INFOGRAPHIC_ENVELOPE} onSave={onSave} />);
    expect(c.querySelector('[data-ai-outline-editor]')).not.toBeNull();
    expect(c.querySelector('[data-ai-infographic-design="stairs"]')).not.toBeNull();
    expect(c.querySelector('[data-ai-theme="teal-night"]')).not.toBeNull();

    click(c.querySelector('[data-ai-infographic-design="stairs"]') as HTMLElement);
    click(c.querySelector('[data-ai-theme="teal-night"]') as HTMLElement);
    setInputValue(c.querySelector('[data-ai-outline-item-label="0"]') as HTMLInputElement, 'Springtime');

    click(buttonContaining(c, 'Save changes'));
    const saved = onSave.mock.calls[0][0].aiComponentJson as StoredAIContent;
    const data = saved.data as { template: string; theme?: string; outline: typeof OUTLINE };
    expect(data.template).toBe('stairs');
    expect(data.theme).toBe('teal-night');
    expect(data.outline.items[0].label).toBe('Springtime');
  });

  it('an unparseable flowchart shows the Advanced note with the code', () => {
    const c = mount(<AIContentEditModal isOpen onClose={() => {}} envelope={BAD_FLOW_ENVELOPE} onSave={() => {}} />);
    expect(c.textContent).toContain('This diagram was written in code; edit it under Advanced.');
    expect(c.querySelector('[data-ai-diagram-code]')).not.toBeNull();
    expect(c.querySelector('[data-ai-flow-editor]')).toBeNull();
  });

  it('editing code under Advanced on a tree mind map changes the saved tree', () => {
    const onSave = vi.fn();
    const c = mount(<AIContentEditModal isOpen onClose={() => {}} envelope={MINDMAP_ENVELOPE} onSave={onSave} />);

    click(c.querySelector('[data-ai-advanced-toggle="true"]') as HTMLElement);
    const textarea = c.querySelector('[data-ai-diagram-code]') as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();
    setTextareaValue(textarea, ['mindmap', '  root((New root))', '    a[Changed]', '    b[Other]'].join('\n'));

    click(buttonContaining(c, 'Save changes'));
    const saved = onSave.mock.calls[0][0].aiComponentJson as StoredAIContent;
    const tree = (saved.data as typeof MINDMAP_DATA).tree;
    expect(tree.label).toBe('New root');
    expect(tree.children![0].label).toBe('Changed');
  });
});
