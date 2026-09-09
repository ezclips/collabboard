// @vitest-environment jsdom
import React, { useState } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import PdfWorkspaceChrome, {
  type PdfWorkspaceRightPanel,
  type PdfWorkspaceTab,
} from './PdfWorkspaceChrome';
import {
  buildCanvasToolbarGroups,
  isDirectPdfCanvasLayout,
} from './canvas/ui/canvasToolbarRegistry';
import {
  KNOWLEDGE_PDF_INPUT_ID,
  KNOWLEDGE_PDF_TOOLBAR_INPUT_ID,
} from './KnowledgePdfUploader';

vi.mock('@/components/collabboard/KnowledgePdfUploader', async () => {
  const ReactModule = await import('react');
  return {
    KNOWLEDGE_PDF_INPUT_ID: 'knowledge-pdf-file-input',
    KNOWLEDGE_PDF_TOOLBAR_INPUT_ID: 'knowledge-pdf-toolbar-file-input',
    default: ReactModule.forwardRef(function MockKnowledgePdfUploader() {
      return <input id="knowledge-pdf-file-input" data-testid="knowledge-pdf-uploader" type="file" hidden />;
    }),
  };
});

vi.mock('@/components/collabboard/KnowledgeExistingPdfPicker', () => ({
  default: function MockKnowledgeExistingPdfPicker({
    isOpen,
    onClose,
    onPlace,
  }: {
    isOpen: boolean;
    onClose: () => void;
    onPlace: (document: { id: string; originalFilename: string; processingStatus: 'ready' }) => boolean | Promise<boolean>;
  }) {
    if (!isOpen) return null;
    return (
      <div data-testid="existing-pdf-picker">
        <button
          type="button"
          onClick={async () => {
            await onPlace({ id: 'doc-c', originalFilename: 'Gamma.pdf', processingStatus: 'ready' });
            onClose();
          }}
        >
          Open Gamma.pdf
        </button>
      </div>
    );
  },
}));

vi.mock('@/components/ui/dropdown-menu', async () => {
  const ReactModule = await import('react');
  const Passthrough = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  return {
    DropdownMenu: Passthrough,
    DropdownMenuTrigger: Passthrough,
    DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div role="menu">{children}</div>,
    DropdownMenuItem: ({
      asChild,
      children,
      onSelect,
    }: {
      asChild?: boolean;
      children: React.ReactNode;
      onSelect?: () => void;
    }) => {
      if (asChild && ReactModule.isValidElement(children)) {
        return ReactModule.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
          role: 'menuitem',
          onClick: onSelect,
        });
      }
      return (
        <button type="button" role="menuitem" onClick={onSelect}>
          {children}
        </button>
      );
    },
  };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {};
  Element.prototype.scrollBy ??= function scrollBy() {};
});

let mounted: Array<{ root: Root; container: HTMLElement }> = [];

function mount(ui: React.ReactElement): HTMLElement {
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
  for (const { root, container } of mounted) {
    act(() => {
      root.unmount();
    });
    container.remove();
  }
  mounted = [];
});

const alpha: PdfWorkspaceTab = { documentId: 'doc-a', originalFilename: 'Alpha.pdf', pageCount: 5 };
const beta: PdfWorkspaceTab = { documentId: 'doc-b', originalFilename: 'Beta.pdf', pageCount: 7 };

function click(target: Element | null): void {
  expect(target).toBeTruthy();
  act(() => {
    target!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

async function clickAsync(target: Element | null): Promise<void> {
  expect(target).toBeTruthy();
  await act(async () => {
    target!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

function tabs(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[data-pdf-workspace-tab]'))
    .map((node) => node.dataset.pdfWorkspaceTab ?? '');
}

function activeReader(container: HTMLElement): string | null {
  return container.querySelector('[data-testid="active-reader"]')?.textContent ?? null;
}

function scrollButtons(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('[data-pdf-workspace-scroll]'));
}

function menuItemByText(text: string): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'))
    .find((node) => node.textContent?.includes(text)) ?? null;
}

function TestWorkspace({
  initialTabs = [],
  initialActive = null,
  aiAvailable = true,
}: {
  initialTabs?: PdfWorkspaceTab[];
  initialActive?: string | null;
  aiAvailable?: boolean;
}) {
  const [open, setOpen] = useState(initialTabs.length > 0);
  const [workspaceTabs, setWorkspaceTabs] = useState<PdfWorkspaceTab[]>(initialTabs);
  const [activeId, setActiveId] = useState<string | null>(initialActive ?? initialTabs[0]?.documentId ?? null);
  const [rightPanel, setRightPanel] = useState<PdfWorkspaceRightPanel>('closed');

  const openDocument = (document: PdfWorkspaceTab) => {
    setOpen(true);
    setWorkspaceTabs((current) => {
      if (current.some((tab) => tab.documentId === document.documentId)) return current;
      return [...current, document];
    });
    setActiveId(document.documentId);
  };

  const closeTab = (documentId: string) => {
    setWorkspaceTabs((current) => {
      const closingIndex = current.findIndex((tab) => tab.documentId === documentId);
      const next = current.filter((tab) => tab.documentId !== documentId);
      if (next.length === 0) {
        setOpen(false);
        setActiveId(null);
        setRightPanel('closed');
        return [];
      }
      setActiveId((active) => {
        if (active !== documentId) return active;
        return next[Math.min(closingIndex, next.length - 1)]?.documentId ?? next[0].documentId;
      });
      return next;
    });
  };

  const activeDocument = workspaceTabs.find((tab) => tab.documentId === activeId) ?? workspaceTabs[0] ?? null;

  return (
    <div>
      <button type="button" data-testid="open-alpha" onClick={() => openDocument(alpha)}>
        Open Alpha
      </button>
      <button type="button" data-testid="open-beta" onClick={() => openDocument(beta)}>
        Open Beta
      </button>
      {open && activeDocument ? (
        <PdfWorkspaceChrome
          boardId="board-1"
          tabs={workspaceTabs}
          activeDocumentId={activeDocument.documentId}
          rightPanel={rightPanel}
          aiAvailable={aiAvailable}
          rightPanelContent={<div data-testid="panel-context">{activeDocument.documentId}</div>}
          onActivateTab={setActiveId}
          onCloseTab={closeTab}
          onCloseWorkspace={() => {
            setOpen(false);
            setRightPanel('closed');
          }}
          onRightPanelChange={setRightPanel}
          onUploadedDocument={(document) => {
            openDocument({ documentId: document.id, originalFilename: document.originalFilename });
          }}
          onOpenExistingDocument={(document) => {
            openDocument({ documentId: document.id, originalFilename: document.originalFilename });
            return true;
          }}
        >
          <div data-testid="active-reader">{activeDocument.documentId}</div>
        </PdfWorkspaceChrome>
      ) : (
        <div data-testid="workspace-closed">closed</div>
      )}
    </div>
  );
}

describe('PdfWorkspaceChrome', () => {
  it('opens, appends, deduplicates, activates, and preserves stable tab order', () => {
    const container = mount(<TestWorkspace />);

    click(container.querySelector('[data-testid="open-alpha"]'));
    expect(tabs(container)).toEqual(['doc-a']);
    expect(activeReader(container)).toBe('doc-a');

    click(container.querySelector('[data-testid="open-beta"]'));
    expect(tabs(container)).toEqual(['doc-a', 'doc-b']);
    expect(activeReader(container)).toBe('doc-b');

    click(container.querySelector('[data-testid="open-alpha"]'));
    expect(tabs(container)).toEqual(['doc-a', 'doc-b']);
    expect(activeReader(container)).toBe('doc-a');

    click(container.querySelector('[data-pdf-workspace-tab="doc-b"] button'));
    expect(tabs(container)).toEqual(['doc-a', 'doc-b']);
    expect(activeReader(container)).toBe('doc-b');
    expect(container.querySelector('[data-pdf-workspace-tab-active="true"]')?.getAttribute('data-pdf-workspace-tab')).toBe('doc-b');
    expect(container.querySelector('[data-pdf-workspace-tab="doc-b"] [role="tab"]')?.getAttribute('aria-selected')).toBe('true');
    expect(container.querySelector('[data-pdf-workspace-tab="doc-a"] [role="tab"]')?.getAttribute('aria-selected')).toBe('false');
  });

  it('closes inactive tabs, selects an adjacent tab when active closes, and closes the workspace on the last tab', () => {
    const documentDelete = vi.fn();
    const container = mount(<TestWorkspace initialTabs={[alpha, beta]} initialActive="doc-a" />);

    click(container.querySelector('[data-pdf-workspace-tab-close="doc-b"]'));
    expect(tabs(container)).toEqual(['doc-a']);
    expect(activeReader(container)).toBe('doc-a');
    expect(documentDelete).not.toHaveBeenCalled();

    click(container.querySelector('[data-testid="open-beta"]'));
    click(container.querySelector('[data-pdf-workspace-tab-close="doc-a"]'));
    expect(tabs(container)).toEqual(['doc-b']);
    expect(activeReader(container)).toBe('doc-b');
    expect(documentDelete).not.toHaveBeenCalled();

    click(container.querySelector('[data-pdf-workspace-tab-close="doc-b"]'));
    expect(container.querySelector('[data-testid="workspace-closed"]')?.textContent).toBe('closed');
    expect(documentDelete).not.toHaveBeenCalled();
  });

  it('opens an existing durable PDF from the workspace plus menu', async () => {
    const container = mount(<TestWorkspace initialTabs={[alpha]} initialActive="doc-a" />);

    click(container.querySelector('[data-pdf-workspace-add="true"]'));
    click(menuItemByText('Open existing PDF'));
    await clickAsync(container.querySelector('[data-testid="existing-pdf-picker"] button'));

    expect(tabs(container)).toEqual(['doc-a', 'doc-c']);
    expect(activeReader(container)).toBe('doc-c');
  });

  it('keeps right panels mutually exclusive and switches panel document identity with the active PDF', () => {
    const container = mount(<TestWorkspace initialTabs={[alpha, beta]} initialActive="doc-a" />);

    click(container.querySelector('[data-pdf-workspace-dock="library"]'));
    expect(container.querySelector('[data-pdf-workspace-main="true"]')?.className).toContain('flex-1');
    expect(container.querySelector('[data-pdf-workspace-right-panel-content="true"]')?.className).toContain('w-[clamp(360px,28vw,400px)]');
    expect(container.querySelector('[data-pdf-workspace-dock="library"]')?.className).toContain('bg-blue-600');
    expect(container.querySelector('[data-pdf-workspace-panel-document="true"]')?.textContent).toBe('Alpha.pdf');
    expect(container.querySelector('[data-pdf-workspace-panel-title="true"]')?.textContent).toBe('Library');
    expect(container.querySelector('[data-testid="panel-context"]')?.textContent).toBe('doc-a');

    click(container.querySelector('[data-pdf-workspace-tab="doc-b"] button'));
    expect(container.querySelector('[data-pdf-workspace-panel-document="true"]')?.textContent).toBe('Beta.pdf');
    expect(container.querySelector('[data-testid="panel-context"]')?.textContent).toBe('doc-b');

    click(container.querySelector('[data-pdf-workspace-dock="ai"]'));
    expect(container.querySelector('[data-pdf-workspace-dock="library"]')?.getAttribute('aria-pressed')).toBe('false');
    expect(container.querySelector('[data-pdf-workspace-dock="ai"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelectorAll('[data-pdf-workspace-right-panel-content="true"]')).toHaveLength(1);
    expect(container.querySelector('[data-pdf-workspace-panel-title="true"]')?.textContent).toBe('AI');
    expect(container.querySelector('[data-pdf-workspace-panel-document="true"]')?.textContent).toBe('Beta.pdf');

    click(container.querySelector('[data-pdf-workspace-dock="ai"]'));
    expect(container.querySelector('[data-pdf-workspace-right-panel-content="true"]')).toBeNull();
  });

  it('keeps the tab row one-line overflow capable and omits deferred PDF subnavigation', () => {
    const container = mount(<TestWorkspace initialTabs={[alpha, beta]} initialActive="doc-a" />);
    const row = container.querySelector<HTMLElement>('[data-pdf-workspace-tab-row="true"]');

    expect(row?.getAttribute('role')).toBe('tablist');
    expect(row?.getAttribute('aria-label')).toBe('Open PDFs');
    expect(row?.className).toContain('flex-nowrap');
    expect(row?.className).toContain('overflow-x-auto');
    expect(row?.className).toContain('whitespace-nowrap');
    const [left, right] = scrollButtons(container);
    expect(left?.getAttribute('aria-label')).toBe('Reveal previous PDF tabs');
    expect(right?.getAttribute('aria-label')).toBe('Reveal next PDF tabs');
    expect(row?.previousElementSibling).toBe(left);
    expect(row?.nextElementSibling).toBe(right);
    expect(container.querySelector('[data-pdf-workspace-fixed-tab-controls="true"] [data-pdf-workspace-all-menu="true"]')).toBeTruthy();
    expect(container.querySelector('[data-pdf-workspace-fixed-tab-controls="true"] [data-pdf-workspace-add="true"]')).toBeTruthy();
    expect(container.querySelector('[data-pdf-workspace-all-menu="true"]')?.getAttribute('aria-label')).toBe('All open PDFs');
    expect(container.querySelector('[data-pdf-workspace-add="true"]')?.getAttribute('aria-label')).toBe('Add PDF');
    expect(container.querySelector('[data-pdf-workspace-tab-close="doc-a"]')?.getAttribute('aria-label')).toBe('Close Alpha.pdf');
    expect(container.textContent).not.toContain('From this PDF');
    expect(container.textContent).not.toContain('AI Summary');
    expect(container.textContent).not.toContain('Page Grid');
  });

  it('updates tab reveal controls at scroll boundaries and reveals the active tab without reordering', () => {
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      const container = mount(<TestWorkspace initialTabs={[alpha, beta]} initialActive="doc-b" />);
      const row = container.querySelector<HTMLElement>('[data-pdf-workspace-tab-row="true"]');
      expect(row).toBeTruthy();
      Object.defineProperty(row, 'clientWidth', { configurable: true, value: 100 });
      Object.defineProperty(row, 'scrollWidth', { configurable: true, value: 300 });
      row!.scrollLeft = 0;

      act(() => {
        row!.dispatchEvent(new Event('scroll', { bubbles: true }));
      });
      let [left, right] = scrollButtons(container);
      expect(left.disabled).toBe(true);
      expect(right.disabled).toBe(false);

      row!.scrollLeft = 200;
      act(() => {
        row!.dispatchEvent(new Event('scroll', { bubbles: true }));
      });
      [left, right] = scrollButtons(container);
      expect(left.disabled).toBe(false);
      expect(right.disabled).toBe(true);
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
      expect(tabs(container)).toEqual(['doc-a', 'doc-b']);
    } finally {
      Element.prototype.scrollIntoView = originalScrollIntoView;
    }
  });
});

describe('PdfWorkspaceChrome yields to a blocking editor', () => {
  /** The board's flag, driven from outside exactly as CanvasClient drives it. */
  function YieldingWorkspace({ blockingEditorOpen }: { blockingEditorOpen: boolean }) {
    return (
      <PdfWorkspaceChrome
        boardId="board-1"
        tabs={[alpha]}
        activeDocumentId={alpha.documentId}
        rightPanel="library"
        aiAvailable
        yieldsToEditor={blockingEditorOpen}
        rightPanelContent={<div data-testid="panel-context">{alpha.documentId}</div>}
        onActivateTab={() => {}}
        onCloseTab={() => {}}
        onCloseWorkspace={() => {}}
        onRightPanelChange={() => {}}
        onUploadedDocument={() => {}}
        onOpenExistingDocument={() => false}
      >
        <div data-testid="active-reader">{alpha.documentId}</div>
      </PdfWorkspaceChrome>
    );
  }

  it('steps aside without unmounting, and comes back unchanged', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    mounted.push({ root, container });
    const render = (blockingEditorOpen: boolean) => {
      act(() => { root.render(<YieldingWorkspace blockingEditorOpen={blockingEditorOpen} />); });
    };
    const host = () => container.querySelector('[data-pdf-workspace="true"]') as HTMLElement;

    render(false);
    const before = host();
    expect(host().getAttribute('data-pdf-workspace-yielded')).toBe('false');
    expect(host().className).not.toContain('opacity-0');
    expect(host().className).not.toContain('pointer-events-none');

    render(true);
    // Invisible AND inert: an opaque full-viewport host that stayed clickable
    // would still swallow every click meant for the editor.
    expect(host().getAttribute('data-pdf-workspace-yielded')).toBe('true');
    expect(host().className).toContain('opacity-0');
    expect(host().className).toContain('pointer-events-none');
    expect(host().className).toContain('transition-opacity');
    // Same band, same element, same content: it stepped aside; it did not
    // move, unmount, or drop the document and panel it was showing.
    expect(host().className).toContain('z-[3100]');
    expect(host()).toBe(before);
    expect(activeReader(container)).toBe(alpha.documentId);
    expect(host().getAttribute('data-pdf-workspace-right-panel')).toBe('library');

    render(false);
    expect(host().getAttribute('data-pdf-workspace-yielded')).toBe('false');
    expect(host().className).not.toContain('opacity-0');
    expect(host().className).not.toContain('pointer-events-none');
    expect(host()).toBe(before);
    expect(activeReader(container)).toBe(alpha.documentId);
  });
});

describe('canvas toolbar PDF entry point', () => {
  const groupsFor = (flags: Partial<Parameters<typeof buildCanvasToolbarGroups>[0]>) =>
    buildCanvasToolbarGroups({
      isMapLayout: false,
      isFreeformLayout: false,
      isFreeformGraphMode: false,
      isTimelineLayout: false,
      chronoMode: null,
      canManageCanvasShare: false,
      canUseFreeformEditButton: false,
      isDrawingLayout: false,
      isDirectPdfLayout: false,
      ...flags,
    });

  it('offers ONE PDF tool in Media where direct PDF placement is supported', () => {
    const media = groupsFor({ isFreeformLayout: true, isDirectPdfLayout: true })
      .find((group) => group.id === 'media');
    const pdfTools = (media?.tools ?? []).filter((tool) => tool.type.startsWith('knowledge-pdf'));

    expect(pdfTools).toHaveLength(1);
    expect(pdfTools[0].label).toBe('PDF');
    // Pinned and label-driven: the More menu dispatches after it has closed, by
    // which point the browser will not open a file dialog for us.
    expect(pdfTools[0].pinned).toBe(true);
    expect(pdfTools[0].activatesInputId).toBe(KNOWLEDGE_PDF_TOOLBAR_INPUT_ID);
    // Re-placing an existing PDF stays in the workspace "+" flow.
    expect(pdfTools.some((tool) => tool.type === 'knowledge-pdf-existing')).toBe(false);
    // Its own input id, so the workspace's uploader cannot be reached by it.
    expect(pdfTools[0].activatesInputId).not.toBe(KNOWLEDGE_PDF_INPUT_ID);
  });

  it('withholds it entirely outside the direct-PDF allowlist, Drawing included', () => {
    for (const flags of [
      {},
      { isDrawingLayout: true },
      { isTimelineLayout: true },
      { isFreeformLayout: true },
    ]) {
      const tools = groupsFor(flags).flatMap((group) => group.tools);
      expect(tools.some((tool) => tool.type.startsWith('knowledge-pdf'))).toBe(false);
      // The generic board Library tool is untouched by any of this.
      expect(tools.some((tool) => tool.type === 'library' && tool.label === 'Library')).toBe(true);
    }
    expect(isDirectPdfCanvasLayout('drawing')).toBe(false);
    expect(isDirectPdfCanvasLayout('freeform')).toBe(true);
  });
});
