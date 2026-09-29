import { describe, expect, it } from 'vitest';

import { googleAppIdFromClientId } from './googlePicker';

/**
 * PATCH-214. The Picker's `appId` is the Cloud project NUMBER, which is the
 * leading digits of the OAuth client id.
 */
describe('googleAppIdFromClientId', () => {
  it('extracts the project number from a real client id', () => {
    expect(googleAppIdFromClientId('123456789012-abc.apps.googleusercontent.com')).toBe('123456789012');
  });

  it('returns null for an empty or missing id', () => {
    expect(googleAppIdFromClientId('')).toBeNull();
    expect(googleAppIdFromClientId(undefined)).toBeNull();
    expect(googleAppIdFromClientId(null)).toBeNull();
  });

  it('returns null when the leading segment is not all digits', () => {
    expect(googleAppIdFromClientId('abc-def')).toBeNull();
    expect(googleAppIdFromClientId('abc123-def')).toBeNull();
  });

  it('returns the whole id when it is all digits with no prefix', () => {
    expect(googleAppIdFromClientId('987654321')).toBe('987654321');
  });
});
