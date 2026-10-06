import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// PATCH-291. Source-level guards that the build gate alone cannot see: the
// Drawing canvas's 4-button cluster must use literal colours (Excalidraw
// redefines the palette variables inside its container), the drawing post must
// opt into the toolbar library button, and the library section is "Diagrams".

const ROOT = process.cwd();

function read(file: string): string {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function clusterSource(): string {
  const source = read('components/collabboard/canvas/layouts/DrawingLayout.tsx');
  const start = source.indexOf('const topFloatingToolbar =');
  const end = source.indexOf(') : null;', start);
  const cluster = start === -1 || end === -1 ? '' : source.slice(start, end);
  // Guard against a false green: a mis-anchored slice is empty and would
  // trivially "pass" every .not.toContain below.
  if (!cluster.includes('title="Add Comment"')) {
    throw new Error('clusterSource did not locate the 4-button cluster');
  }
  return cluster;
}

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('PATCH-291: DrawingLayout 4-button cluster', () => {
  it('uses literal colours, never palette classes Excalidraw can redirect', () => {
    const cluster = clusterSource();
    expect(cluster).not.toContain('hover:bg-gray-100');
    expect(cluster).not.toContain('text-gray-700');
    expect(cluster).not.toContain('bg-blue-100');
    expect(cluster).not.toContain('text-blue-700');
  });

  it('has the idle and active literal colours on every button', () => {
    const cluster = clusterSource();
    expect(count(cluster, 'hover:bg-[#f1f0ff]')).toBe(4);
    expect(count(cluster, 'text-[#374151]')).toBe(4);
    expect(count(cluster, 'bg-[#dbeafe]')).toBe(3);
    expect(count(cluster, 'text-[#1d4ed8]')).toBe(3);
  });
});

describe('PATCH-291: drawing post wiring', () => {
  it('DrawingEditor opts the wrapper into the toolbar library button', () => {
    expect(read('components/collabboard/editors/DrawingEditor.tsx')).toContain('libraryButton="toolbar"');
  });
});

describe('PATCH-291: library section title', () => {
  it('en.json calls it "Diagrams"', () => {
    const locale = JSON.parse(
      read('components/collabboard/canvas/excalidraw_fork/packages/excalidraw/locales/en.json'),
    );
    expect(locale.labels.excalidrawLib).toBe('Diagrams');
  });
});
