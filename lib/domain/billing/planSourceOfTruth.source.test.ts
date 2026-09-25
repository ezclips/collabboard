import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// PATCH-183. Source-level proof that the plan data and the reverse price
// mapping live in one place, and that neither settings page repeats the
// "free or pro" enum by hand.

const ROOT = resolve(__dirname, '../../..');

const SKIP_DIRS = new Set(['node_modules', '.next', '.git', '.fable5']);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      sourceFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const SOURCE_ROOTS = ['lib', 'app', 'types'].map((dir) => join(ROOT, dir));

describe('PATCH-183: one source of truth for plans', () => {
  it('resolvePlanFromPrice no longer exists anywhere in source', () => {
    const offenders = SOURCE_ROOTS.flatMap((dir) => sourceFiles(dir))
      .filter((file) => readFileSync(file, 'utf8').includes('resolvePlanFromPrice'))
      .map((file) => relative(ROOT, file).replace(/\\/g, '/'));

    expect(offenders).toEqual([]);
  });

  it("neither settings page hard-codes a literal 'free' | 'pro' union", () => {
    for (const page of [
      'app/dashboard/settings/billing/page.tsx',
      'app/dashboard/settings/subscription/page.tsx',
    ]) {
      expect(readFileSync(join(ROOT, page), 'utf8')).not.toMatch(
        /['"]free['"]\s*\|\s*['"]pro['"]/,
      );
    }
  });

  it('the webhook reads the reverse mapping from the Stripe client', () => {
    const webhook = readFileSync(
      join(ROOT, 'app/api/webhooks/stripe/route.ts'),
      'utf8',
    );
    expect(webhook).toContain('planForStripePrice');
    expect(webhook).not.toContain('resolvePlanFromPrice');
  });
});
