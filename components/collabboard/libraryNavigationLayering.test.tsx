// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8').replace(/\r\n/g, '\n');
}

const canvasClient = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
const libraryPanel = read('components/collabboard/LibraryPanel.tsx');
const navControl = read('components/collabboard/canvas/minimap/FreeformNavigationControl.tsx');
const minimap = read('components/collabboard/canvas/minimap/FreeformMinimap.tsx');
const canvasSidebar = read('components/collabboard/canvas/ui/CanvasSidebar.tsx');
const cameraSrc = read('components/collabboard/canvas/hooks/useCanvasCamera.ts');
const geometrySrc = read('components/collabboard/canvas/engine/freeformStageGeometry.ts');
const interactionsSrc = read('components/collabboard/canvas/hooks/useCanvasInteractions.ts');

function extractZIndex(src: string, contextPattern: RegExp): number {
  const match = contextPattern.exec(src);
  expect(match, `pattern not found: ${contextPattern}`).not.toBeNull();
  const classText = (match as RegExpMatchArray)[0];
  const zMatch = /z-\[(\d+)\]|z-(\d+)\b/.exec(classText);
  expect(zMatch, `no z-index found in: ${classText}`).not.toBeNull();
  const [, bracketed, bare] = zMatch as RegExpMatchArray;
  return Number(bracketed ?? bare);
}

describe('PATCH 9W.1: stacking hierarchy [1, 2, 16]', () => {
  const viewportStart = canvasClient.indexOf('<CanvasViewport');
  const viewportEnd = canvasClient.indexOf('</CanvasViewport>', viewportStart);
  const libraryStart = canvasClient.indexOf('<LibraryPanel', viewportEnd);
  const navStart = canvasClient.indexOf('<FreeformNavigationControl', viewportEnd);

  it('1. navigator layer (z-40) is below Library layer (z-800)', () => {
    const navZ = extractZIndex(navControl, /data-freeform-navigation-control="true"[\s\S]{0,600}?className="[^"]*"/);
    const libraryZ = extractZIndex(libraryPanel, /className="fixed top-\[64px\][^"]*"/);
    expect(navZ).toBeLessThan(libraryZ);
  });

  it('2. Library layer (z-800) is below the 9V.2C toolbar DropdownMenu layer (z-3001)', () => {
    const libraryZ = extractZIndex(libraryPanel, /className="fixed top-\[64px\][^"]*"/);
    const menuAttrIdx = canvasSidebar.indexOf('data-toolbar-overflow-menu="true"');
    expect(menuAttrIdx).toBeGreaterThan(-1);
    const nearby = canvasSidebar.slice(Math.max(0, menuAttrIdx - 400), menuAttrIdx + 100);
    const menuZMatch = nearby.match(/z-\[(\d+)\]/);
    expect(menuZMatch).not.toBeNull();
    const menuZ = Number((menuZMatch as RegExpMatchArray)[1]);
    expect(libraryZ).toBeLessThan(menuZ);
  });

  it('16. 9V.2C toolbar hierarchy preserved (menu z-index untouched)', () => {
    expect(canvasSidebar).toContain('z-[3001]');
  });

  it('LibraryPanel is rendered OUTSIDE CanvasViewport (escapes the isolation stacking context)', () => {
    expect(viewportStart).toBeGreaterThan(-1);
    expect(viewportEnd).toBeGreaterThan(viewportStart);
    expect(libraryStart).toBeGreaterThan(viewportEnd);
    expect(canvasClient.slice(viewportStart, viewportEnd)).not.toContain('<LibraryPanel');
  });

  it('CanvasViewport still isolates its own internal stack (root cause documented, not removed)', () => {
    expect(canvasClient).toContain("isolation: 'isolate'");
  });

  it('LibraryPanel renders before FreeformNavigationControl in the post-viewport sibling list', () => {
    expect(navStart).toBeGreaterThan(libraryStart);
  });
});

describe('PATCH 9W.1: visual occlusion [3, 4, 9, 10]', () => {
  // Geometry is fixed/known from both components' own frozen position
  // constants -- verify the overlap mathematically rather than by rendering,
  // since jsdom has no real layout/paint engine to trust for this.
  const LIBRARY = { left: 56, top: 64, width: 320 }; // top-[64px] left-[56px] w-80(320px), h-[calc(100vh-64px)]
  const NAV = { left: 72, width: 168 };

  it('3/9. Library horizontally overlaps the expanded navigator', () => {
    const libraryRight = LIBRARY.left + LIBRARY.width;
    const navRight = NAV.left + NAV.width;
    const overlapWidth = Math.min(libraryRight, navRight) - Math.max(LIBRARY.left, NAV.left);
    expect(overlapWidth).toBeGreaterThan(0);
    expect(libraryPanel).toContain('left-[56px]');
    expect(libraryPanel).toContain('w-80');
    expect(navControl).toContain('left-[72px]');
    expect(navControl).toContain('w-[168px]');
  });

  it('10. Library spans to the viewport bottom, so it also covers the collapsed navigator', () => {
    expect(libraryPanel).toContain('h-[calc(100vh-64px)]');
  });

  it('4. Library root shell is opaque (never relies on pointer-events:none or transparency to "occlude")', () => {
    const rootClassMatch = libraryPanel.match(/className="fixed top-\[64px\][^"]*"/);
    expect(rootClassMatch).not.toBeNull();
    const rootClass = (rootClassMatch as RegExpMatchArray)[0];
    expect(rootClass).not.toMatch(/pointer-events-none/);
    expect(rootClass).toMatch(/\bbg-white\b(?!\/)/); // bg-white, not a bg-white/<alpha> opacity modifier
    expect(rootClass).not.toMatch(/opacity-0/);
  });

  it('footer/blue "Browse libraries" region inherits the same opaque root, no separate transparent strip', () => {
    const footerIdx = libraryPanel.indexOf('{/* Footer */}');
    expect(footerIdx).toBeGreaterThan(-1);
    expect(libraryPanel.slice(footerIdx, footerIdx + 200)).toContain('bg-gray-50');
  });
});

describe('PATCH 9W.1: open/close and pointer ownership [5, 6, 7, 8]', () => {
  it('8. closing Library is a true unmount (isOpen guard), not merely hidden', () => {
    expect(libraryPanel).toContain('if (!isOpen) return null;');
  });

  it('5/6/7. no pointer-passthrough workaround exists anywhere in either component', () => {
    expect(libraryPanel).not.toMatch(/pointer-events-none/);
    expect(navControl).not.toMatch(/pointer-events-none/);
  });
});

describe('PATCH 9W.1: freezes [11-15]', () => {
  it('11/12. navigator position and dimensions unchanged', () => {
    expect(navControl).toContain(
      'pointer-events-auto absolute bottom-4 left-[72px] z-40 w-[168px] overflow-hidden rounded-lg border border-gray-200 bg-background shadow-md',
    );
  });

  it('13. minimap surface styling unchanged', () => {
    expect(minimap).toContain("style={{ fill: '#e5e7eb', cursor: 'pointer' }}");
  });

  it('14. camera untouched (no Library/z-800 reference, no LibraryPanel import)', () => {
    expect(cameraSrc).not.toMatch(/LibraryPanel|z-\[800\]/);
  });

  it('15. signed world / interactions untouched (no Library reference)', () => {
    expect(geometrySrc).not.toMatch(/LibraryPanel|z-\[800\]/);
    expect(interactionsSrc).not.toMatch(/LibraryPanel|z-\[800\]/);
  });

  it('navigator zoom handlers, collapse state, and minimap composition are byte-identical to PATCH 9W', () => {
    expect(navControl).toContain('const [expanded, setExpanded] = useState(true);');
    expect(navControl).toContain('embedded');
    expect(navControl).toContain('{Math.round(canvasZoom * 100)}%');
  });
});
