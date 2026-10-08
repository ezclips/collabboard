import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CalendarLinkCipherError,
  decryptCalendarLink,
  encryptCalendarLink,
} from './calendarLinkCipher';

const KEY = 'CALENDAR_LINK_ENCRYPTION_KEY';
const VALID_KEY = Buffer.alloc(32, 7).toString('base64');
const ORIGINAL = process.env[KEY];

beforeEach(() => {
  delete process.env[KEY];
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env[KEY]; else process.env[KEY] = ORIGINAL;
});

const codeOf = (fn: () => unknown): string => {
  try {
    fn();
  } catch (error) {
    return error instanceof CalendarLinkCipherError ? error.code : 'not-a-cipher-error';
  }
  return 'no-throw';
};

describe('PATCH-328 Addendum 1 calendar link cipher', () => {
  it('refuses missing_key with no fallback to another secret', () => {
    process.env.OAUTH_STATE_SECRET = 'some-other-secret';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
    process.env.INTEGRATIONS_TOKEN_ENCRYPTION_KEY = 'another';
    try {
      expect(codeOf(() => encryptCalendarLink('https://x/cal.ics'))).toBe('missing_key');
      expect(codeOf(() => decryptCalendarLink('v1.a.b.c'))).toBe('missing_key');
    } finally {
      delete process.env.OAUTH_STATE_SECRET;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      delete process.env.INTEGRATIONS_TOKEN_ENCRYPTION_KEY;
    }
  });

  it('refuses a key of the wrong length', () => {
    process.env[KEY] = Buffer.alloc(16, 1).toString('base64');
    expect(codeOf(() => encryptCalendarLink('https://x/cal.ics'))).toBe('missing_key');
  });

  it('refuses a non-base64 key', () => {
    process.env[KEY] = 'not base64!!';
    expect(codeOf(() => encryptCalendarLink('https://x/cal.ics'))).toBe('missing_key');
  });

  it('round-trips with a valid 32-byte key', () => {
    process.env[KEY] = VALID_KEY;
    const link = 'https://calendar.google.com/secret/address/xyz.ics';
    const ciphertext = encryptCalendarLink(link);
    expect(ciphertext.startsWith('v1.')).toBe(true);
    expect(ciphertext).not.toContain(link);
    expect(decryptCalendarLink(ciphertext)).toBe(link);
  });

  it('refuses a non-v1 value instead of passing it through as plaintext', () => {
    process.env[KEY] = VALID_KEY;
    expect(codeOf(() => decryptCalendarLink('https://calendar.google.com/plain.ics'))).toBe('invalid_ciphertext');
  });

  it('refuses a tampered v1 value', () => {
    process.env[KEY] = VALID_KEY;
    const ciphertext = encryptCalendarLink('https://x/cal.ics');
    const tampered = `${ciphertext.slice(0, -2)}${ciphertext.endsWith('AA') ? 'BB' : 'AA'}`;
    expect(codeOf(() => decryptCalendarLink(tampered))).toBe('invalid_ciphertext');
  });
});
