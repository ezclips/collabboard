/**
 * PATCH-380. What a guest's upload actually IS, read from its own bytes.
 *
 * The declared `Content-Type` is a claim, not evidence: an SVG or an HTML
 * document served as `image/png` is the classic way to get script into storage.
 * This reads the magic bytes instead, and the route requires BOTH -- the sniffed
 * type AND the declared type -- to be in its allow-list.
 *
 * Pure and client-safe. No SVG, no HTML, no text of any kind: anything this does
 * not recognise returns null and is refused.
 */

export type SniffedUploadType = 'png' | 'jpeg' | 'gif' | 'webp' | 'pdf';

const startsWith = (bytes: Uint8Array, signature: readonly number[], at = 0): boolean => {
  if (bytes.length < at + signature.length) return false;
  for (let i = 0; i < signature.length; i += 1) {
    if (bytes[at + i] !== signature[i]) return false;
  }
  return true;
};

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const GIF = [0x47, 0x49, 0x46, 0x38];            // "GIF8"
const RIFF = [0x52, 0x49, 0x46, 0x46];            // "RIFF"
const WEBP = [0x57, 0x45, 0x42, 0x50];            // "WEBP", at offset 8
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d];       // "%PDF-"

/** The recognised type, or null -- which the route treats as a refusal. */
export function sniffUploadType(bytes: Uint8Array): SniffedUploadType | null {
  if (bytes.length === 0) return null;
  if (startsWith(bytes, PNG)) return 'png';
  if (startsWith(bytes, JPEG)) return 'jpeg';
  if (startsWith(bytes, GIF)) return 'gif';
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) return 'webp';
  if (startsWith(bytes, PDF)) return 'pdf';
  return null;
}

/** The declared types a sniffed type may legitimately arrive as. */
export const DECLARED_TYPES_FOR: Readonly<Record<SniffedUploadType, readonly string[]>> = {
  png: ['image/png'],
  jpeg: ['image/jpeg', 'image/jpg'],
  gif: ['image/gif'],
  webp: ['image/webp'],
  pdf: ['application/pdf'],
};

/** The file extension the stored object gets. */
export const EXTENSION_FOR: Readonly<Record<SniffedUploadType, string>> = {
  png: 'png',
  jpeg: 'jpg',
  gif: 'gif',
  webp: 'webp',
  pdf: 'pdf',
};
