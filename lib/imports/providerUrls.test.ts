import { describe, expect, it } from 'vitest';

import { isAllowedThumbnailUrl, shouldAttachGoogleToken } from './providerUrls';

/**
 * PATCH-213. The provider thumbnail allowlist, checked by HOST, not substring.
 * These are the cases the old `url.includes('googleapis.com')` check let through.
 */
describe('isAllowedThumbnailUrl', () => {
  const GOOGLE_OK = [
    'https://lh3.googleusercontent.com/x',
    'https://drive.google.com/file/d/abc/view',
    'https://www.googleapis.com/drive/v3/files/abc',
  ];

  const REFUSED_FOR_GOOGLE = [
    // The token-leak shape: the marker is in the query, not the host.
    'https://evil.example/?googleapis.com',
    // A lookalike SUFFIX host.
    'https://googleusercontent.com.evil.example/',
    // A non-https scheme.
    'http://lh3.googleusercontent.com/x',
    // A public third-party bucket under googleapis.com.
    'https://storage.googleapis.com/b/o',
    // A cloud metadata address.
    'https://169.254.169.254/',
    // A bare googleapis.com (no www) is not the API host.
    'https://googleapis.com/drive/v3/files/abc',
    // A lookalike prefix of a real host.
    'https://evilgoogleusercontent.com/x',
  ];

  it.each(GOOGLE_OK)('allows a Google host: %s', (url) => {
    expect(isAllowedThumbnailUrl('google-drive', url)).toBe(true);
  });

  it.each(REFUSED_FOR_GOOGLE)('refuses for Google: %s', (url) => {
    expect(isAllowedThumbnailUrl('google-drive', url)).toBe(false);
  });

  it('allows a true OneDrive subdomain, and refuses it for Google', () => {
    const url = 'https://contoso-my.sharepoint.com/x';
    expect(isAllowedThumbnailUrl('microsoft-onedrive', url)).toBe(true);
    expect(isAllowedThumbnailUrl('google-drive', url)).toBe(false);
    expect(isAllowedThumbnailUrl('microsoft-onedrive', 'https://foo.files.1drv.com/y')).toBe(true);
  });

  it.each([
    'https://graph.microsoft.com/v1.0/me/drive/items/x',
    'https://onedrive.live.com/x',
    'https://livefilestore.com/x',
  ])('allows a OneDrive host: %s', (url) => {
    expect(isAllowedThumbnailUrl('microsoft-onedrive', url)).toBe(true);
  });

  it('refuses a Google host for OneDrive, and a OneDrive host for Google', () => {
    expect(isAllowedThumbnailUrl('microsoft-onedrive', 'https://lh3.googleusercontent.com/x')).toBe(false);
    expect(isAllowedThumbnailUrl('google-drive', 'https://graph.microsoft.com/x')).toBe(false);
  });

  it('refuses anything that is not a parseable absolute URL', () => {
    expect(isAllowedThumbnailUrl('google-drive', 'not a url')).toBe(false);
    expect(isAllowedThumbnailUrl('google-drive', '')).toBe(false);
  });
});

describe('shouldAttachGoogleToken', () => {
  it('is true only for a Google allowlisted host', () => {
    expect(shouldAttachGoogleToken('https://lh3.googleusercontent.com/x')).toBe(true);
    expect(shouldAttachGoogleToken('https://www.googleapis.com/x')).toBe(true);
    expect(shouldAttachGoogleToken('https://drive.google.com/x')).toBe(true);
  });

  it.each([
    'https://evil.example/?googleapis.com',
    'https://storage.googleapis.com/b/o',
    'https://graph.microsoft.com/x',
    'https://contoso.sharepoint.com/x',
    'https://googleusercontent.com.evil.example/',
    'https://169.254.169.254/',
  ])('is false for a non-Google host: %s', (url) => {
    expect(shouldAttachGoogleToken(url)).toBe(false);
  });
});
