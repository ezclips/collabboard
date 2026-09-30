import { describe, expect, it } from 'vitest';

import {
  documentImportPlan,
  isDocumentImportable,
  isRefusedPlan,
  GOOGLE_DOC_MIME_TYPE,
} from './documentImport';
import { UPLOAD_LIMITS } from '@/lib/domain/storage/uploadLimits';

/**
 * PATCH-216. Which imported files can become a readable document, and how their
 * bytes are obtained. Google Docs are exported as PDF; everything else is
 * downloaded as it is.
 */

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('documentImportPlan', () => {
  it('a PDF downloads as itself', () => {
    const plan = documentImportPlan('google-drive', { name: 'report.pdf', mimeType: 'application/pdf' });
    expect(isRefusedPlan(plan)).toBe(false);
    if (isRefusedPlan(plan)) return;
    expect(plan).toEqual({
      kind: 'download',
      filename: 'report.pdf',
      contentType: 'application/pdf',
      maxBytes: UPLOAD_LIMITS.knowledgePdf,
    });
  });

  it('a .docx downloads as itself', () => {
    const plan = documentImportPlan('microsoft-onedrive', { name: 'letter.docx', mimeType: DOCX });
    expect(isRefusedPlan(plan)).toBe(false);
    if (isRefusedPlan(plan)) return;
    expect(plan).toEqual({
      kind: 'download',
      filename: 'letter.docx',
      contentType: DOCX,
      maxBytes: UPLOAD_LIMITS.knowledgeText,
    });
  });

  it('text/plain and text/markdown download as themselves', () => {
    for (const mimeType of ['text/plain', 'text/markdown']) {
      const plan = documentImportPlan('google-drive', { name: 'a.txt', mimeType });
      expect(isRefusedPlan(plan)).toBe(false);
      if (isRefusedPlan(plan)) continue;
      expect(plan.kind).toBe('download');
      expect(plan.maxBytes).toBe(UPLOAD_LIMITS.knowledgeText);
    }
  });

  it('a Google Doc is exported as PDF and takes a .pdf name', () => {
    const plan = documentImportPlan('google-drive', { name: 'My Doc', mimeType: GOOGLE_DOC_MIME_TYPE });
    expect(isRefusedPlan(plan)).toBe(false);
    if (isRefusedPlan(plan)) return;
    expect(plan).toEqual({
      kind: 'export-pdf',
      filename: 'My Doc.pdf',
      contentType: 'application/pdf',
      maxBytes: UPLOAD_LIMITS.knowledgePdf,
    });
  });

  it('a Google Sheet or an image is refused', () => {
    expect(isRefusedPlan(documentImportPlan('google-drive', {
      name: 'budget', mimeType: 'application/vnd.google-apps.spreadsheet',
    }))).toBe(true);
    expect(isRefusedPlan(documentImportPlan('google-drive', {
      name: 'photo.png', mimeType: 'image/png',
    }))).toBe(true);
  });
});

describe('isDocumentImportable agrees with documentImportPlan', () => {
  const cases = [
    { name: 'report.pdf', mimeType: 'application/pdf' },
    { name: 'letter.docx', mimeType: DOCX },
    { name: 'a.txt', mimeType: 'text/plain' },
    { name: 'a.md', mimeType: 'text/markdown' },
    { name: 'My Doc', mimeType: GOOGLE_DOC_MIME_TYPE },
    { name: 'budget', mimeType: 'application/vnd.google-apps.spreadsheet' },
    { name: 'photo.png', mimeType: 'image/png' },
    { name: 'clip.mp4', mimeType: 'video/mp4' },
  ];

  it.each(cases)('$mimeType', ({ name, mimeType }) => {
    const refused = isRefusedPlan(documentImportPlan('google-drive', { name, mimeType }));
    expect(isDocumentImportable(mimeType)).toBe(!refused);
  });
});
