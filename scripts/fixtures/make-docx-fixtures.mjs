/**
 * Generates the DOCX test fixtures.
 *
 * Run with `node scripts/fixtures/make-docx-fixtures.mjs`. The generated files
 * are COMMITTED -- tests read the committed bytes, not whatever this script
 * produces today, so a change in the `docx` writer cannot silently move the
 * expected text out from under the offsets.
 *
 * WHAT THESE FIXTURES ARE, STATED PLAINLY. `structured` and `image` are
 * written by the `docx` package; `revisions` and `breaks` are the same package
 * with hand-authored OOXML injected, because that writer does not author
 * revision marks or comments. NONE OF THEM IS A WORD-PRODUCED FILE. Word's own
 * output carries structures these do not, and the unit's acceptance requires
 * real Word documents with tables, lists, footnotes and tracked changes before
 * Stage 2 closes. These fixtures pin the CONTRACT; they do not stand in for
 * that evidence.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, FootnoteReferenceRun, ImageRun,
} = await import(pathToFileURL(require.resolve('docx')).href);
const JSZip = require('jszip');

const OUT = path.join(process.cwd(), 'lib/infra/knowledge/fixtures/docx');
fs.mkdirSync(OUT, { recursive: true });

const write = (name, buffer) => {
  fs.writeFileSync(path.join(OUT, name), buffer);
  console.log('wrote', name, buffer.length, 'bytes');
};

const cell = (text) => new TableCell({
  width: { size: 50, type: WidthType.PERCENTAGE },
  children: [new Paragraph({ children: [new TextRun(text)] })],
});

// --- structured.docx: headings, lists, a nested level, a table, a footnote --
const structured = new Document({
  footnotes: { 1: { children: [new Paragraph('Measured on a four-shaft table loom.')] } },
  numbering: {
    config: [{
      reference: 'steps',
      levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: 'start' }],
    }],
  },
  sections: [{
    children: [
      new Paragraph({ text: 'Loom setup notes', heading: HeadingLevel.HEADING_1 }),
      new Paragraph({ children: [new TextRun('The back beam is warped first.')] }),
      new Paragraph({ text: 'Warping', heading: HeadingLevel.HEADING_2 }),
      new Paragraph({
        children: [
          new TextRun('Thread the raddle at one inch per section.'),
          new FootnoteReferenceRun(1),
        ],
      }),
      // Word writers emit empty paragraphs constantly, and whether they
      // survive extraction changes every offset after them.
      new Paragraph({ children: [] }),
      new Paragraph({ text: 'Bullets', heading: HeadingLevel.HEADING_2 }),
      new Paragraph({ text: 'Raddle', bullet: { level: 0 } }),
      new Paragraph({ text: 'Lease sticks', bullet: { level: 0 } }),
      new Paragraph({ text: 'Two of them', bullet: { level: 1 } }),
      new Paragraph({ text: 'Numbered', heading: HeadingLevel.HEADING_2 }),
      new Paragraph({ text: 'Wind the warp', numbering: { reference: 'steps', level: 0 } }),
      new Paragraph({ text: 'Beam it on', numbering: { reference: 'steps', level: 0 } }),
      new Paragraph({ text: 'Sett table', heading: HeadingLevel.HEADING_2 }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({ children: [cell('Yarn'), cell('Sett')] }),
          new TableRow({ children: [cell('8/2 cotton'), cell('20 epi')] }),
        ],
      }),
      new Paragraph({ children: [new TextRun('After the table.')] }),
    ],
  }],
});
const structuredBuffer = await Packer.toBuffer(structured);
write('structured.docx', structuredBuffer);

/** Injects raw OOXML before the section properties of a generated package. */
async function inject(baseBuffer, bodyXml, extraFiles = {}) {
  const zip = await JSZip.loadAsync(baseBuffer);
  let doc = await zip.file('word/document.xml').async('string');
  const at = doc.lastIndexOf('<w:sectPr');
  doc = at > 0
    ? doc.slice(0, at) + bodyXml + doc.slice(at)
    : doc.replace('</w:body>', `${bodyXml}</w:body>`);
  zip.file('word/document.xml', doc);
  for (const [name, content] of Object.entries(extraFiles)) zip.file(name, content);
  return zip.generateAsync({ type: 'nodebuffer' });
}

// --- revisions.docx: a tracked insertion, a tracked deletion, a comment -----
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const revisionsBody =
  '<w:p><w:r><w:t xml:space="preserve">The sett is </w:t></w:r>'
  + '<w:ins w:id="101" w:author="Reviewer" w:date="2026-09-20T10:00:00Z">'
  + '<w:r><w:t xml:space="preserve">usually </w:t></w:r></w:ins>'
  + '<w:del w:id="102" w:author="Reviewer" w:date="2026-09-20T10:01:00Z">'
  + '<w:r><w:delText xml:space="preserve">never </w:delText></w:r></w:del>'
  + '<w:r><w:t>20 epi.</w:t></w:r></w:p>'
  + '<w:p><w:commentRangeStart w:id="1"/><w:r><w:t>Check this against the draft.</w:t></w:r>'
  + '<w:commentRangeEnd w:id="1"/><w:r><w:commentReference w:id="1"/></w:r></w:p>';
const commentsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + `<w:comments ${W}>`
  + '<w:comment w:id="1" w:author="Reviewer" w:date="2026-09-20T10:02:00Z" w:initials="R">'
  + '<w:p><w:r><w:t>The draft says 24 epi.</w:t></w:r></w:p></w:comment></w:comments>';
write('revisions.docx', await inject(structuredBuffer, revisionsBody, { 'word/comments.xml': commentsXml }));

// --- breaks.docx: separators and the character classes that must survive ----
const breaksBody =
  '<w:p><w:r><w:t>Line one</w:t><w:br/><w:t>Line two</w:t></w:r></w:p>'
  + '<w:p><w:r><w:t>Col A</w:t><w:tab/><w:t>Col B</w:t></w:r></w:p>'
  + '<w:p><w:r><w:t xml:space="preserve">Leading and trailing   </w:t></w:r></w:p>'
  + '<w:p><w:r><w:t>Smart “quotes” and an em—dash and NBSP here</w:t></w:r></w:p>'
  + '<w:p><w:r><w:t>Astral 🧵 thread</w:t></w:r></w:p>';
write('breaks.docx', await inject(structuredBuffer, breaksBody));

// --- image.docx: content that carries no text ------------------------------
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const imageDoc = new Document({
  sections: [{
    children: [
      new Paragraph({ children: [new TextRun('Before the image.')] }),
      new Paragraph({
        children: [new ImageRun({ type: 'png', data: png, transformation: { width: 40, height: 40 } })],
      }),
      new Paragraph({ children: [new TextRun('After the image.')] }),
    ],
  }],
});
write('image.docx', await Packer.toBuffer(imageDoc));

// --- imageonly.docx: nothing but content that carries no text --------------
const imageOnly = new Document({
  sections: [{
    children: [
      new Paragraph({
        children: [new ImageRun({ type: 'png', data: png, transformation: { width: 40, height: 40 } })],
      }),
    ],
  }],
});
write('imageonly.docx', await Packer.toBuffer(imageOnly));

// --- whitespace.docx: a document whose only text is whitespace -------------
// "Nothing at all" is trim(), not length === 0: a paragraph of spaces is as
// empty as no paragraph, and admitting it would create a chunk of whitespace
// that search can match and a citation can point at.
{
  const zip = await JSZip.loadAsync(structuredBuffer);
  let doc = await zip.file('word/document.xml').async('string');
  const bodyStart = doc.indexOf('<w:body>') + '<w:body>'.length;
  const sect = doc.lastIndexOf('<w:sectPr');
  doc = doc.slice(0, bodyStart)
    + '<w:p><w:r><w:t xml:space="preserve">   \t  </w:t></w:r></w:p>'
    + doc.slice(sect);
  zip.file('word/document.xml', doc);
  write('whitespace.docx', await zip.generateAsync({ type: 'nodebuffer' }));
}

// --- long.docx: enough text to chunk more than once -----------------------
// The offsets instrument's gap and overlap checks need at least two chunks,
// and a cost measurement taken on a two-paragraph document measures nothing.
const longDoc = new Document({
  sections: [{
    children: Array.from({ length: 400 }, (_, i) => new Paragraph({
      children: [new TextRun(
        `Paragraph ${i + 1}. Thread the raddle at one inch per section, then wind `
        + 'the warp under even tension and beam it on with the lease sticks in place.',
      )],
    })),
  }],
});
write('long.docx', await Packer.toBuffer(longDoc));

console.log('\nfixtures written to', OUT);

// --- zipbomb.docx: an archive that LIES about how far it expands ------------
// The pre-decompression check reads the size the central directory declares,
// and that is a number inside a file the uploader wrote. This one declares
// 4 KB for a part that inflates past the extraction worker's heap ceiling, so
// only an enforced limit during decompression can stop it.
//
// Generated with a larger heap than the default, because building the payload
// needs one: `node --max-old-space-size=6000 scripts/fixtures/make-docx-fixtures.mjs`.
{
  const unit = `<w:p><w:r><w:t>${'A'.repeat(900)}</w:t></w:r></w:p>`;
  const parts = [];
  for (let size = 0; size < 320 * 1024 * 1024; size += unit.length) parts.push(unit);
  const body = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
    + `${parts.join('')}</w:body></w:document>`;

  const zip = await JSZip.loadAsync(structuredBuffer);
  zip.file('word/document.xml', body);
  const packed = await zip.generateAsync({
    type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 },
  });

  // Rewrite the declared uncompressed size in the central directory.
  let lied = 0;
  for (let i = 0; i < packed.length - 46; i += 1) {
    if (packed.readUInt32LE(i) !== 0x02014b50) continue;
    const nameLength = packed.readUInt16LE(i + 28);
    if (packed.toString('utf8', i + 46, i + 46 + nameLength) !== 'word/document.xml') continue;
    packed.writeUInt32LE(4096, i + 24);
    lied += 1;
  }
  if (!lied) throw new Error('zipbomb: no central directory entry was rewritten');
  write('zipbomb.docx', packed);
}
