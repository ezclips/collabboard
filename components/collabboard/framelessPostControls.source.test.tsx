import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PATCH-242. "Hide frame" hides the whole top strip, and with it every control
 * (Edit, Regen, Convert, Export and the pencil). New drawings start frameless,
 * so those posts had no controls at all. This is a SOURCE characterization in
 * the repo's established style for FreeformPadletCards.tsx (a 6k-line canvas
 * component that cannot be mounted without the full freeform context): it binds
 * the floating bar and its permission gate to the surface that renders them.
 */
function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const cardsSrc = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
const cardsCode = code(cardsSrc);

describe('PATCH-242 a frameless post shows its controls on hover', () => {
  it('the floating bar is gated on fullView, edit rights and the same modes as the strip', () => {
    expect(cardsCode).toContain(
      'const showFramelessControls = isFullView && canUseFreeformEditButton && !(isLineMode || isGraphConnectMode);',
    );
    expect(cardsCode).toContain('showFramelessControls ? (');
    expect(cardsCode).toContain('data-frameless-actions="true"');
  });

  it('renders the AI action cluster by REUSE, not a copy: the same component in the strip and the bar', () => {
    const barStart = cardsCode.indexOf('data-frameless-actions="true"');
    expect(barStart).toBeGreaterThan(-1);
    const barBlock = cardsCode.slice(barStart, barStart + 2500);
    expect(barBlock).toContain('<AIPostStripActions');
    expect(barBlock).toContain("padlet.type === 'ai-component'");
    // Edit, Regen and Export come from the shared cluster; the bar also carries
    // the same post pencil as the strip.
    expect(barBlock).toContain('openFreeformPadletModal(padlet)');
    const usages = cardsCode.match(/<AIPostStripActions/g)?.length ?? 0;
    expect(usages, 'the cluster is rendered by both the strip and the bar').toBeGreaterThanOrEqual(2);
  });

  it('a viewer never sees the bar (canUseFreeformEditButton is in the gate)', () => {
    const gate = cardsCode.slice(cardsCode.indexOf('const showFramelessControls'), cardsCode.indexOf('data-frameless-actions="true"'));
    expect(gate).toContain('canUseFreeformEditButton');
  });

  it('a framed post renders no floating bar (isFullView is required)', () => {
    const gate = cardsCode.slice(cardsCode.indexOf('const showFramelessControls'), cardsCode.indexOf('data-frameless-actions="true"'));
    expect(gate).toContain('isFullView');
  });

  it('a position-locked frameless AI post still shows the bar (lock only fixes position)', () => {
    const gate = cardsCode.slice(cardsCode.indexOf('const showFramelessControls'), cardsCode.indexOf('data-frameless-actions="true"'));
    expect(gate).not.toContain('isLocked');
  });

  it('the strip itself is untouched: it still returns null under isFullView', () => {
    expect(cardsSrc).toContain('if (isFullView) return null;');
  });
});
