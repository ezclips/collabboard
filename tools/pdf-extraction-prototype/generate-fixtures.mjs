import fs from 'node:fs';
import path from 'node:path';
import { jsPDF } from 'jspdf';

const DEFAULT_OUTPUT = path.resolve('tools/pdf-extraction-prototype/.artifacts/fixtures');

function optionValue(argv, name, fallback) {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
}

function writePdf(filePath, configure) {
  const document = new jsPDF({ unit: 'pt', format: 'letter' });
  document.setProperties({
    author: 'CollabBoard PDF extraction prototype',
    creator: 'CollabBoard synthetic fixture generator',
    title: path.basename(filePath, '.pdf'),
  });
  configure(document);
  fs.writeFileSync(filePath, Buffer.from(document.output('arraybuffer')));
}

function writeWrapped(document, text, x, y, width, lineHeight = 14) {
  const lines = document.splitTextToSize(text, width);
  document.text(lines, x, y, { lineHeightFactor: lineHeight / 12 });
  return y + lines.length * lineHeight;
}

function generateSimpleText(filePath) {
  writePdf(filePath, (document) => {
    document.setFont('helvetica', 'bold');
    document.setFontSize(20);
    document.text('Simple Text Fixture', 72, 80);
    document.setFont('helvetica', 'normal');
    document.setFontSize(11);
    let y = 125;
    y = writeWrapped(document, 'The first paragraph contains deterministic text for page-level extraction and heading characterization.', 72, y, 468, 16);
    y += 18;
    writeWrapped(document, 'The second paragraph remains on the first page so the fixture exercises paragraph order.', 72, y, 468, 16);

    document.addPage();
    document.setFont('helvetica', 'bold');
    document.setFontSize(16);
    document.text('Continuation', 72, 80);
    document.setFont('helvetica', 'normal');
    document.setFontSize(11);
    writeWrapped(document, 'This second page confirms that page numbers and page boundaries survive normalization.', 72, 125, 468, 16);
  });
}

function generateTwoColumn(filePath) {
  writePdf(filePath, (document) => {
    document.setFont('helvetica', 'bold');
    document.setFontSize(18);
    document.text('Two Column Fixture', 72, 80);
    document.setFont('helvetica', 'normal');
    document.setFontSize(10);

    const left = [
      'Left column paragraph one starts here.',
      'Left column paragraph two follows the first left paragraph.',
      'Left column paragraph three ends the left reading stream.',
    ];
    const right = [
      'Right column paragraph one starts beside the left column.',
      'Right column paragraph two follows in the right reading stream.',
      'Right column paragraph three ends the right reading stream.',
    ];
    let leftY = 125;
    let rightY = 125;
    left.forEach((paragraph) => {
      leftY = writeWrapped(document, paragraph, 72, leftY, 210, 14) + 20;
    });
    right.forEach((paragraph) => {
      rightY = writeWrapped(document, paragraph, 330, rightY, 210, 14) + 20;
    });
  });
}

function generateTable(filePath) {
  writePdf(filePath, (document) => {
    document.setFont('helvetica', 'bold');
    document.setFontSize(18);
    document.text('Table Fixture', 72, 70);
    document.setFont('helvetica', 'normal');
    document.setFontSize(11);
    document.text('Text above the table.', 72, 105);

    const x = 72;
    const y = 145;
    const columnWidths = [180, 150, 138];
    const rowHeight = 32;
    const rows = [
      ['Name', 'Category', 'Value'],
      ['Alpha', 'First', '42'],
      ['Beta', 'Second', '84'],
      ['Gamma', 'Third', '126'],
    ];
    rows.forEach((row, rowIndex) => {
      let cellX = x;
      row.forEach((cell, columnIndex) => {
        document.rect(cellX, y + rowIndex * rowHeight, columnWidths[columnIndex], rowHeight);
        document.text(cell, cellX + 8, y + rowIndex * rowHeight + 20);
        cellX += columnWidths[columnIndex];
      });
    });
    document.text('Text below the table.', 72, y + rows.length * rowHeight + 40);
  });
}

function generateMixedLayout(filePath) {
  writePdf(filePath, (document) => {
    document.setFont('helvetica', 'bold');
    document.setFontSize(18);
    document.text('Mixed Layout Fixture', 72, 70);
    document.setFont('helvetica', 'normal');
    document.setFontSize(11);
    writeWrapped(document, 'A paragraph appears before a short list and a figure placeholder.', 72, 105, 468, 16);
    document.text('Items', 90, 170);
    document.text('• First item', 108, 198);
    document.text('• Second item', 108, 222);
    document.setDrawColor(80, 80, 80);
    document.rect(300, 160, 220, 120);
    document.text('Figure placeholder', 342, 225);
    document.text('Figure 1: Deterministic placeholder caption.', 300, 305);
    writeWrapped(document, 'A paragraph appears after the list and figure.', 72, 350, 468, 16);
  });
}

const outputDir = path.resolve(optionValue(process.argv.slice(2), '--out', DEFAULT_OUTPUT));
fs.mkdirSync(outputDir, { recursive: true });

const fixtures = [
  { name: 'simple-text', expectedPageCount: 2, generate: generateSimpleText },
  { name: 'two-column', expectedPageCount: 1, generate: generateTwoColumn },
  { name: 'table', expectedPageCount: 1, generate: generateTable },
  { name: 'mixed-layout', expectedPageCount: 1, generate: generateMixedLayout },
];

fixtures.forEach(({ name, generate }) => generate(path.join(outputDir, `${name}.pdf`)));
fs.writeFileSync(
  path.join(outputDir, 'manifest.json'),
  `${JSON.stringify(fixtures.map(({ name, expectedPageCount }) => ({ name, expectedPageCount })), null, 2)}\n`,
);
console.log(`Generated ${fixtures.length} deterministic PDF fixtures in ${outputDir}`);
