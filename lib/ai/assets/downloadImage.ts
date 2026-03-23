const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const MIN_SIZE_BYTES = 1000; // 1 KB minimum to reject tiny thumbnails/tracking pixels
const TIMEOUT_MS = 5000;

export type DownloadedImage = {
  buffer: Buffer;
  mimeType: string;
  contentLength: number;
};

export async function downloadImage(url: string): Promise<DownloadedImage> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching image`);
  }

  const rawContentType = response.headers.get('content-type') ?? '';
  const mimeType = rawContentType.split(';')[0].trim();

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error(`Unsupported mime type: ${mimeType}`);
  }

  const contentLengthHeader = response.headers.get('content-length');
  const declaredLength = contentLengthHeader ? parseInt(contentLengthHeader, 10) : null;

  if (declaredLength !== null && declaredLength > MAX_SIZE_BYTES) {
    throw new Error(`Image too large: ${declaredLength} bytes`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.byteLength > MAX_SIZE_BYTES) {
    throw new Error(`Image too large: ${buffer.byteLength} bytes`);
  }

  if (buffer.byteLength < MIN_SIZE_BYTES) {
    throw new Error(`Image too small (${buffer.byteLength} bytes) — likely a thumbnail or placeholder`);
  }

  return {
    buffer,
    mimeType,
    contentLength: buffer.byteLength,
  };
}
