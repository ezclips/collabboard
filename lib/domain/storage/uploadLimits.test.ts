import { describe, expect, it } from 'vitest';

import {
  browserUploadKindLabel,
  browserUploadLimit,
  formatBytes,
  KNOWLEDGE_UPLOADS_PER_HOUR,
  MB,
  planLimitMessage,
  tooLargeMessage,
  UPLOAD_LIMITS,
} from './uploadLimits';

/**
 * THE NUMBERS THE OWNER DECIDED, in one place, so a change to a limit or to the
 * sentence a user reads is a change this test has to see.
 */

describe('UPLOAD_LIMITS', () => {
  it('are the owner-decided values', () => {
    expect(UPLOAD_LIMITS.knowledgePdf).toBe(50 * MB);
    expect(UPLOAD_LIMITS.knowledgeText).toBe(20 * MB);
    expect(UPLOAD_LIMITS.image).toBe(20 * MB);
    expect(UPLOAD_LIMITS.file).toBe(50 * MB);
    expect(UPLOAD_LIMITS.avatar).toBe(5 * MB);
    expect(KNOWLEDGE_UPLOADS_PER_HOUR).toBe(30);
  });
});

describe('formatBytes', () => {
  it('shows whole kilobytes below a megabyte', () => {
    expect(formatBytes(850 * 1024)).toBe('850 KB');
    expect(formatBytes(1024)).toBe('1 KB');
  });

  it('shows one decimal for megabytes', () => {
    expect(formatBytes(72.4 * MB)).toBe('72.4 MB');
    expect(formatBytes(50 * MB)).toBe('50.0 MB');
    expect(formatBytes(MB)).toBe('1.0 MB');
  });

  it('shows whole gigabytes without a trailing .0, and one decimal otherwise', () => {
    expect(formatBytes(1024 * MB)).toBe('1 GB');
    expect(formatBytes(1.5 * 1024 * MB)).toBe('1.5 GB');
    expect(formatBytes(2 * 1024 * MB)).toBe('2 GB');
  });

  it('keeps the MB unit just below a gigabyte', () => {
    expect(formatBytes(1023.9 * MB)).toBe('1023.9 MB');
  });

  it('is safe for zero and nonsense', () => {
    expect(formatBytes(0)).toBe('0 KB');
    expect(formatBytes(-1)).toBe('0 KB');
    expect(formatBytes(Number.NaN)).toBe('0 KB');
  });
});

describe('tooLargeMessage', () => {
  it('is the exact sentence the user reads', () => {
    expect(tooLargeMessage(72.4 * MB, 50 * MB, 'PDFs'))
      .toBe('This file is 72.4 MB. The limit for PDFs is 50.0 MB.');
  });
});

describe('planLimitMessage', () => {
  it('is the exact sentence the user reads', () => {
    expect(planLimitMessage(32 * MB, 20 * MB, 'Free'))
      .toBe('This file is 32.0 MB. The limit on the Free plan is 20.0 MB. Upgrade for larger files.');
  });
});

describe('browserUploadLimit', () => {
  it('gives an image its own limit in padlet-files', () => {
    expect(browserUploadLimit('padlet-files', 'image/png')).toBe(UPLOAD_LIMITS.image);
    expect(browserUploadLimit('padlet-files', 'image/jpeg')).toBe(UPLOAD_LIMITS.image);
  });

  it('gives anything else in padlet-files the file limit', () => {
    expect(browserUploadLimit('padlet-files', 'application/pdf')).toBe(UPLOAD_LIMITS.file);
    expect(browserUploadLimit('padlet-files', '')).toBe(UPLOAD_LIMITS.file);
  });

  it('gives avatars the avatar limit', () => {
    expect(browserUploadLimit('avatars', 'image/png')).toBe(UPLOAD_LIMITS.avatar);
  });

  it('sets NO limit for an unknown bucket', () => {
    expect(browserUploadLimit('some-other-bucket', 'image/png')).toBeNull();
  });
});

describe('browserUploadKindLabel', () => {
  it('names the bucket + type the way the refusal sentence does', () => {
    expect(browserUploadKindLabel('avatars', 'image/png')).toBe('profile pictures');
    expect(browserUploadKindLabel('padlet-files', 'image/png')).toBe('images');
    expect(browserUploadKindLabel('padlet-files', 'application/pdf')).toBe('files');
  });
});
