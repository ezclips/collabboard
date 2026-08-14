import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

describe('PATCH 9D: Group into Column does not lose Document metadata (move-boundary proof)', () => {
  it('attachPostToContainer.ts still spreads the full existing post metadata, only adding parentId -- untouched by this patch', () => {
    const src = read('components/collabboard/canvas/hooks/attachPostToContainer.ts');
    expect(src).toContain('const newMetadata = { ...post.metadata, parentId: containerId };');
  });
});

describe('PATCH 9D: embedded Read reuses the canonical Document modal path, not a new implementation', () => {
  it('FreeformPadletCards wires RowColumnContainerCard\'s onOpenDocument through selectDocumentModalDestination + requestOpenDocument, the same functions the root Document card\'s own Read button calls', () => {
    const src = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
    const rootReadStart = src.indexOf('onReadDocument={(() => {');
    const rootReadBlock = src.slice(rootReadStart, src.indexOf('})()}', rootReadStart));
    expect(rootReadBlock).toContain('selectDocumentModalDestination(padlet, canUseFreeformEditButton)');
    expect(rootReadBlock).toContain('requestOpenDocument(padlet, d)');

    const containerStart = src.indexOf("{padlet.type === 'container' && (");
    const containerEnd = src.indexOf('/>', src.indexOf('onOpenDocument={(child)', containerStart));
    const containerBlock = src.slice(containerStart, containerEnd);
    expect(containerBlock).toContain('onOpenDocument={(child) => {');
    expect(containerBlock).toContain('selectDocumentModalDestination(child, canUseFreeformEditButton)');
    expect(containerBlock).toContain('requestOpenDocument(child, destination)');
  });

  it('does not route embedded Read through the generic Edit action (openFreeformPadletModal / edit.* actions)', () => {
    const src = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
    const containerStart = src.indexOf("{padlet.type === 'container' && (");
    const containerEnd = src.indexOf('/>', src.indexOf('onOpenDocument={(child)', containerStart));
    const containerBlock = src.slice(containerStart, containerEnd);
    expect(containerBlock).not.toContain('openFreeformPadletModal');
  });

  it('no new modal component was introduced -- RowColumnContainerCard and PostCardContent only forward onOpenDocument, they never construct their own modal', () => {
    const rowColumn = read('components/collabboard/RowColumnContainerCard.tsx');
    const postCard = read('components/collabboard/PostCardContent.tsx');
    for (const src of [rowColumn, postCard]) {
      expect(src).not.toContain('ContainerDocumentModal');
      expect(src).not.toContain('EmbeddedDocumentViewer');
    }
  });

  it('readonly is not incorrectly gated: onOpenDocument is always provided (Read available); only the editor-vs-viewer destination depends on canUseFreeformEditButton, same as root', () => {
    const src = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
    const containerStart = src.indexOf("{padlet.type === 'container' && (");
    const containerEnd = src.indexOf('/>', src.indexOf('onOpenDocument={(child)', containerStart));
    const containerBlock = src.slice(containerStart, containerEnd);
    // The callback itself is unconditional (not `canUseFreeformEditButton ? ... : undefined`).
    expect(containerBlock).toMatch(/onOpenDocument=\{\(child\) => \{/);
    expect(containerBlock).not.toMatch(/onOpenDocument=\{canUseFreeformEditButton/);
  });
});

describe('PATCH 9D: Document child color is child-owned, never Container-owned', () => {
  it('resolveChildCardChrome reads only child.metadata, never the Container\'s own metadata', () => {
    const src = read('lib/domain/canvas/documentPost.ts');
    const fnBody = src.slice(src.indexOf('export function resolveChildCardChrome'), src.length);
    expect(fnBody).not.toMatch(/container\.metadata/);
    expect(fnBody).not.toMatch(/padlet\.metadata\.childPadletIds/);
  });

  it('both Container-child renderers (root-level and nested-Container) call the same shared resolver -- one color rule, not two', () => {
    const rowColumn = read('components/collabboard/RowColumnContainerCard.tsx');
    const postCard = read('components/collabboard/PostCardContent.tsx');
    expect(rowColumn).toContain('import { resolveChildCardChrome } from "@/lib/domain/canvas/documentPost";');
    expect(rowColumn).toContain('const childCardChrome = resolveChildCardChrome(child);');
    expect(postCard).toContain('import { isDocumentPost, resolveChildCardChrome } from "@/lib/domain/canvas/documentPost";');
    expect(postCard).toContain('const childCardChrome = resolveChildCardChrome(child);');
  });
});

describe('PATCH 9D: no Document storage/data-model change', () => {
  it('the Document data model file (documentPost.ts) adds a pure presentation resolver only -- isDocumentPost itself is untouched', () => {
    const src = read('lib/domain/canvas/documentPost.ts');
    expect(src).toContain("return post.type === 'card' && !post.metadata?.svgUrl;");
  });
});

describe('PATCH 9D: Container Editor is untouched', () => {
  it('ContainerEditor.tsx has no Document-specific color/Read wiring added', () => {
    const src = read('components/collabboard/editors/ContainerEditor.tsx');
    expect(src).not.toContain('resolveChildCardChrome');
    expect(src).not.toContain('onOpenDocument');
  });
});

describe('PATCH 9D: prior patches remain untouched (regression guards)', () => {
  it('Group into Column (PATCH 9A) still delegates to attachPostToContainer', () => {
    const src = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
    expect(src).toContain("import { attachPostToContainer, cleanupGraphEdgesForContainerChild } from '@/components/collabboard/canvas/hooks/attachPostToContainer';");
    expect(src).toContain('await attachPostToContainer({');
  });

  it('Image actions (PATCH 9B/9B.1) remain untouched', () => {
    const src = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
    expect(src).toContain('createStorageGateway()');
    expect(src).toContain('padlet.metadata?.imageUrl || padlet.file_url || (padlet.metadata as any)?.fileUrl');
  });

  it('Per-child Post titles submenu (PATCH 9C.1) remains untouched', () => {
    const menu = read('components/collabboard/menus/ColumnPostContextMenu.tsx');
    expect(menu).toContain('onTogglePostTitleVisibility');
    expect(menu).toContain('postTitleVisibleIds');
    const helper = read('lib/infra/collabboard/containerChildTitleVisibility.ts');
    expect(helper).toContain('export function getEffectiveVisibleChildTitleIds');
    expect(helper).toContain('export function resolveVisibleChildTitle');
  });
});
