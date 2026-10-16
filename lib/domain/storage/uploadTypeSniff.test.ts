import { describe, expect, it } from 'vitest';

import { DECLARED_TYPES_FOR, EXTENSION_FOR, sniffUploadType } from './uploadTypeSniff';

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string, pad = 0) => {
  const out = new Uint8Array(text.length + pad);
  for (let i = 0; i < text.length; i += 1) out[i] = text.charCodeAt(i);
  return out;
};

describe('PATCH-380 sniffUploadType', () => {
  it('recognises the five allowed types from their magic bytes', () => {
    expect(sniffUploadType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00))).toBe('png');
    expect(sniffUploadType(bytes(0xff, 0xd8, 0xff, 0xe0, 0x00))).toBe('jpeg');
    expect(sniffUploadType(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61))).toBe('gif');
    expect(sniffUploadType(ascii('RIFF????WEBPVP8 ', 0))).toBe('webp');
    expect(sniffUploadType(ascii('%PDF-1.7'))).toBe('pdf');
  });

  it('REFUSES an SVG however it is dressed', () => {
    // The three shapes an SVG arrives in. None is an image to this function.
    expect(sniffUploadType(ascii('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffUploadType(ascii('<?xml version="1.0"?><svg/>'))).toBeNull();
    expect(sniffUploadType(ascii('\uFEFF<svg/>'))).toBeNull();
    // ...including one with a PNG-looking preamble glued on.
    expect(sniffUploadType(ascii('<svg/>', 0))).toBeNull();
  });

  it('REFUSES HTML', () => {
    expect(sniffUploadType(ascii('<!DOCTYPE html><html></html>'))).toBeNull();
    expect(sniffUploadType(ascii('<html><script>alert(1)</script></html>'))).toBeNull();
    expect(sniffUploadType(ascii('<script>alert(1)</script>'))).toBeNull();
  });

  it('refuses anything unrecognised, including empty input', () => {
    expect(sniffUploadType(bytes())).toBeNull();
    expect(sniffUploadType(ascii('hello world'))).toBeNull();
    expect(sniffUploadType(bytes(0x50, 0x4b, 0x03, 0x04))).toBeNull(); // zip
  });

  it('does not accept a RIFF that is not a WEBP', () => {
    // A WAV, for instance: same first four bytes, different form at offset 8.
    expect(sniffUploadType(ascii('RIFF????WAVEfmt '))).toBeNull();
  });

  it('needs the whole signature, not a prefix of it', () => {
    expect(sniffUploadType(bytes(0x89, 0x50, 0x4e))).toBeNull();
    expect(sniffUploadType(ascii('%PDF'))).toBeNull();
  });

  it('maps each type to the declared types it may arrive as, and its extension', () => {
    expect(DECLARED_TYPES_FOR.png).toEqual(['image/png']);
    expect(DECLARED_TYPES_FOR.jpeg).toContain('image/jpeg');
    expect(DECLARED_TYPES_FOR.pdf).toEqual(['application/pdf']);
    for (const type of ['png', 'jpeg', 'gif', 'webp', 'pdf'] as const) {
      expect(EXTENSION_FOR[type].length, type).toBeGreaterThan(0);
    }
  });
});
