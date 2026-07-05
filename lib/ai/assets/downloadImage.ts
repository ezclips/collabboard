import dns from 'node:dns/promises';
import net from 'node:net';
import type { LookupAddress } from 'node:dns';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const MIN_SIZE_BYTES = 1000; // 1 KB minimum to reject tiny thumbnails/tracking pixels
const TIMEOUT_MS = 5000;

// SSRF guard: block private/loopback/link-local addresses and non-HTTPS schemes.
// Async so we can DNS-resolve hostnames and check the returned IPs — closes the
// DNS-rebinding gap that a hostname-only static check would leave open.
async function assertSafeImageUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Only HTTPS image URLs are allowed');
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\[|\]/g, ''); // strip IPv6 brackets

  // Block AWS/GCP/Azure instance metadata endpoints and well-known internal hostnames
  const blockedHostnames = [
    'localhost',
    'metadata.google.internal',
    '169.254.169.254',
    '100.100.100.200', // Alibaba Cloud metadata
  ];
  if (blockedHostnames.includes(hostname)) {
    throw new Error('URL host is not allowed');
  }

  // If the hostname is already a literal IP, check it directly
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new Error('URL resolves to a private or reserved address');
    }
    return;
  }

  // Resolve the hostname and check every returned address.
  // This closes the DNS-rebinding gap: a name like evil.internal.corp that
  // resolves to 10.0.0.1 would pass the static check above but fail here.
  let addresses: LookupAddress[];
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch {
    throw new Error('Could not resolve hostname');
  }

  for (const { address } of addresses) {
    if (isPrivateIp(address)) {
      throw new Error('URL resolves to a private or reserved address');
    }
  }
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    return (
      parts[0] === 127 || // loopback
      parts[0] === 10 || // RFC1918
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || // RFC1918
      (parts[0] === 192 && parts[1] === 168) || // RFC1918
      (parts[0] === 169 && parts[1] === 254) || // link-local / IMDS
      parts[0] === 0 // 0.0.0.0/8
    );
  }
  if (net.isIPv6(ip)) {
    const n = ip.toLowerCase();
    return (
      n === '::1' || // loopback
      n.startsWith('fc') || n.startsWith('fd') || // ULA
      n.startsWith('fe80') // link-local
    );
  }
  return false;
}

export type DownloadedImage = {
  buffer: Buffer;
  mimeType: string;
  contentLength: number;
};

export async function downloadImage(url: string): Promise<DownloadedImage> {
  await assertSafeImageUrl(url); // SSRF guard — async: DNS-resolves hostname and checks IPs

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
