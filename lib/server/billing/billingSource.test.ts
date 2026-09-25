import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PATCH-184 source-level guards: the currency shown is CHF (no hard-coded "$"),
 * the swallowed checkout sync warning is gone, and the subscription sync has
 * exactly ONE definition.
 */

const ROOT = resolve(__dirname, '../../..');
const SKIP = new Set(['node_modules', '.next', '.git', '.fable5']);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      sourceFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const SOURCE_FILES = ['lib', 'app'].flatMap((dir) => sourceFiles(join(ROOT, dir)));

function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), 'utf8');
}

describe('PATCH-184 billing source guards', () => {
  it('neither settings page hard-codes a "$" price literal', () => {
    for (const page of [
      'app/dashboard/settings/billing/page.tsx',
      'app/dashboard/settings/subscription/page.tsx',
    ]) {
      expect(read(page)).not.toMatch(/\$[$0-9]/);
    }
  });

  it('the swallowed checkout sync warning is gone', () => {
    const offenders = SOURCE_FILES.filter((file) =>
      readFileSync(file, 'utf8').includes('console.warn("Stripe checkout session sync warning"'),
    ).map((file) => relative(ROOT, file).replace(/\\/g, '/'));

    expect(offenders).toEqual([]);
  });

  it('upsertSubscriptionFromStripe is defined in exactly one file', () => {
    const definers = SOURCE_FILES.filter((file) =>
      /(?:export\s+)?(?:async\s+)?function\s+upsertSubscriptionFromStripe\b/.test(
        readFileSync(file, 'utf8'),
      ),
    ).map((file) => relative(ROOT, file).replace(/\\/g, '/'));

    expect(definers).toEqual(['lib/server/billing/stripeBilling.ts']);
  });
});
