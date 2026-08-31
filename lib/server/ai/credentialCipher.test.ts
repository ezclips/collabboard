import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AICredentialCipherError,
  decryptAICredential,
  encryptAICredential,
} from './credentialCipher';

const VALID_KEY = Buffer.alloc(32, 7).toString('base64');
const OTHER_KEY = Buffer.alloc(32, 9).toString('base64');
const SECRET = 'sk-test-abcdefghijklmnop1234567890';

function withKey(key: string = VALID_KEY): void {
  vi.stubEnv('AI_CREDENTIAL_ENCRYPTION_KEY', key);
}

/** base64url segment swap that keeps the structure intact but breaks a part. */
function replaceSegment(ciphertext: string, index: number, replacement: string): string {
  const parts = ciphertext.split('.');
  parts[index] = replacement;
  return parts.join('.');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('AI credential cipher', () => {
  it('1: fails closed when AI_CREDENTIAL_ENCRYPTION_KEY is absent', () => {
    vi.stubEnv('AI_CREDENTIAL_ENCRYPTION_KEY', '');

    expect(() => encryptAICredential(SECRET)).toThrow(AICredentialCipherError);
    try {
      encryptAICredential(SECRET);
    } catch (error) {
      expect((error as AICredentialCipherError).code).toBe('missing_key');
    }
  });

  it('1b: never falls back to another deployment secret', () => {
    vi.stubEnv('AI_CREDENTIAL_ENCRYPTION_KEY', '');
    vi.stubEnv('INTEGRATIONS_TOKEN_ENCRYPTION_KEY', VALID_KEY);
    vi.stubEnv('OAUTH_STATE_SECRET', VALID_KEY);
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', VALID_KEY);
    vi.stubEnv('DEEPSEEK_API_KEY', VALID_KEY);

    expect(() => encryptAICredential(SECRET)).toThrow(AICredentialCipherError);
  });

  it('2: rejects a key that is not valid base64', () => {
    withKey('not valid base64!!!');

    try {
      encryptAICredential(SECRET);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as AICredentialCipherError).code).toBe('invalid_key');
    }
  });

  it('3: rejects a key that does not decode to exactly 32 bytes', () => {
    withKey(Buffer.alloc(16, 3).toString('base64'));

    try {
      encryptAICredential(SECRET);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as AICredentialCipherError).code).toBe('invalid_key');
    }

    vi.unstubAllEnvs();
    withKey(Buffer.alloc(48, 3).toString('base64'));
    expect(() => encryptAICredential(SECRET)).toThrow(AICredentialCipherError);
  });

  it('4: round-trips a credential', () => {
    withKey();

    expect(decryptAICredential(encryptAICredential(SECRET))).toBe(SECRET);
  });

  it('5: produces different ciphertext for the same plaintext each time', () => {
    withKey();

    const first = encryptAICredential(SECRET);
    const second = encryptAICredential(SECRET);

    expect(first).not.toBe(second);
    expect(decryptAICredential(first)).toBe(SECRET);
    expect(decryptAICredential(second)).toBe(SECRET);
  });

  it('6: emits the v1 version prefix and four segments', () => {
    withKey();

    const ciphertext = encryptAICredential(SECRET);

    expect(ciphertext.startsWith('v1.')).toBe(true);
    expect(ciphertext.split('.')).toHaveLength(4);
    expect(ciphertext).not.toContain(SECRET);
  });

  it('7: rejects a tampered IV', () => {
    withKey();
    const ciphertext = encryptAICredential(SECRET);
    const tampered = replaceSegment(ciphertext, 1, Buffer.alloc(12, 1).toString('base64url'));

    expect(() => decryptAICredential(tampered)).toThrow(AICredentialCipherError);
  });

  it('8: rejects a tampered authentication tag', () => {
    withKey();
    const ciphertext = encryptAICredential(SECRET);
    const tampered = replaceSegment(ciphertext, 2, Buffer.alloc(16, 1).toString('base64url'));

    try {
      decryptAICredential(tampered);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as AICredentialCipherError).code).toBe('decryption_failed');
    }
  });

  it('9: rejects tampered ciphertext', () => {
    withKey();
    const ciphertext = encryptAICredential(SECRET);
    const parts = ciphertext.split('.');
    const body = Buffer.from(parts[3], 'base64url');
    body[0] ^= 0xff;
    const tampered = replaceSegment(ciphertext, 3, body.toString('base64url'));

    expect(() => decryptAICredential(tampered)).toThrow(AICredentialCipherError);
  });

  it('9b: rejects ciphertext produced under a different master key', () => {
    withKey();
    const ciphertext = encryptAICredential(SECRET);

    vi.unstubAllEnvs();
    withKey(OTHER_KEY);

    expect(() => decryptAICredential(ciphertext)).toThrow(AICredentialCipherError);
  });

  it('10: rejects malformed structures', () => {
    withKey();

    for (const malformed of ['', 'v1', 'v1.a.b', 'v1.a.b.c.d', 'v1...', 'v1.!!.??.$$']) {
      expect(() => decryptAICredential(malformed)).toThrow(AICredentialCipherError);
    }
  });

  it('11: rejects an unsupported version prefix', () => {
    withKey();
    const ciphertext = encryptAICredential(SECRET);

    try {
      decryptAICredential(replaceSegment(ciphertext, 0, 'v2'));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as AICredentialCipherError).code).toBe('invalid_ciphertext');
    }
  });

  it('12: never passes plaintext through on decrypt', () => {
    withKey();

    // The legacy-token behaviour this module deliberately does NOT inherit:
    // a value that is not v1 ciphertext must throw, never be returned as-is.
    expect(() => decryptAICredential(SECRET)).toThrow(AICredentialCipherError);
  });

  it('13: never leaks the credential or master key through error messages', () => {
    const attempts: (() => unknown)[] = [
      () => {
        vi.stubEnv('AI_CREDENTIAL_ENCRYPTION_KEY', '');
        return encryptAICredential(SECRET);
      },
      () => {
        withKey('not valid base64!!!');
        return encryptAICredential(SECRET);
      },
      () => {
        withKey();
        return decryptAICredential(SECRET);
      },
    ];

    for (const attempt of attempts) {
      vi.unstubAllEnvs();
      try {
        attempt();
        expect.unreachable('should have thrown');
      } catch (error) {
        const serialized = `${(error as Error).message} ${(error as Error).stack ?? ''}`;
        expect(serialized).not.toContain(SECRET);
        expect(serialized).not.toContain(VALID_KEY);
      }
    }
  });
});
