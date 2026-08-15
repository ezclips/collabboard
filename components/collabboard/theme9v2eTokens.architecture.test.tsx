// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const GLOBALS_CSS_PATH = path.resolve(__dirname, '../../app/globals.css');
const SIDEBAR_PATH = path.resolve(__dirname, './canvas/ui/CanvasSidebar.tsx');
const CAMERA_PATH = path.resolve(__dirname, './canvas/hooks/useCanvasCamera.ts');
const GEOMETRY_PATH = path.resolve(__dirname, './canvas/engine/freeformStageGeometry.ts');
const INTERACTIONS_PATH = path.resolve(__dirname, './canvas/hooks/useCanvasInteractions.ts');
const GRAPH_LAYER_PATH = path.resolve(__dirname, '../graph/FreeformGraphLayer.tsx');
const LINE_RENDERER_PATH = path.resolve(__dirname, './SimpleLineRenderer.tsx');

function readGlobalsCss(): string {
  return fs.readFileSync(GLOBALS_CSS_PATH, 'utf8');
}

function readSidebar(): string {
  return fs.readFileSync(SIDEBAR_PATH, 'utf8').replace(/\r\n/g, '\n');
}

/** Extracts the body of a top-level `selector { ... }` block by brace counting. */
function extractBlock(css: string, selectorPattern: RegExp): string {
  const match = selectorPattern.exec(css);
  if (!match) return '';
  let i = match.index + match[0].length;
  let depth = 1;
  const start = i;
  while (i < css.length && depth > 0) {
    if (css[i] === '{') depth++;
    if (css[i] === '}') depth--;
    i++;
  }
  return css.slice(start, i - 1);
}

const SAFE_TOKENS = [
  'popover',
  'popover-foreground',
  'card',
  'card-foreground',
  'accent',
  'accent-foreground',
  'muted',
  'muted-foreground',
  'border',
  'input',
  'ring',
];

const AMBIGUOUS_TOKENS = [
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'destructive',
  'destructive-foreground',
];

describe('PATCH 9V.2E: safe semantic token registrations exist', () => {
  const css = readGlobalsCss();
  const rootBlock = extractBlock(css, /:root\s*\{/);
  const themeBlock = extractBlock(css, /@theme inline\s*\{/);
  const darkMedia = extractBlock(css, /@media \(prefers-color-scheme: dark\)\s*\{/);
  const darkRootBlock = extractBlock(darkMedia, /:root\s*\{/);

  it.each(SAFE_TOKENS)('defines --%s in :root (light)', (token) => {
    expect(rootBlock).toMatch(new RegExp(`--${token}\\s*:`));
  });

  it.each(SAFE_TOKENS)('registers --color-%s in @theme inline', (token) => {
    expect(themeBlock).toMatch(new RegExp(`--color-${token}\\s*:\\s*var\\(--${token}\\)`));
  });

  it.each(SAFE_TOKENS)('defines --%s in the dark media query', (token) => {
    expect(darkRootBlock).toMatch(new RegExp(`--${token}\\s*:`));
  });

  it('popover surface aliases the app background/foreground pair', () => {
    expect(rootBlock).toMatch(/--popover\s*:\s*var\(--background\)/);
    expect(rootBlock).toMatch(/--popover-foreground\s*:\s*var\(--foreground\)/);
  });

  it('card surface aliases the app background/foreground pair', () => {
    expect(rootBlock).toMatch(/--card\s*:\s*var\(--background\)/);
    expect(rootBlock).toMatch(/--card-foreground\s*:\s*var\(--foreground\)/);
  });

  it('accent uses the established gray-100 hover convention, not a brand color', () => {
    expect(rootBlock).toMatch(/--accent\s*:\s*#f3f4f6/);
    expect(rootBlock).toMatch(/--accent-foreground\s*:\s*var\(--foreground\)/);
  });

  it('muted uses the established gray-100\\/gray-500 convention', () => {
    expect(rootBlock).toMatch(/--muted\s*:\s*#f3f4f6/);
    expect(rootBlock).toMatch(/--muted-foreground\s*:\s*#6b7280/);
  });

  it('border/input use the established gray-200 convention', () => {
    expect(rootBlock).toMatch(/--border\s*:\s*#e5e7eb/);
    expect(rootBlock).toMatch(/--input\s*:\s*#e5e7eb/);
  });

  it('ring uses the established blue-500 focus convention', () => {
    expect(rootBlock).toMatch(/--ring\s*:\s*#3b82f6/);
  });

  it.each(SAFE_TOKENS)('--%s is a pure color value, never a width/style shorthand', (token) => {
    const m = new RegExp(`--${token}\\s*:\\s*([^;]+);`).exec(rootBlock);
    expect(m).not.toBeNull();
    const value = (m as RegExpExecArray)[1].trim();
    expect(value).toMatch(/^(#[0-9a-fA-F]{3,8}|var\(--[a-z-]+\))$/);
  });
});

describe('PATCH 9V.2E: ambiguous brand tokens are NOT opportunistically introduced', () => {
  const css = readGlobalsCss();

  it.each(AMBIGUOUS_TOKENS)('does not define --%s anywhere in globals.css', (token) => {
    expect(css).not.toMatch(new RegExp(`--${token}\\s*:`));
    expect(css).not.toMatch(new RegExp(`--color-${token}\\s*:`));
  });
});

describe('PATCH 9V.2E: CanvasSidebar 9V.2C explicit styling is frozen', () => {
  const src = readSidebar();

  it('keeps the explicit opaque background override', () => {
    expect(src).toMatch(/bg-background/);
  });

  it('keeps the explicit gray-200 border override', () => {
    expect(src).toMatch(/border-gray-200/);
  });

  it('keeps the explicit gray-900 foreground override', () => {
    expect(src).toMatch(/text-gray-900/);
  });

  it('was NOT refactored to rely on bg-popover instead', () => {
    expect(src).not.toMatch(/className="[^"]*\bbg-popover\b/);
  });

  it('was NOT refactored to rely on border-border instead', () => {
    expect(src).not.toMatch(/className="[^"]*\bborder-border\b/);
  });

  it('still imports the 9V.2C responsive placement contract', () => {
    expect(src).toMatch(/computeToolbarMenuSideOffset/);
    expect(src).toMatch(/TOOLBAR_MENU_COLLISION_PADDING_PX/);
  });
});

describe('PATCH 9V.2E: camera/world/graph/line files are untouched', () => {
  it.each([
    ['useCanvasCamera.ts', CAMERA_PATH],
    ['freeformStageGeometry.ts', GEOMETRY_PATH],
    ['useCanvasInteractions.ts', INTERACTIONS_PATH],
    ['FreeformGraphLayer.tsx', GRAPH_LAYER_PATH],
    ['SimpleLineRenderer.tsx', LINE_RENDERER_PATH],
  ])('%s does not reference any 9V.2E token or globals.css', (_name, filePath) => {
    const src = fs.readFileSync(filePath, 'utf8');
    expect(src).not.toMatch(/--color-popover|--color-accent|--color-muted|--color-card|globals\.css/);
  });
});
