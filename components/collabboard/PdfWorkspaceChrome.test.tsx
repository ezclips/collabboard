// @vitest-environment jsdom
import React, { useState } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import PdfWorkspaceChrome, {
  type PdfWorkspaceRightPanel,
  type PdfWorkspaceTab,
} from './PdfWorkspaceChrome';
import { buildCanvasToolbarGroups } from './canvas/ui/canvasToolbarRegistry';

vi.mock('@/components/collabboard/KnowledgePdfUploader', async () => {
  const ReactModule = await import('react');
  return {
    KNOWLEDGE_PDF_INPUT_ID: 'knowledge-pdf-file-input',
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
    expect(container.querySelector('[data-pdf-workspace-panel-document="true"]')?.textContent).toBe('Alpha.pdf');
    expect(container.querySelector('[data-testid="panel-context"]')?.textContent).toBe('doc-a');

    click(container.querySelector('[data-pdf-workspace-tab="doc-b"] button'));
    expect(container.querySelector('[data-pdf-workspace-panel-document="true"]')?.textContent).toBe('Beta.pdf');
    expect(container.querySelector('[data-testid="panel-context"]')?.textContent).toBe('doc-b');

    click(container.querySelector('[data-pdf-workspace-dock="ai"]'));
    expect(container.querySelector('[data-pdf-workspace-dock="library"]')?.getAttribute('aria-pressed')).toBe('false');
    expect(container.querySelector('[data-pdf-workspace-dock="ai"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('[data-pdf-workspace-panel-document="true"]')?.textContent).toBe('Beta.pdf');

    click(container.querySelector('[data-pdf-workspace-dock="ai"]'));
    expect(container.querySelector('[data-pdf-workspace-right-panel-content="true"]')).toBeNull();
  });

  it('keeps the tab row one-line overflow capable and omits deferred PDF subnavigation', () => {
    const container = mount(<TestWorkspace initialTabs={[alpha, beta]} initialActive="doc-a" />);
    const row = container.querySelector<HTMLElement>('[data-pdf-workspace-tab-row="true"]');

    expect(row?.className).toContain('flex-nowrap');
    expect(row?.className).toContain('overflow-x-auto');
    expect(row?.className).toContain('whitespace-nowrap');
    expect(container.querySelector('[data-pdf-workspace-scroll="left"]')).toBeTruthy();
    expect(container.querySelector('[data-pdf-workspace-scroll="right"]')).toBeTruthy();
    expect(container.querySelector('[data-pdf-workspace-all-menu="true"]')).toBeTruthy();
    expect(container.textContent).not.toContain('From this PDF');
    expect(container.textContent).not.toContain('AI Summary');
    expect(container.textContent).not.toContain('Page Grid');
  });
});

describe('canvas toolbar PDF workspace entry points', () => {
  it('removes old PDF toolbar actions while preserving the generic board Library tool', () => {
    const groups = buildCanvasToolbarGroups({
      isMapLayout: false,
      isFreeformLayout: true,
      isFreeformGraphMode: false,
      isTimelineLayout: false,
      chronoMode: null,
      canManageCanvasShare: false,
      canUseFreeformEditButton: false,
      isDrawingLayout: false,
      isDirectPdfLayout: true,
    });
    const tools = groups.flatMap((group) => group.tools);

    expect(tools.some((tool) => tool.type === 'knowledge-pdf')).toBe(false);
    expect(tools.some((tool) => tool.type === 'knowledge-pdf-existing')).toBe(false);
    expect(tools.some((tool) => tool.label === 'Add PDF')).toBe(false);
    expect(tools.some((tool) => tool.label === 'Use existing PDF')).toBe(false);
    expect(tools.some((tool) => tool.type === 'library' && tool.label === 'Library')).toBe(true);
  });
});
