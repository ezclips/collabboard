import { describe, expect, it } from 'vitest';
import { decodeJwtPayload } from './legacyToken';

function createToken(payloadJson: string) {
  const base64 = Buffer.from(payloadJson, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  return `header.${base64}.signature`;
}

describe('decodeJwtPayload', () => {
  it('decodes a base64url payload with sub and email', () => {
    const token = createToken(JSON.stringify({ sub: 'user-1', email: 'user@example.com' }));

    expect(decodeJwtPayload(token)).toEqual({
      sub: 'user-1',
      email: 'user@example.com',
    });
  });

  it('handles - and _ characters in the payload encoding', () => {
    const token = createToken(JSON.stringify({ email: 'a+b/c@example.com' }));

    expect(decodeJwtPayload(token)).toEqual({
      email: 'a+b/c@example.com',
    });
  });

  it('handles missing padding', () => {
    const token = 'header.eyJzdWIiOiJ1c2VyLTEifQ.signature';

    expect(decodeJwtPayload(token)).toEqual({
      sub: 'user-1',
    });
  });
});
