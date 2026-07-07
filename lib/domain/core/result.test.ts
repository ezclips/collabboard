import { describe, expect, it } from 'vitest';
import { err, isErr, isOk, ok } from './result';

describe('Result', () => {
  it('ok carries the value and narrows via isOk', () => {
    const r = ok(42);
    expect(r.ok).toBe(true);
    expect(isOk(r) && r.value).toBe(42);
  });

  it('err carries the error and narrows via isErr', () => {
    const r = err({ code: 'not_found' as const, message: 'missing' });
    expect(r.ok).toBe(false);
    expect(isErr(r) && r.error.code).toBe('not_found');
  });
});
