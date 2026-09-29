import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getProviders } from './oauth';

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
