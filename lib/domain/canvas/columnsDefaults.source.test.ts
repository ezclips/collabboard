import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// PATCH-297 defect 2. New Columns boards were seeded with the create page's
// test fixtures ("Attachment", "Body", "Testing" and the "xcfasdcacasca" /
// "sdsdsdsd" items) because handleSaveCanvas writes the `columns` state as the
// real board_sections. Source-level so the default state and the visible
// preview cannot silently drift apart again.
const source = fs.readFileSync(
  path.join(process.cwd(), 'components/collabboard/canvas/CanvasSetupPage.tsx'),
  'utf8',
);

const columnsState = source.slice(
  source.indexOf('const [columns, setColumns] = useState<ColumnData[]>'),
  source.indexOf('// Get current user on mount'),
);

const columnsPreview = source.slice(
  source.indexOf('const ColumnsPreview: React.FC'),
  source.indexOf('const TablePreview: React.FC'),
);

describe('CanvasSetupPage default columns (PATCH-297 defect 2)', () => {
  it('names the three default sections Column 1/2/3', () => {
    expect(columnsState).toContain("title: 'Column 1'");
    expect(columnsState).toContain("title: 'Column 2'");
    expect(columnsState).toContain("title: 'Column 3'");
  });

  it('uses readable sample items instead of the test fixtures', () => {
    for (const title of ["'First idea'", "'Second idea'", "'Third idea'"]) {
      expect(columnsState).toContain(`title: ${title}`);
    }
    expect(columnsState).not.toContain('xcfasdcacasca');
    expect(columnsState).not.toContain('sdsdsdsd');
  });

  it('no longer ships the test column names as any string literal', () => {
    expect(source).not.toContain("'Attachment'");
    expect(source).not.toContain("'Body'");
    expect(source).not.toContain("'Testing'");
  });

  it('renames the visible preview columns to match the defaults', () => {
    expect(columnsPreview).toContain('>Column 1<');
    expect(columnsPreview).toContain('>Column 2<');
    expect(columnsPreview).toContain('>Column 3<');
    expect(columnsPreview).toContain('>First idea<');
    expect(columnsPreview).toContain('>Second idea<');
    expect(columnsPreview).toContain('>Third idea<');
    expect(columnsPreview).not.toContain('>Attachment<');
    expect(columnsPreview).not.toContain('>Body<');
    expect(columnsPreview).not.toContain('>Testing<');
  });

  it('writes the default column titles as the saved board_sections', () => {
    const saveBlock = source.slice(
      source.indexOf('const sectionsToInsert = columns.map'),
      source.indexOf('.insert(sectionsToInsert)'),
    );
    expect(saveBlock).toContain('title: column.title');
  });
});
