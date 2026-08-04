import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
const postCardContentSrc = read('components/collabboard/PostCardContent.tsx');
const cardPreviewSrc = read('components/collabboard/CardPreview.tsx');
const documentCardContentSrc = read('components/collabboard/DocumentCardContent.tsx');
const freeformSrc = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
const canvasClientSrc = read('app/dashboard/canvas/[id]/CanvasClient.tsx');

const OWNER_FILES = [
  'components/canvas/layouts/ColumnsLayout.tsx',
  'components/canvas/layouts/ColumnsCanvasRow.tsx',
  'components/collabboard/row/RowLane.tsx',
  'components/collabboard/row/RowCanvasDnD.tsx',
  'components/canvas/WallCanvas.tsx',
  'components/collabboard/canvas/layouts/DrawingLayout.tsx',
  'components/map/PostPopup.tsx',
  'components/map/MapCanvas.tsx',
];

describe('17: PostCardContent Document branch', () => {
  it('gates on isDocumentPost + onOpenDocument and delegates to DocumentCardContent', () => {
    expect(postCardContentSrc).toContain('isDocumentPost(padlet) && onOpenDocument');
    expect(postCardContentSrc).toContain('<DocumentCardContent');
  });

  it('27: the clipart branch is textually before the Document branch (still the sole gate)', () => {
    const clipartAt = postCardContentSrc.indexOf('padlet.metadata?.svgUrl');
    const documentAt = postCardContentSrc.indexOf('isDocumentPost(padlet) && onOpenDocument');
    expect(clipartAt).toBeGreaterThan(-1);
    expect(documentAt).toBeGreaterThan(clipartAt);
  });
});

describe('18-22: every interactive owner threads onOpenDocument', () => {
  it('each governed owner file declares/passes onOpenDocument', () => {
    for (const f of OWNER_FILES) {
      expect(read(f), f).toContain('onOpenDocument');
    }
  });

  it('18: Columns -- prop declared in ColumnsLayout and wired to PostCardContent in ColumnsCanvasRow', () => {
    const layout = read('components/canvas/layouts/ColumnsLayout.tsx');
    const row = read('components/canvas/layouts/ColumnsCanvasRow.tsx');
    expect(layout).toContain('onOpenDocument={onOpenDocument}');
    expect(row).toMatch(/<PostCardContent[^]*?onOpenDocument=\{onOpenDocument \? \(\) => onOpenDocument\(post\) : undefined\}/);
  });

  it('19: Rows -- prop threaded RowCanvasDnD -> RowLane -> PostCardContent', () => {
    const dnd = read('components/collabboard/row/RowCanvasDnD.tsx');
    const lane = read('components/collabboard/row/RowLane.tsx');
    expect(dnd).toContain('onOpenDocument={onOpenDocument}');
    expect(lane).toMatch(/<PostCardContent[^]*?onOpenDocument=\{onOpenDocument \? \(\) => onOpenDocument\(post\) : undefined\}/);
  });

  it('21: Drawing -- prop reaches the live embeddable PostCardContent render', () => {
    const drawing = read('components/collabboard/canvas/layouts/DrawingLayout.tsx');
    expect(drawing).toMatch(/<PostCardContent[^]*?onOpenDocument=\{onOpenDocument \? \(\) => onOpenDocument\(padlet\) : undefined\}/);
    // The guarded context-menu route (CanvasContextMenu.tsx) is untouched --
    // no second Document-routing branch was added there.
    const contextMenu = read('components/collabboard/canvas/ui/CanvasContextMenu.tsx');
    expect(contextMenu).toContain('isContainerType && onEditPadletAsPost');
  });

  it('22: Map -- prop threaded MapCanvas -> PostPopup -> PostCardContent', () => {
    const map = read('components/map/MapCanvas.tsx');
    const popup = read('components/map/PostPopup.tsx');
    expect(map).toContain('onOpenDocument={onOpenDocument}');
    expect(popup).toMatch(/<PostCardContent[^]*?onOpenDocument=\{onOpenDocument \? \(\) => onOpenDocument\(post\) : undefined\}/);
  });
});

describe('16: Freeform/CardPreview owner', () => {
  it('exact Document uses selectDocumentModalDestination and reuses the existing state/predicate, no new one', () => {
    const branch = freeformSrc.slice(
      freeformSrc.indexOf('onReadDocument={(() => {'),
      freeformSrc.indexOf('isSelected={isPadletSelected(padlet.id)}'),
    );
    expect(branch).toContain('selectDocumentModalDestination(padlet, canUseFreeformEditButton)');
    expect(branch).toContain('setDocumentModalDestination(d)');
    // 24: the complete post (not just the destination) reaches the route.
    expect(branch).toContain('setPadletToEdit(padlet)');
  });
});

describe('23: CanvasClient supplies one Document-open callback, reused everywhere', () => {
  const body = canvasClientSrc.slice(
    canvasClientSrc.indexOf('const openDocumentFromPreview = (post: Padlet) => {'),
    canvasClientSrc.indexOf('const openPadletTargetFromContextMenu'),
  );

  it('reuses the B1b-ii destination helper and state -- no duplicated selector or permission logic', () => {
    expect(body).toContain('selectDocumentModalDestination(post, canUseFreeformEditButton)');
    expect(body).toContain('setDocumentModalDestination(destination)');
  });

  it('the same callback instance is passed to all five interactive layout owners', () => {
    expect((canvasClientSrc.match(/onOpenDocument=\{openDocumentFromPreview\}/g) || []).length).toBe(5);
  });
});

describe('13: the affordance never appears without isDocumentPost as the sole gate', () => {
  it('CardPreview and DocumentCardContent contain no capability, role or persistence logic', () => {
    for (const src of [cardPreviewSrc, documentCardContentSrc]) {
      expect(src).not.toMatch(/currentWorkspaceRole|canEditWorkspace|supabase|\.from\(/i);
    }
  });

  it('DocumentCardContent never inspects svgUrl, isClipart or post type', () => {
    expect(documentCardContentSrc).not.toMatch(/svgUrl|isClipart|padlet\.type|post\.type/);
  });
});
