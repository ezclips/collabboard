import dns from 'node:dns/promises';
import net from 'node:net';
import type { LookupAddress } from 'node:dns';

// PATCH-326. SSRF guard for a user-supplied calendar link.
//
// A calendar link can be any URL, so the server is asked to fetch it on the
// user's behalf -- exactly the shape an attacker uses to reach the metadata
// service or an internal host. This module answers one question -- "is this URL
// safe for the server to fetch?" -- and then fetches it with every redirect
// re-checked, a timeout, and a byte cap.
//
// WHY IT IS SEPARATE FROM assertPublicUrl's first caller. `app/api/link-preview`
// has its own inline blocklist; this one is the stricter superset the calendar
// import needs, kept reusable so a future caller does not copy a weaker list.

export type PublicUrlErrorReason =
  | 'invalid_url'
  | 'blocked_host'
  | 'dns_failed'
  | 'too_many_redirects'
  | 'too_large'
  | 'upstream_error'
  | 'network_error';

export class PublicUrlError extends Error {
  readonly reason: PublicUrlErrorReason;
  /** The upstream HTTP status, when the reason is `upstream_error`. */
  readonly status?: number;

  constructor(reason: PublicUrlErrorReason, message: string, status?: number) {
    super(message);
    this.name = 'PublicUrlError';
    this.reason = reason;
    this.status = status;
  }
}

/** The largest .ics body this server will read: 2 MB. */
export const MAX_ICS_BYTES = 2 * 1024 * 1024;

/** At most this many redirects are followed before refusing. */
export const MAX_ICS_REDIRECTS = 3;

const FETCH_TIMEOUT_MS = 10_000;

/**
 * Hosts named without being an IP. The IP-shaped names are still in the list
 * because a malformed URL can smuggle one past `net.isIP`; every address that
 * comes back from DNS is checked again with the address checks below.
 */
const BLOCKED_HOSTNAME_PATTERNS: readonly RegExp[] = [
  /^localhost$/,
  /\.localhost$/,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^::1$/,
  /^fc[0-9a-f]{2}:/i,
  /^fe80:/i,
  /^metadata\.google\.internal$/,
  /^100\.100\.100\.200$/,
];

/** 0.0.0.0/8, loopback, link-local, private, CGNAT, multicast and reserved. */
function isBlockedV4(address: string): boolean {
  const [a, b, c] = address.split('.').map((part) => Number(part));
  if (![a, b, c].every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) return true;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast (224/4) and reserved (240/4)
  return false;
}

function mappedV4FromHex(high: string, low: string): string {
  const hi = parseInt(high, 16);
  const lo = parseInt(low, 16);
  return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
}

function isBlockedV6(address: string): boolean {
  const value = address.toLowerCase();
  const dotted = value.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted) return isBlockedV4(dotted[1]);
  // A WHATWG URL normalizes an embedded IPv4 to hex (`::ffff:7f00:1`).
  const hex = value.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) return isBlockedV4(mappedV4FromHex(hex[1], hex[2]));
  const compatible = value.match(/^::(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (compatible) return isBlockedV4(compatible[1]);
  if (value === '::') return true; // unspecified
  if (value === '::1') return true; // loopback
  if (/^fe[89ab][0-9a-f]:/.test(value)) return true; // link-local fe80::/10
  if (/^f[cd][0-9a-f]{2}:/.test(value)) return true; // fc00::/7 unique-local
  if (/^ff[0-9a-f]{2}:/.test(value)) return true; // ff00::/8 multicast
  return false;
}

/** Is this literal address in a range the server must never reach? */
export function isBlockedAddress(address: string): boolean {
  const stripped = address.trim().replace(/^\[|\]$/g, '').split('%')[0];
  if (net.isIPv4(stripped)) return isBlockedV4(stripped);
  if (net.isIPv6(stripped)) return isBlockedV6(stripped);
  // Not an IP at all -- refuse rather than guess.
  return true;
}

/** `webcal://` is the same feed over TLS; everything else must be http(s). */
export function normalizeCalendarUrl(url: string): URL {
  const replaced = url.trim().replace(/^webcal:\/\//i, 'https://');
  const parsed = new URL(replaced);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new PublicUrlError('invalid_url', 'Only http and https links are supported.');
  }
  return parsed;
}

type LookupAll = (hostname: string) => Promise<Array<{ address: string; family: number }>>;

const defaultLookup: LookupAll = (hostname) => dns.lookup(hostname, { all: true }) as Promise<LookupAddress[]>;

/**
 * Refuses a URL the server must not fetch, and returns the normalized URL.
 *
 * Every literal address is checked directly; a hostname is DNS-resolved and
 * EVERY returned address is checked, which closes the rebinding gap where a
 * name resolves to a public address during validation and a private one during
 * the fetch.
 */
export async function assertPublicUrl(url: string, lookup: LookupAll = defaultLookup): Promise<URL> {
  let parsed: URL;
  try {
    parsed = normalizeCalendarUrl(url);
  } catch (error) {
    if (error instanceof PublicUrlError) throw error;
    throw new PublicUrlError('invalid_url', 'That is not a valid link.');
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (hostname.length === 0) throw new PublicUrlError('invalid_url', 'That is not a valid link.');

  if (net.isIP(hostname)) {
    if (isBlockedAddress(hostname)) {
      throw new PublicUrlError('blocked_host', 'The calendar link host is not allowed.');
    }
    return parsed;
  }

  if (BLOCKED_HOSTNAME_PATTERNS.some((pattern) => pattern.test(hostname))) {
    throw new PublicUrlError('blocked_host', 'The calendar link host is not allowed.');
  }

  let resolved: Array<{ address: string; family: number }>;
  try {
    resolved = await lookup(hostname);
  } catch {
    throw new PublicUrlError('dns_failed', 'The calendar link host could not be resolved.');
  }
  if (resolved.length === 0) {
    throw new PublicUrlError('dns_failed', 'The calendar link host could not be resolved.');
  }
  for (const { address } of resolved) {
    if (isBlockedAddress(address)) {
      throw new PublicUrlError('blocked_host', 'The calendar link host is not allowed.');
    }
  }

  return parsed;
}

function concatChunks(chunks: readonly Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** Reads a response body, refusing rather than buffering past `maxBytes`. */
async function readBounded(response: Response, maxBytes: number): Promise<string> {
  const body = response.body;
  if (!body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new PublicUrlError('too_large', 'That file is too large.');
    }
    return text;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch { /* already failing; the refusal stands. */ }
      throw new PublicUrlError('too_large', 'That file is too large.');
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(concatChunks(chunks, total));
}

export interface FetchPublicTextOptions {
  readonly maxBytes?: number;
  readonly accept?: string;
  readonly userAgent?: string;
  readonly maxRedirects?: number;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
  readonly lookup?: LookupAll;
}

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Fetches a text body from a public URL, safely, for any caller.
 *
 * Every hop -- the first URL and each redirect target -- is re-validated with
 * {@link assertPublicUrl}, so a public page that answers `302 Location:
 * http://169.254.169.254/…` cannot steer the server to an internal address.
 * Redirects are followed manually and capped. The body is read with a byte
 * counter and the whole request is bounded by one timeout.
 *
 * The URL is never included in an error message or logged. A non-2xx upstream
 * is reported as {@link PublicUrlError} with reason `upstream_error` and its
 * `status`, so a caller can tell "the site said 404" from "we refused".
 */
export async function fetchPublicText(
  url: string,
  options: FetchPublicTextOptions = {},
): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const lookup = options.lookup;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = options.maxRedirects ?? MAX_ICS_REDIRECTS;
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;
  const accept = options.accept ?? 'text/plain, */*';
  const userAgent = options.userAgent ?? 'Mozilla/5.0 (compatible; CollabBoardBot/1.0)';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let current = url;
    for (let redirects = 0; ; redirects += 1) {
      // Fetch the NORMALIZED URL, not the raw input: a webcal:// link is
      // validated as https but `fetch` rejects webcal, so the normalized form
      // is what must go on the wire (and what a redirect resolves against).
      const safe = await assertPublicUrl(current, lookup);
      const requestUrl = safe.toString();

      let response: Response;
      try {
        response = await fetchImpl(requestUrl, {
          redirect: 'manual',
          signal: controller.signal,
          headers: { 'User-Agent': userAgent, Accept: accept },
        });
      } catch (error) {
        if (error instanceof PublicUrlError) throw error;
        throw new PublicUrlError('network_error', 'The link could not be reached.');
      }

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          throw new PublicUrlError('upstream_error', `The link could not be read (HTTP ${response.status}).`, response.status);
        }
        if (redirects >= maxRedirects) {
          throw new PublicUrlError('too_many_redirects', 'The link redirected too many times.');
        }
        current = new URL(location, requestUrl).toString();
        continue;
      }

      if (!response.ok) {
        throw new PublicUrlError('upstream_error', `The link could not be read (HTTP ${response.status}).`, response.status);
      }

      return await readBounded(response, maxBytes);
    }
  } finally {
    clearTimeout(timer);
  }
}

export interface FetchIcsOptions {
  readonly fetchImpl?: typeof fetch;
  readonly lookup?: LookupAll;
  readonly maxBytes?: number;
  readonly maxRedirects?: number;
  readonly timeoutMs?: number;
}

/**
 * Fetches a calendar body safely -- the calendar-shaped wrapper around
 * {@link fetchPublicText}, with the same values it has always used.
 */
export async function fetchIcsText(url: string, options: FetchIcsOptions = {}): Promise<string> {
  return fetchPublicText(url, {
    maxBytes: options.maxBytes ?? MAX_ICS_BYTES,
    maxRedirects: options.maxRedirects ?? MAX_ICS_REDIRECTS,
    timeoutMs: options.timeoutMs ?? FETCH_TIMEOUT_MS,
    fetchImpl: options.fetchImpl,
    lookup: options.lookup,
    accept: 'text/calendar, text/plain, */*',
    userAgent: 'Mozilla/5.0 (compatible; CollabBoardCalendar/1.0)',
  });
}
