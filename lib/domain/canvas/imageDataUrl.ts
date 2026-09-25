/**
 * PATCH-182 -- the ONE decoder for the image data URLs the editors produce.
 *
 * Drawing on or cropping an Image post used to save the finished picture as a
 * `data:` URL inside the post itself, so every board load downloaded every
 * edited picture in full, uncached, with the post list. Moving that picture to
 * Storage starts by turning the data URL back into bytes, and that conversion
 * has exactly one home so the write path and its tests cannot disagree.
 *
 * Deliberately narrow: only the three raster types the editors emit, only
 * base64, and only well-formed input. Anything else decodes to `null` -- the
 * caller then keeps the original data URL rather than guessing at bytes.
 *
 * Browser-safe and Node-safe: no `Buffer`, no DOM, no `atob`.
 */

/** The image types a decoded editor data URL may carry. */
export type DecodedImageMimeType = 'image/png' | 'image/jpeg' | 'image/webp';

export interface DecodedImageDataUrl {
  readonly mimeType: DecodedImageMimeType;
  readonly bytes: Uint8Array;
}

const DATA_URL_PREFIX = /^data:(image\/(?:png|jpeg|webp));base64,/;

const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Decode standard base64 (padded or not) without a platform decoder. Returns
 * `null` for any character outside the alphabet, an impossible length, or
 * excessive padding -- i.e. anything that is not unambiguously base64.
 */
function decodeBase64(value: string): Uint8Array | null {
  if (value.length === 0) return null;
  // A single trailing character can never carry a byte.
  if (value.length % 4 === 1) return null;

  let end = value.length;
  while (end > 0 && value[end - 1] === '=') end -= 1;
  const padding = value.length - end;
  if (padding > 2) return null;

  const data = value.slice(0, end);
  const bytes = new Uint8Array(Math.floor((data.length * 3) / 4));
  let byteIndex = 0;
  let buffer = 0;
  let bits = 0;
  for (let index = 0; index < data.length; index += 1) {
    const value6 = BASE64_ALPHABET.indexOf(data[index]);
    if (value6 < 0) return null;
    buffer = (buffer << 6) | value6;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[byteIndex] = (buffer >> bits) & 0xff;
      byteIndex += 1;
    }
  }
  return new Uint8Array(bytes.subarray(0, byteIndex));
}

/** Whether this is any `data:image/...` string, decodable or not. */
export function isImageDataUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('data:image/');
}

/**
 * A base64 data URL of an image the editors produce, decoded; `null` for
 * anything else -- another MIME type, not base64, empty or malformed.
 */
export function decodeImageDataUrl(value: unknown): DecodedImageDataUrl | null {
  if (typeof value !== 'string') return null;
  const match = DATA_URL_PREFIX.exec(value);
  if (match === null) return null;
  const bytes = decodeBase64(value.slice(match[0].length));
  if (bytes === null) return null;
  return { mimeType: match[1] as DecodedImageMimeType, bytes };
}
