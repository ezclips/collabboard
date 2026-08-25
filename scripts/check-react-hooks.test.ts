// ENG-HOOKS-H1 -- proves the gate is real: it catches the B3 shape, ignores
// unrelated lint, and refuses to report green when it could not actually run.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import {
  CANVAS_CLIENT,
  HOOK_RULE,
  checkHookOrderForText,
  createEslint,
  hookRuleSeverity,
} from './check-react-hooks';

const eslint = createEslint();
// A virtual path inside the React/TSX config, so lintText needs no real file.
const PROBE = path.join(process.cwd(), 'components/collabboard/__hook_probe__.tsx');

const VALID = `import { useMemo } from 'react';
export default function Ok({ items }: { items: string[] }) {
  const count = useMemo(() => items.length, [items]);
  if (count === 0) return null;
  return <p>{count}</p>;
}
`;

// The B3 defect, reduced: a hook below an early return runs a different number
// of times per render, which is what aborted every canvas.
const CONDITIONAL = `import { useMemo } from 'react';
export default function Broken({ items, loading }: { items: string[]; loading: boolean }) {
  if (loading) return <p>loading</p>;
  const count = useMemo(() => items.length, [items]);
  return <p>{count}</p>;
}
`;

describe('A: valid source', () => {
  it('reports no hook violations for an unconditional hook', async () => {
    const result = await checkHookOrderForText(VALID, PROBE, eslint);
    expect(result.reason).toBeUndefined();
    expect(result.findings).toEqual([]);
    expect(result.ok).toBe(true);
  });
});

describe('B: conditional hook', () => {
  it('catches a hook placed below an early return', async () => {
    const result = await checkHookOrderForText(CONDITIONAL, PROBE, eslint);
    expect(result.reason).toBeUndefined();
    expect(result.ok).toBe(false);
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
    expect(result.findings.every((f) => f.ruleId === HOOK_RULE)).toBe(true);
    expect(result.findings[0].line).toBeGreaterThan(0);
    expect(result.findings[0].message).toMatch(/conditional|early return|called conditionally/i);
  });
});

describe('C: the rule is really enabled', () => {
  it('resolves rules-of-hooks at error severity for CanvasClient', async () => {
    expect(await hookRuleSeverity(eslint, CANVAS_CLIENT)).toBe(2);
  });

  it('does not treat the gated target as ignored', async () => {
    expect(await eslint.isPathIgnored(CANVAS_CLIENT)).toBe(false);
  });

  it('refuses to report green when the rule is off', async () => {
    // Same source, but a config where the rule is disabled: the check must
    // fail closed rather than return "0 findings".
    const off = new ESLint({
      cwd: process.cwd(),
      overrideConfig: { rules: { [HOOK_RULE]: 'off' } },
    });
    const result = await checkHookOrderForText(CONDITIONAL, PROBE, off);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('not enabled at error severity');
    expect(result.findings).toEqual([]);
  });
});

describe('D: filtering', () => {
  it('ignores unrelated lint findings while still seeing hook ones', async () => {
    const noisy = `import { useMemo } from 'react';
export default function Noisy({ items }: { items: string[] }) {
  const unused = 1;
  const count = useMemo(() => items.length, [items]);
  return <img src="/x.png" alt="" width={10} height={10} />;
}
`;
    // ESLint itself does report other rules here...
    const raw = await eslint.lintText(noisy, { filePath: PROBE });
    const otherRules = raw[0].messages.filter((m) => m.ruleId && m.ruleId !== HOOK_RULE);
    expect(otherRules.length).toBeGreaterThan(0);

    // ...but the gate reports only hook order, so unrelated debt cannot fail it.
    const result = await checkHookOrderForText(noisy, PROBE, eslint);
    expect(result.reason).toBeUndefined();
    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
  });
});

describe('E: package wiring', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };

  it('exposes check:hooks:canvas pointing at this script and the canvas target', () => {
    const script = pkg.scripts['check:hooks:canvas'];
    expect(script, 'check:hooks:canvas script missing').toBeTruthy();
    expect(script).toContain('scripts/check-react-hooks.ts');
    expect(script).toContain(CANVAS_CLIENT);
  });

  it('runs the hook gate as a blocking step of verify, alongside the existing stages', () => {
    const verify = pkg.scripts.verify;
    expect(verify).toContain('check:hooks:canvas');
    for (const stage of ['typecheck', 'check:boundaries', 'test:unit', 'build']) {
      expect(verify, `verify must still run ${stage}`).toContain(stage);
    }
    // Chained with && so a hook violation stops the run rather than being
    // reported and passed over.
    expect(verify).toContain('&& npm run check:hooks:canvas &&');
  });
});
