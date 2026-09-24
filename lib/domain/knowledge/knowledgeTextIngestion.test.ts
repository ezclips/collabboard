import { describe, expect, it } from 'vitest';

import {
  KNOWLEDGE_TEXT_ACCEPT,
  isKnowledgeTextCandidate,
  validateKnowledgeTextSource,
} from './knowledgeTextIngestion';
import { tooLargeMessage, UPLOAD_LIMITS } from '../storage/uploadLimits';

const utf8 = (text: string) => new TextEncoder().encode(text);
const candidate = (filename: string, mimeType: string, text: string | Uint8Array) => ({
  filename,
  mimeType,
  bytes: typeof text === 'string' ? utf8(text) : text,
});

const accepted = (input: Parameters<typeof validateKnowledgeTextSource>[0]) => {
  const result = validateKnowledgeTextSource(input);
  if (!result.ok) throw new Error(`expected acceptance, refused: ${result.error.message}`);
  return result.value;
};

const refusal = (input: Parameters<typeof validateKnowledgeTextSource>[0]) => {
  const result = validateKnowledgeTextSource(input);
  if (result.ok) throw new Error('expected a refusal');
  return result.error;
};

describe('what reaches the text path at all', () => {
  it.each([
    ['notes.txt', ''],
    ['notes.md', ''],
    ['README.markdown', ''],
    ['NOTES.TXT', ''],
    ['anything', 'text/plain'],
    ['anything', 'text/markdown'],
  ])('%s / %s is a text candidate', (filename, mimeType) => {
    expect(isKnowledgeTextCandidate({ filename, mimeType })).toBe(true);
  });

  it.each([
    ['slides.pdf', 'application/pdf'],
    ['photo.png', 'image/png'],
    ['archive.zip', 'application/zip'],
  ])('%s is not', (filename, mimeType) => {
    expect(isKnowledgeTextCandidate({ filename, mimeType })).toBe(false);
  });

  it('the file picker offers exactly those types', () => {
    for (const token of ['.txt', '.md', '.markdown', 'text/plain', 'text/markdown']) {
      expect(KNOWLEDGE_TEXT_ACCEPT).toContain(token);
    }
    expect(KNOWLEDGE_TEXT_ACCEPT).not.toContain('application/pdf');
  });
});

describe('the decode IS the validation', () => {
  it('accepts a plain text file and returns its canonical text', () => {
    const value = accepted(candidate('notes.txt', 'text/plain', 'Alpha.\r\n\r\nBeta.'));
    expect(value.canonicalText).toBe('Alpha.\n\nBeta.');
    expect(value.originalFilename).toBe('notes.txt');
    expect(value.fileSizeBytes).toBeGreaterThan(0);
    expect(value.chunks.length).toBeGreaterThan(0);
  });

  it('chunks are lossless against the canonical text it returns', () => {
    const value = accepted(candidate('notes.md', 'text/markdown', '# Title\r\n\r\nBody text here.'));
    expect(value.chunks.map((c) => c.text).join('')).toBe(value.canonicalText);
  });

  it('REFUSES a file whose extension lies about its contents', () => {
    // A .txt full of binary. The extension said text; the bytes decide.
    const value = refusal(candidate('notes.txt', 'text/plain', new Uint8Array([0xff, 0xd8, 0xff, 0xe0])));
    expect(value.message).toMatch(/not valid UTF-8/);
  });

  it('refuses NUL bytes with the reason, not a driver error', () => {
    const value = refusal(candidate('notes.txt', 'text/plain', 'a\u0000b'));
    expect(value.message).toMatch(/binary file/);
  });

  it('refuses a file type that is not text at all', () => {
    expect(refusal(candidate('slides.pdf', 'application/pdf', 'x')).message)
      .toMatch(/cannot be added to Knowledge/);
  });

  it('refuses an empty upload and a blank filename', () => {
    expect(refusal(candidate('notes.txt', 'text/plain', new Uint8Array())).message).toMatch(/empty/);
    expect(refusal(candidate('   ', 'text/plain', 'body')).message).toMatch(/filename is required/);
  });
});

describe('PATCH-180: the text-source size limit', () => {
  it('refuses a source over the limit with a validation error and the message', () => {
    const over = new Uint8Array(UPLOAD_LIMITS.knowledgeText + 1).fill(0x61);
    const error = refusal(candidate('huge.txt', 'text/plain', over));
    expect(error.code).toBe('validation');
    expect(error.message).toBe(
      tooLargeMessage(UPLOAD_LIMITS.knowledgeText + 1, UPLOAD_LIMITS.knowledgeText, 'documents'),
    );
  });

  it('accepts a source of exactly the limit', () => {
    const exact = new Uint8Array(UPLOAD_LIMITS.knowledgeText).fill(0x61);
    const value = accepted(candidate('exact.txt', 'text/plain', exact));
    expect(value.fileSizeBytes).toBe(UPLOAD_LIMITS.knowledgeText);
  });
});

describe('a blank source is accepted and indexes nothing', () => {
  it.each([
    ['whitespace only', '   \n\n  '],
    ['CRLF only', '\r\n\r\n'],
    ['a lone BOM', '﻿'],
  ])('%s produces no chunks rather than a refusal', (_label, text) => {
    // The acceptance's own wording: "refuse or index nothing, never invent".
    // Indexing nothing is the more honest of the two for a legitimately blank
    // file -- the upload succeeded, and the corpus gained nothing.
    const value = accepted(candidate('empty.txt', 'text/plain', text));
    expect(value.chunks).toEqual([]);
  });
});

describe('unusual but valid text is not a refusal', () => {
  it.each([
    ['zero-width characters', '​​​'],
    ['control characters', 'a\u0007b\u001bc'],
    ['right-to-left text', '‮abc‬'],
    ['emoji only', '\u{1F600}\u{1F680}\u{1F468}‍\u{1F4BB}'],
    ['decomposed umlauts', 'Stosstänge'],
    ['one enormous line', 'x'.repeat(30_000)],
  ])('%s is accepted', (_label, text) => {
    const value = accepted(candidate('odd.txt', 'text/plain', text));
    expect(value.canonicalText).toBe(text);
  });
});
