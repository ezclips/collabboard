import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PATCH-169 -- the board card shows a table cell's text size.
 *
 * SOURCE-LEVEL, deliberately: `FreeformPadletCards.tsx` is not mounted in this
 * repo's test suite -- the sibling `freeformTableSelection.characterization.test.tsx`
 * states it, and standing up its providers to render one card would exercise the
 * harness rather than the mapping. The mapping is a pure conditional over
 * `style.size`, so its presence in the table branch is what is pinned here; the
 * live board remains the acceptance test.
 */

const source = fs.readFileSync(
  path.join(process.cwd(), 'components/collabboard/canvas/ui/FreeformPadletCards.tsx'),
  'utf8',
).replace(/\r\n/g, '\n');

/** The table CARD branch -- the one that reads `cellStyles`, not the size one. */
function tableCardBranch(): string {
  const start = source.indexOf("{padlet.type === 'table' && (() => {");
  const end = source.indexOf("{padlet.type === 'container' && (", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('PATCH-169 -- the canvas table card renders cell text sizes', () => {
  it('the table card branch knows the `size` field', () => {
    expect(tableCardBranch()).toContain("size?: 'h1' | 'h2' | 'small'");
  });

  it('maps h1/h2/small to the relative sizes, with bold winning the weight', () => {
    const branch = tableCardBranch();
    expect(branch).toContain(
      "fontSize: style.size === 'h1' ? '1.3em' : style.size === 'h2' ? '1.15em' : style.size === 'small' ? '0.85em' : undefined",
    );
    expect(branch).toContain(
      "fontWeight: style.bold ? 'bold' : style.size === 'h1' ? 700 : style.size === 'h2' ? 600 : undefined",
    );
  });
});

describe('PATCH-170 -- the canvas table card shows column widths proportionally', () => {
  it('emits a colgroup with percentage widths, gated on the saved widths', () => {
    const branch = tableCardBranch();
    expect(branch).toContain('columnWidths');
    expect(branch).toContain('<colgroup>');
    expect(branch).toContain('width: `${(width / displayWidthTotal) * 100}%`');
    // Present only when widths were saved: the colgroup is behind `useWidths`,
    // and `table-layout: fixed` rides with it.
    expect(branch).toContain('{useWidths && (');
    expect(branch).toContain("style={useWidths ? { tableLayout: 'fixed' } : undefined}");
  });
});

describe('PATCH-173 -- the canvas table card marks AI-filled cells', () => {
  it('renders the sparkle only when the cell is `aiFilled`', () => {
    const branch = tableCardBranch();
    expect(branch).toContain('aiFilled?: true');
    // The marker is gated on the field and labelled for assistive tech.
    expect(branch).toContain('{style.aiFilled && (');
    expect(branch).toContain('aria-label="Filled by AI"');
  });
});
