import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A FORMAT THAT EXISTS IN THE UNION AND IN NEITHER LIST IS UNREACHABLE, AND
 * NOTHING FAILS TO SAY SO.
 *
 * PATCH-156 Part A added `'youtube-panel'` to `KnowledgeTranscriptFormat`,
 * wrote the parser, and shipped 20 passing tests. No user could select it and
 * no request carrying it was accepted, because two places decide what actually
 * reaches the parser and neither is an exhaustive map:
 *
 *   - `FORMATS` in lib/server/knowledge/knowledgeTranscriptRoute.ts
 *   - `FORMAT_OPTIONS` in components/collabboard/KnowledgeTranscriptImportPanel.tsx
 *
 * THE TYPE SYSTEM IS SILENT HERE BY CONSTRUCTION. Widening a union breaks every
 * exhaustive `Record<Format, T>` at compile time, which is why that pattern is
 * safe to rely on -- but it does NOT break a `readonly Format[]`, because an
 * array of a wider type is still a valid array. Both places are arrays, so
 * `tsc` stays clean, the suite stays green, and the feature is dead.
 *
 * This file is the missing compile error, written as a test: the union is the
 * source of truth, and every member of it must be offerable and acceptable.
 * Adding a format now fails here until both ends are wired.
 */
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

const cuesSrc = read('lib/domain/knowledge/knowledgeTranscriptCues.ts');
const routeSrc = read('lib/server/knowledge/knowledgeTranscriptRoute.ts');
const panelSrc = read('components/collabboard/KnowledgeTranscriptImportPanel.tsx');

/** Every member of the declared union, read from the declaration itself. */
const declaredFormats = (() => {
  const match = /export type KnowledgeTranscriptFormat\s*=\s*([^;]+);/.exec(cuesSrc);
  expect(match, 'KnowledgeTranscriptFormat declaration not found').not.toBeNull();
  const members = [...match![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  // A union that reads as empty would make every assertion below vacuous --
  // the test would pass by finding nothing to check.
  expect(members.length).toBeGreaterThan(1);
  return members;
})();

/** The literals the route is willing to accept. */
const acceptedFormats = (() => {
  const match = /const FORMATS: readonly KnowledgeTranscriptFormat\[\] = \[([^\]]*)\]/.exec(routeSrc);
  expect(match, 'route FORMATS allowlist not found').not.toBeNull();
  return [...match![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
})();

/** The literals the panel is willing to offer. */
const offeredFormats = (() => {
  const start = panelSrc.indexOf('const FORMAT_OPTIONS');
  expect(start).toBeGreaterThan(-1);
  const end = panelSrc.indexOf('];', start);
  expect(end).toBeGreaterThan(start);
  const block = panelSrc.slice(start, end);
  return [...block.matchAll(/value:\s*'([^']+)'/g)].map((m) => m[1]);
})();

describe('every transcript format is reachable end to end', () => {
  it.each(declaredFormats)('%s is accepted by the import route', (format) => {
    expect(acceptedFormats).toContain(format);
  });

  it.each(declaredFormats)('%s is offered by the import panel', (format) => {
    expect(offeredFormats).toContain(format);
  });

  it('neither list offers a format the union does not declare', () => {
    // The other direction, which fails differently: a literal kept after a
    // format is removed passes `isFormat` at the boundary and then reaches a
    // parser with no branch for it.
    for (const format of acceptedFormats) expect(declaredFormats).toContain(format);
    for (const format of offeredFormats) expect(declaredFormats).toContain(format);
  });

  it('includes youtube-panel, the format this test was written for', () => {
    // Named explicitly so that deleting it from the union -- which would make
    // every it.each above pass by iterating over less -- still fails here.
    expect(declaredFormats).toContain('youtube-panel');
  });
});
