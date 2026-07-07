import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineCommand } from './command';
import { ok } from './result';
import type { CommandContext } from './command';

const ctx: CommandContext = { userId: null };

const echo = defineCommand({
  name: 'test.echo',
  input: z.object({ text: z.string().min(1) }),
  execute: async (input) => ok(input.text.toUpperCase()),
});

const boom = defineCommand({
  name: 'test.boom',
  input: z.object({}),
  execute: async () => {
    throw new Error('exploded');
  },
});

describe('defineCommand', () => {
  it('runs execute on valid input', async () => {
    const r = await echo({ text: 'hi' }, ctx);
    expect(r.ok).toBe(true);
    expect(r.ok && r.value).toBe('HI');
  });

  it('rejects invalid input with a validation error (execute never runs)', async () => {
    const r = await echo({ text: '' }, ctx);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.code).toBe('validation');
    expect(!r.ok && r.error.details).toBeTruthy();
  });

  it('rejects non-object input with a validation error', async () => {
    const r = await echo('not-an-object', ctx);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.code).toBe('validation');
  });

  it('converts thrown exceptions into unknown errors', async () => {
    const r = await boom({}, ctx);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.code).toBe('unknown');
    expect(!r.ok && (r.error.cause as Error).message).toBe('exploded');
  });

  it('exposes its entity.verb name', () => {
    expect(echo.name).toBe('test.echo');
  });
});
