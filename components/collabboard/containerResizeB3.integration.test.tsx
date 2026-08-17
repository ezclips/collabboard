// @vitest-environment jsdom
// PATCH POST-RESIZE-B3.1 -- Freeform Container width-resize contract.
// These source/architecture assertions complement the pointer primitive tests;
// browser acceptance remains responsible for real geometry and hit-testing.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getPostResizeCapability } from '@/lib/domain/canvas/postResizePolicy';

function read(relPath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8').replace(/\r\n/g, '\n');
}

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const cardsSrc = code(read('components/collabboard/canvas/ui/FreeformPadletCards.tsx'));
const drawingSrc = code(read('components/collabboard/canvas/layouts/DrawingLayout.tsx'));
const rowColumnSrc = code(read('components/collabboard/RowColumnContainerCard.tsx'));
const policySrc = code(read('lib/domain/canvas/postResizePolicy.ts'));

describe('PATCH POST-RESIZE-B3.1 Freeform Container width ownership', () => {
  it('A/B/C: Container remains outside generic B2 policy and has one selected-only dedicated mount', () => {
    expect(getPostResizeCapability({ type: 'container' })).toBe('none');
    expect(cardsSrc).toContain("padlet.type === 'container' && isPadletSelected(padlet.id)");
    expect(cardsSrc).toContain('title="Resize Container"');
    expect(cardsSrc).not.toContain('getPostResizeCapability({ type: \'container\' })');
    expect(policySrc).not.toContain("case 'container':");
  });

  it('D/E: Drawing and Container-child renderers remain free of shared resize handles', () => {
    expect(drawingSrc).not.toContain('PostResizeHandle');
    expect(rowColumnSrc).not.toContain('PostResizeHandle');
    expect(cardsSrc).toContain('rootPadlets.filter(padlet => !isSectionHeading(padlet))');
  });

  it('F/G: the dedicated interaction is horizontal-only with a 360px vertical minimum', () => {
    expect(cardsSrc).toContain('mode="horizontal-only"');
    expect(cardsSrc).toContain('containerMinWidth = Math.max(');
    expect(cardsSrc).toContain('containerOrientation === \'horizontal\' ? containerRequiredWidth : 0');
    expect(cardsSrc).toContain('Math.max(Number(padlet.width) || 0, 360)');
  });

  it('H/O/P: the manual minimum and auto-grow use the same required-width callback and grow-only owner', () => {
    expect(cardsSrc).toContain('setContainerRequiredWidths');
    expect(cardsSrc).toContain('onRequiredWidthChange={(requiredWidth) => {');
    expect(cardsSrc).toContain('growContainerWidth(padlet.id, requiredWidth);');
    expect(cardsSrc).toContain('nextWidth <= currentWidth + 1');
  });

  it('I/J/K/L/R: preview is local, release uses the existing single commit path, and no marker/height is supplied', () => {
    expect(cardsSrc).toContain('onResizePreview={(w) => previewPostResizeWidth(padlet.id, w)}');
    expect(cardsSrc).toContain('void commitPostResize(padlet.id, w, h, ow, oh, null, undefined, mode);');
    expect(cardsSrc).not.toContain('title="Resize Container" metadata.manualSize');
    expect(cardsSrc).not.toMatch(/title="Resize Container"[\s\S]{0,500}metadata\.manualSize/);
  });

  it('M/N: the gesture origin is the rendered semantic Container shell, including legacy 350→360 flooring', () => {
    expect(cardsSrc).toContain('const el = genericCardRefs.current[padlet.id];');
    expect(cardsSrc).toContain('return { width: el.offsetWidth || 360, height: el.offsetHeight || 150 };');
    expect(cardsSrc).toContain("width: padlet.type === 'container'");
    expect(cardsSrc).toContain('`${Math.max(Number(padlet.width) || 0, 360)}px`');
  });

  it('Q/U/V/W: membership, orientation, Section Heading, and Excalidraw boundaries are untouched', () => {
    expect(cardsSrc).not.toContain('attachPostToContainer');
    const containerHandle = cardsSrc.slice(
      cardsSrc.indexOf("padlet.type === 'container' && isPadletSelected"),
      cardsSrc.indexOf(") : padlet.type === 'ai-component'"),
    );
    expect(containerHandle).not.toContain('childPadletIds');
    expect(cardsSrc).toContain('resolveContainerOrientation(padlet.metadata)');
    expect(cardsSrc).toContain('SectionHeadingPost');
    expect(drawingSrc).not.toContain('Resize Container');
  });
});
