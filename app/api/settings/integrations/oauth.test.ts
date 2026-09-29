import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getProviders, missingRequiredScopes, REQUIRED_SCOPES } from './oauth';

/**
 * PATCH-214. Google's scope moves from `drive.readonly` (restricted, caps the
 * app at 100 test users) to `drive.file` (non-sensitive: only the files the
 * user picks). `include_granted_scopes` is removed so a reconnect cannot carry
 * the old read-only grant forward. Microsoft is unchanged.
 */

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  delete process.env.GOOGLE_DRIVE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_ID;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('Google Drive OAuth scope', () => {
  it('asks for drive.file and NOT drive.readonly', () => {
    const scope = getProviders()['google-drive'].scope;
    expect(scope).toContain('https://www.googleapis.com/auth/drive.file');
    expect(scope).not.toContain('drive.readonly');
  });

  it('does not carry the old grant forward (no include_granted_scopes)', () => {
    const params = getProviders()['google-drive'].extraAuthParams ?? {};
    expect(params.include_granted_scopes).toBeUndefined();
    expect('include_granted_scopes' in params).toBe(false);
  });

  it('keeps access_type offline and prompt consent', () => {
    const params = getProviders()['google-drive'].extraAuthParams ?? {};
    expect(params.access_type).toBe('offline');
    expect(params.prompt).toBe('consent');
  });

  it('leaves the Microsoft scope unchanged', () => {
    expect(getProviders()['microsoft-onedrive'].scope).toContain('Files.Read');
  });
});

describe('PATCH-214b missingRequiredScopes', () => {
  const DRIVE = 'https://www.googleapis.com/auth/drive.file';

  it('Google with drive.file granted -> nothing missing', () => {
    expect(missingRequiredScopes('google-drive', ['openid', 'email', 'profile', DRIVE])).toEqual([]);
  });

  it('Google with only openid/email/profile -> drive.file missing', () => {
    expect(
      missingRequiredScopes('google-drive', ['openid', 'email', 'profile']),
    ).toEqual([DRIVE]);
  });

  it('an EMPTY granted list means the provider did not say -> nothing missing', () => {
    expect(missingRequiredScopes('google-drive', [])).toEqual([]);
    expect(missingRequiredScopes('microsoft-onedrive', [])).toEqual([]);
  });

  it('Microsoft with the bare name, any case -> nothing missing', () => {
    expect(missingRequiredScopes('microsoft-onedrive', ['files.read'])).toEqual([]);
    expect(missingRequiredScopes('microsoft-onedrive', ['User.Read', 'FILES.READ'])).toEqual([]);
  });

  it('Microsoft with the prefixed name -> nothing missing', () => {
    expect(
      missingRequiredScopes('microsoft-onedrive', ['https://graph.microsoft.com/Files.Read']),
    ).toEqual([]);
  });

  it('Microsoft with only User.Read/openid -> Files.Read missing', () => {
    expect(missingRequiredScopes('microsoft-onedrive', ['User.Read', 'openid'])).toEqual(['Files.Read']);
  });

  it('REQUIRED_SCOPES lives next to each provider', () => {
    expect(REQUIRED_SCOPES['google-drive']).toEqual([DRIVE]);
    expect(REQUIRED_SCOPES['microsoft-onedrive']).toEqual(['Files.Read']);
  });
});
