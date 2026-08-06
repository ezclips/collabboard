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
  const branch = freeformSrc.slice(
    freeformSrc.indexOf('onReadDocument={(() => {'),
    freeformSrc.indexOf('isSelected={isPadletSelected(padlet.id)}'),
  );

  it('exact Document uses selectDocumentModalDestination and reuses the existing state/predicate; T1: never gated on document-editor (§30.5)', () => {
    expect(branch).toContain('selectDocumentModalDestination(padlet, canUseFreeformEditButton)');
    // PATCH-149B2-ii: routed through the shared guard -- requestOpenDocument
    // receives the complete post (24), not just the destination.
    expect(branch).toContain('return d ? () => requestOpenDocument(padlet, d) : undefined;');
    expect(branch).not.toMatch(/d\s*===\s*['"]document-(editor|viewer)['"]/);
  });
});

describe('23: CanvasClient supplies one Document-open callback, reused everywhere', () => {
  const body = canvasClientSrc.slice(
    canvasClientSrc.indexOf('const openDocumentFromPreview = (post: Padlet) => {'),
    canvasClientSrc.indexOf('const openPadletTargetFromContextMenu'),
  );

  it('reuses the B1b-ii destination helper and state; T1: capability-blind early return; T2: complete post retained', () => {
    expect(body).toContain('selectDocumentModalDestination(post, canUseFreeformEditButton)');
    // PATCH-149B2-ii: routed through the shared guard (requestOpenDocument
    // receives the complete post, same T2 invariant as before).
    expect(body).toContain('requestOpenDocument(post, destination)');
    expect(body).toContain('if (!destination) return;');
    expect(body).not.toMatch(/destination\s*!==?\s*['"]document-editor['"]/);
  });

  it('the same callback instance is passed to all five interactive layout owners', () => {
    expect((canvasClientSrc.match(/onOpenDocument=\{openDocumentFromPreview\}/g) || []).length).toBe(5);
  });
});

describe('T3: CardPreview Document branch delegates to the shared component, no local duplicate (§29.14 NC9)', () => {
  it('renders DocumentCardContent, passes the Read handler, and contains no locally reimplemented button', () => {
    const branch = cardPreviewSrc.slice(cardPreviewSrc.indexOf('Note-style square-corner chrome'));
    expect(branch).toContain('<DocumentCardContent');
    expect(branch).toContain('onRead={onReadDocument}');
    expect(branch).not.toMatch(/<button[^>]*aria-label="Read document"/);
  });
});

describe('39/40: layout owners -- real forwarding into RowColumnContainerCard, not mere token presence (closes the B1b-iii false positive)', () => {
  it('each layout forwards onOpenDocument into its own RowColumnContainerCard JSX (all Wall/Drawing hops)', () => {
    for (const [f, arg] of [['components/canvas/WallCanvas.tsx', 'padlet'], ['components/canvas/layouts/ColumnsCanvasRow.tsx', 'post'], ['components/collabboard/row/RowLane.tsx', 'post'], ['components/map/PostPopup.tsx', 'post']] as const) {
      expect(read(f).slice(read(f).indexOf('<RowColumnContainerCard'), read(f).indexOf('/>', read(f).indexOf('<RowColumnContainerCard'))), f).toContain(`onOpenDocument={onOpenDocument ? () => onOpenDocument(${arg}) : undefined}`);
    }
    const wall = read('components/canvas/WallCanvas.tsx');
    expect(wall.slice(wall.indexOf('<SortablePadletCard'), wall.indexOf('/>', wall.indexOf('<SortablePadletCard')))).toContain('onOpenDocument={onOpenDocument}');
    const drawing = read('components/collabboard/canvas/layouts/DrawingLayout.tsx');
    for (const tag of ['<AutoHeightContainer', '<RowColumnContainerCard']) {
      expect(drawing.slice(drawing.indexOf(tag), drawing.indexOf('/>', drawing.indexOf(tag))), tag).toContain('onOpenDocument={onOpenDocument}');
    }
  });

  it('WallCanvas and SortablePadletCard both destructure onOpenDocument, not merely declare it in a comment', () => {
    const wallSrc = read('components/canvas/WallCanvas.tsx');
    const wallSig = wallSrc.slice(wallSrc.indexOf('const WallCanvas: React.FC<WallCanvasProps> = ({'), wallSrc.indexOf('}) => {', wallSrc.indexOf('const WallCanvas: React.FC<WallCanvasProps> = ({')));
    expect(wallSig).toMatch(/^\s*onOpenDocument,\s*$/m);
    const cardSig = wallSrc.slice(wallSrc.indexOf('const SortablePadletCard'), wallSrc.indexOf('}) => {', wallSrc.indexOf('const SortablePadletCard')));
    expect(cardSig).toMatch(/^\s*onOpenDocument,\s*$/m);
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
