import { describe, expect, it } from 'vitest';
import { decodeImageDataUrl, isImageDataUrl } from './imageDataUrl';

/**
 * PATCH-182 -- the one decoder the save path trusts to turn an editor data URL
 * back into bytes. It is deliberately total and narrow: only the three raster
 * types the editors emit, only base64, and `null` for everything else so the
 * caller can keep the original data URL rather than guess.
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const SAMPLE_BYTES = new Uint8Array([...PNG_SIGNATURE, 1, 2, 3, 4, 250, 255, 0]);

/** A tiny encoder, so the round-trip is against known bytes and no platform. */
function encodeBase64(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triple = (a << 16) | (b << 8) | c;
    out += alphabet[(triple >> 18) & 0x3f];
    out += alphabet[(triple >> 12) & 0x3f];
    out += i + 1 < bytes.length ? alphabet[(triple >> 6) & 0x3f] : '=';
    out += i + 2 < bytes.length ? alphabet[triple & 0x3f] : '=';
  }
  return out;
}

const dataUrl = (mime: string, bytes: Uint8Array) =>
  `data:${mime};base64,${encodeBase64(bytes)}`;

describe('decodeImageDataUrl', () => {
  it('decodes png, jpeg and webp', () => {
    for (const mime of ['image/png', 'image/jpeg', 'image/webp'] as const) {
      const decoded = decodeImageDataUrl(dataUrl(mime, SAMPLE_BYTES));
      expect(decoded, mime).not.toBeNull();
      expect(decoded!.mimeType).toBe(mime);
    }
  });

  it('round-trips the bytes exactly', () => {
    const decoded = decodeImageDataUrl(dataUrl('image/png', SAMPLE_BYTES));
    expect(decoded!.bytes).toEqual(SAMPLE_BYTES);
    // Byte-for-byte, not just same length.
    for (let i = 0; i < SAMPLE_BYTES.length; i += 1) {
      expect(decoded!.bytes[i]).toBe(SAMPLE_BYTES[i]);
    }
  });

  it('handles an unpadded body too', () => {
    const padded = encodeBase64(SAMPLE_BYTES);
    const decoded = decodeImageDataUrl(`data:image/png;base64,${padded.replace(/=+$/, '')}`);
    expect(decoded!.bytes).toEqual(SAMPLE_BYTES);
  });

  it('refuses an svg or any non-raster MIME type', () => {
    for (const mime of ['image/svg+xml', 'text/plain', 'image/gif', 'image/avif', 'application/octet-stream']) {
      expect(decodeImageDataUrl(dataUrl(mime, SAMPLE_BYTES)), mime).toBeNull();
    }
  });

  it('refuses a non-base64 payload', () => {
    for (const payload of ['not base64!!', 'hello world', '====', 'a b c', '!!', 'AB CD']) {
      expect(decodeImageDataUrl(`data:image/png;base64,${payload}`), payload).toBeNull();
    }
  });

  it('refuses an empty payload', () => {
    expect(decodeImageDataUrl('data:image/png;base64,')).toBeNull();
  });

  it('refuses malformed and non-string input', () => {
    for (const bad of [
      null, undefined, 42, {}, [], true,
      '', 'data:', 'data:image/png,', 'data:image/png;base64',
      'data:image/png;base64;x,AAAA', 'http://example.test/a.png',
      'data:image/png;base64,AAAA=', 'data:image/png;base64,A',
    ]) {
      expect(decodeImageDataUrl(bad), String(bad)).toBeNull();
    }
  });
});

describe('isImageDataUrl', () => {
  it('accepts any data:image/ string, even one the decoder refuses', () => {
    expect(isImageDataUrl('data:image/png;base64,AAAA')).toBe(true);
    expect(isImageDataUrl('data:image/svg+xml;base64,AAAA')).toBe(true);
  });

  it('rejects non-image data URLs and non-strings', () => {
    for (const bad of ['data:text/plain;base64,AAAA', 'https://example.test/a.png', null, 7, undefined]) {
      expect(isImageDataUrl(bad), String(bad)).toBe(false);
    }
  });
});
