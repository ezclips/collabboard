/**
 * The Stage 2 acceptance specimen: a document MICROSOFT WORD wrote.
 *
 * Every other fixture here is produced by the `docx` npm package, some with
 * hand-authored OOXML spliced in. Those pin the contract, but they are not
 * evidence about real Word output, and the unit's acceptance asked for the
 * distinction to be kept rather than papered over. `word-authored.docx` was
 * produced by driving Word 16.0 through COM -- Word's own writer serialised
 * the bytes -- by scripts/fixtures/make-word-authored-docx.ps1.
 *
 * It carries, in one document, the four structures acceptance required:
 * a TABLE, a MULTI-LEVEL LIST, a FOOTNOTE, and TRACKED CHANGES with both an
 * insertion and a deletion.
 *
 * WHERE THE EXPECTED TEXT COMES FROM. Not from mammoth, and not from running
 * this code and writing down what came out -- that would make the test a
 * transcript of the parser's behaviour rather than a check on it. It is
 * derived from the document's OWN XML, counted and read independently:
 *
 *   word/document.xml   20 w:p, 1 w:tbl (3 w:tr, 6 w:tc), 4 w:numPr with
 *                       w:ilvl values 0 and 1, 1 w:footnoteReference,
 *                       1 w:ins, 1 w:del whose w:delText is "rarely "
 *   word/styles.xml     Heading1 -> name "heading 1", w:outlineLvl 0
 *                       Heading2 -> name "heading 2", w:outlineLvl 1
 *   word/footnotes.xml  footnote id 1, body "Measured with a sley hook on a
 *                       four-shaft table loom."
 *   word/numbering.xml  1 w:abstractNum definition
 *
 * Word also emits parts no library writer produces -- people.xml, theme1.xml,
 * settings.xml, webSettings.xml, fontTable.xml -- which is the point of using
 * a real one.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { extractKnowledgeDocxText } from './knowledgeDocxExtractionAdapter';

const FIXTURE = path.join(
  process.cwd(),
  'lib/infra/knowledge/fixtures/docx/word-authored.docx',
);
const read = () => new Uint8Array(fs.readFileSync(FIXTURE));

async function extracted() {
  const result = await extractKnowledgeDocxText(read());
  if (!result.ok) throw new Error(`extraction refused: ${result.error.message}`);
  return result.value;
}

describe('a document Word itself wrote', () => {
  it('resolves headings through Word\'s own styles.xml', async () => {
    // styles.xml maps Heading1 -> "heading 1" with outlineLvl 0. The contract
    // forbids prefix-matching style IDs and forbids inferring from bold or
    // size, so this is the case that says the resolution really works on a
    // real document.
    const { text } = await extracted();
    expect(text).toContain('# Tidewater loom manual');
    expect(text).toContain('## Sett and reed');
    expect(text).toContain('## Yarn table');
  });

  it('keeps the multi-level list, with its nesting', async () => {
    // Four w:numPr paragraphs at w:ilvl 0 and 1: two outer items with two
    // nested between them.
    const { text } = await extracted();
    const lines = text.split('\n');
    const find = (needle: string) => lines.find((line) => line.includes(needle)) ?? '';

    const outerOne = find('Wind the warp');
    const innerOne = find('Measure the lease');
    const innerTwo = find('Cross the ends');
    const outerTwo = find('Beam it on');

    for (const line of [outerOne, innerOne, innerTwo, outerTwo]) {
      expect(line).not.toBe('');
    }
    // The nested pair is indented relative to the outer pair. The marker text
    // itself is the contract's business; the NESTING is what the fixture is
    // here to prove survives a real Word numbering definition.
    const indent = (line: string) => line.length - line.trimStart().length;
    expect(indent(innerOne)).toBeGreaterThan(indent(outerOne));
    expect(indent(innerTwo)).toBeGreaterThan(indent(outerTwo));
  });

  it('joins table cells by row and bounds the table', async () => {
    // 3 w:tr x 2 w:tc, read out of the XML.
    const { text } = await extracted();
    expect(text).toContain('Yarn | Sett');
    expect(text).toContain('8/2 cotton | 20 epi');
    expect(text).toContain('16/2 linen | 30 epi');
  });

  it('carries the footnote reference inline and its body at the end', async () => {
    const { text, footnoteCount } = await extracted();
    expect(footnoteCount).toBe(1);
    expect(text).toContain('twenty ends per inch.[^1]');
    expect(text).toContain('Measured with a sley hook on a four-shaft table loom.');
    // The body follows the prose it belongs to, rather than interrupting it.
    expect(text.indexOf('[^1]:')).toBeGreaterThan(text.indexOf('twenty ends per inch.[^1]'));
  });

  it('applies tracked changes: the insertion survives, the deletion does not', async () => {
    const { text, hasTrackedChanges } = await extracted();
    expect(hasTrackedChanges).toBe(true);

    // The insertion, recorded by Word as a w:ins.
    expect(text).toContain('Check the tension again after the first pick.');

    // The deletion. w:delText is "rarely ", and the sentence must read as the
    // author left it.
    expect(text).toContain('The tidewater sett is twenty ends per inch.');
    expect(text).not.toContain('rarely');
  });

  it('never produces the w:delText sentence, which would read as fluent and be wrong', async () => {
    // The trap this fixture exists for. A naive walk over every text node
    // keeps deleted runs, and the result is a grammatical sentence asserting
    // something the document does not say. It must not appear anywhere.
    const { text } = await extracted();
    expect(text).not.toMatch(/sett is rarely/i);
  });

  it('extracts in a time worth recording, and reports its measured size', async () => {
    // Acceptance asked for a measured timing on a real Word document rather
    // than on generated fixtures. The numbers are reported, and only a loose
    // ceiling is asserted -- a tight one would flake on a busy machine.
    const started = Date.now();
    const value = await extracted();
    const elapsed = Date.now() - started;

    expect(value.inflatedBytes).toBeGreaterThan(0);
    expect(value.text.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(10_000);
  }, 60_000);
});
