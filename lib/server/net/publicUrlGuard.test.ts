import { describe, expect, it, vi } from 'vitest';
import {
  PublicUrlError,
  assertPublicUrl,
  fetchIcsText,
  fetchPublicText,
  isBlockedAddress,
  normalizeCalendarUrl,
} from './publicUrlGuard';

/** A resolver that always answers with one private address. */
const privateLookup = async () => [{ address: '10.0.0.5', family: 4 }];
const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];

const refusal = (promise: Promise<unknown>) =>
  promise.then(() => { throw new Error('expected a refusal'); }, (error: unknown) => error);

describe('PATCH-326 assertPublicUrl refuses private hosts', () => {
  it.each([
    'http://127.0.0.1/',
    'http://10.0.0.1/',
    'http://192.168.1.1/',
    'http://172.16.0.1/',
    'http://169.254.1.1/',
    'http://0.0.0.0/',
    'http://100.64.0.1/',
    'http://[::1]/',
    'http://[::ffff:127.0.0.1]/',
  ])('refuses %s', async (url) => {
    const error = await refusal(assertPublicUrl(url));
    expect(error).toBeInstanceOf(PublicUrlError);
    expect((error as PublicUrlError).reason).toBe('blocked_host');
  });

  it('names its blocklist directly', () => {
    expect(isBlockedAddress('127.0.0.1')).toBe(true);
    expect(isBlockedAddress('100.64.10.10')).toBe(true);
    expect(isBlockedAddress('::1')).toBe(true);
    expect(isBlockedAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isBlockedAddress('::')).toBe(true);
    expect(isBlockedAddress('ff02::1')).toBe(true);
    // Link-local is fe80::/10: fe80 through febf.
    expect(isBlockedAddress('fe80::1')).toBe(true);
    expect(isBlockedAddress('febf::1')).toBe(true);
    expect(isBlockedAddress('93.184.216.34')).toBe(false);
    expect(isBlockedAddress('2606:2800:220:1:248:1893:25c8:1946')).toBe(false);
  });

  it('refuses a hostname that RESOLVES to a private address', async () => {
    const error = await refusal(assertPublicUrl('http://example.com/cal.ics', privateLookup));
    expect((error as PublicUrlError).reason).toBe('blocked_host');
  });

  it('accepts a hostname that resolves publicly', async () => {
    const parsed = await assertPublicUrl('http://example.com/cal.ics', publicLookup);
    expect(parsed.hostname).toBe('example.com');
  });

  it('refuses a non-http scheme', async () => {
    const error = await refusal(assertPublicUrl('ftp://example.com/cal.ics', publicLookup));
    expect((error as PublicUrlError).reason).toBe('invalid_url');
  });

  it('turns webcal into https', () => {
    expect(normalizeCalendarUrl('webcal://example.com/cal.ics').protocol).toBe('https:');
    expect(normalizeCalendarUrl('https://example.com/cal.ics').protocol).toBe('https:');
  });
});

describe('PATCH-326 fetchIcsText follows redirects safely', () => {
  const publicLiteral = 'http://93.184.216.34/cal.ics';

  it('refuses a redirect to a private host, re-checking every hop', async () => {
    const fetchImpl = (async () => new Response(null, {
      status: 302,
      headers: { location: 'http://127.0.0.1/secret.ics' },
    })) as unknown as typeof fetch;
    const error = await refusal(fetchIcsText(publicLiteral, { fetchImpl }));
    expect((error as PublicUrlError).reason).toBe('blocked_host');
  });

  it('refuses more than three redirects', async () => {
    const fetchImpl = (async () => new Response(null, {
      status: 302,
      headers: { location: publicLiteral },
    })) as unknown as typeof fetch;
    const error = await refusal(fetchIcsText(publicLiteral, { fetchImpl }));
    expect((error as PublicUrlError).reason).toBe('too_many_redirects');
  });

  it('refuses a body over the byte cap', async () => {
    const fetchImpl = (async () => new Response(new Uint8Array(2 * 1024 * 1024 + 1), { status: 200 })) as unknown as typeof fetch;
    const error = await refusal(fetchIcsText(publicLiteral, { fetchImpl }));
    expect((error as PublicUrlError).reason).toBe('too_large');
  });

  it('reads a normal body', async () => {
    const fetchImpl = (async () => new Response('BEGIN:VCALENDAR', { status: 200 })) as unknown as typeof fetch;
    expect(await fetchIcsText(publicLiteral, { fetchImpl })).toBe('BEGIN:VCALENDAR');
  });

  it('fetches a webcal link as https, not the raw webcal URL', async () => {
    const fetchImpl = vi.fn(async () => new Response('BEGIN:VCALENDAR', { status: 200 })) as unknown as typeof fetch;
    await fetchIcsText('webcal://example.com/cal.ics', { fetchImpl, lookup: publicLookup });
    expect(fetchImpl).toHaveBeenCalledWith('https://example.com/cal.ics', expect.anything());
  });

  it('reports an upstream failure with its status and no URL', async () => {
    const fetchImpl = (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;
    const error = await refusal(fetchIcsText(publicLiteral, { fetchImpl }));
    expect((error as PublicUrlError).reason).toBe('upstream_error');
    expect((error as PublicUrlError).status).toBe(500);
    expect((error as PublicUrlError).message).not.toContain('93.184.216.34');
  });

  it('PATCH-333 Addendum 1 asks intermediaries for a fresh copy', async () => {
    const fetchImpl = vi.fn(async () => new Response('BEGIN:VCALENDAR', { status: 200 })) as unknown as typeof fetch;
    await fetchIcsText(publicLiteral, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith(publicLiteral, expect.objectContaining({
      cache: 'no-store',
      headers: expect.objectContaining({ 'Cache-Control': 'no-cache' }),
    }));
  });
});

describe('PATCH-327 fetchPublicText is the general form', () => {
  const publicLiteral = 'http://93.184.216.34/page';

  it('passes the accept and user-agent it was given', async () => {
    const fetchImpl = vi.fn(async () => new Response('ok', { status: 200 })) as unknown as typeof fetch;
    await fetchPublicText(publicLiteral, {
      fetchImpl,
      accept: 'text/html,*/*',
      userAgent: 'Mozilla/5.0 (compatible; LinkPreviewBot/1.0)',
    });
    expect(fetchImpl).toHaveBeenCalledWith(publicLiteral, expect.objectContaining({
      headers: expect.objectContaining({
        'User-Agent': 'Mozilla/5.0 (compatible; LinkPreviewBot/1.0)',
        Accept: 'text/html,*/*',
      }),
    }));
  });

  it('refuses a redirect to a private host without fetching it', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: 'http://169.254.169.254/latest/meta-data/' },
    })) as unknown as typeof fetch;
    const error = await refusal(fetchPublicText(publicLiteral, { fetchImpl }));
    expect((error as PublicUrlError).reason).toBe('blocked_host');
    // Only the FIRST, public hop was ever fetched.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('caps the body at the given size', async () => {
    const fetchImpl = (async () => new Response(new Uint8Array(200), { status: 200 })) as unknown as typeof fetch;
    const error = await refusal(fetchPublicText(publicLiteral, { fetchImpl, maxBytes: 100 }));
    expect((error as PublicUrlError).reason).toBe('too_large');
  });
});
