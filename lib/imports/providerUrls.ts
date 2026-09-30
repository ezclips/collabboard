// PATCH-213. The exact hosts a provider's thumbnail may live on.
//
// SECURITY. These lists exist because the previous checks were SUBSTRING tests
// (`url.includes('googleapis.com')`), which a crafted URL trivially defeats:
// `https://evil.example/?googleapis.com` passed, and the user's Google bearer
// token was attached to a request to a host the attacker chose. A URL is only a
// provider URL when its HOST is that provider's host -- exactly, or as a true
// subdomain (`host === h || host.endsWith('.' + h)`), never merely contained.
//
// `https:` only, too: the provider never serves thumbnails over plain http, and
// allowing it would let a redirect or a downgrade carry the token in the clear.

import type { ImportProvider } from './types';

const GOOGLE_THUMBNAIL_HOSTS = [
  'googleusercontent.com',
  'drive.google.com',
  // Exact host only: `www.googleapis.com` is the Drive API host. A bare
  // `googleapis.com` entry would also admit `storage.googleapis.com`, which
  // serves anyone's public bucket and must never receive the bearer token.
  'www.googleapis.com',
] as const;

const ONEDRIVE_THUMBNAIL_HOSTS = [
  '1drv.com',
  'livefilestore.com',
  'sharepoint.com',
  'onedrive.live.com',
  'graph.microsoft.com',
] as const;

function hostsFor(provider: ImportProvider): readonly string[] {
  return provider === 'google-drive' ? GOOGLE_THUMBNAIL_HOSTS : ONEDRIVE_THUMBNAIL_HOSTS;
}

/**
 * Is `url` a thumbnail URL we are willing to fetch for `provider`?
 *
 * True only for an `https:` URL whose host is one of the provider's own hosts,
 * exactly or as a true subdomain. Anything else -- a lookalike suffix, a
 * different scheme, an internal address -- is refused.
 */
export function isAllowedThumbnailUrl(provider: ImportProvider, url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  return hostsFor(provider).some((allowed) => host === allowed || host.endsWith('.' + allowed));
}

/**
 * May this URL receive the user's Google access token?
 *
 * Only a Google allowlisted host. Never anything else -- the token is the whole
 * reason the allowlist exists.
 */
export function shouldAttachGoogleToken(url: string): boolean {
  return isAllowedThumbnailUrl('google-drive', url);
}

/**
 * PATCH-216. The strict item-id shape for each provider, in ONE place so
 * `resolve-selection` and the new `download` route validate identically.
 */
export const ITEM_ID_PATTERNS: Record<ImportProvider, RegExp> = {
  'google-drive': /^[A-Za-z0-9_-]{10,200}$/,
  'microsoft-onedrive': /^[A-Za-z0-9!_.-]{1,200}$/,
};
