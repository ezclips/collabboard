// @vitest-environment node
//
// THE DEPENDENCY OVERRIDE'S ACCEPTANCE.
//
// Stage 2 added mammoth, and mammoth depends on @xmldom/xmldom, which at the
// version it resolves by default carries high-severity ReDoS and quadratic
// parsing advisories. This matters here more than it would elsewhere: the
// thing being parsed is a file someone uploaded.
//
// An `overrides` entry lifts it to a patched version. An override is a change
// to a dependency EVERY dependent shares, so "the audit total went down" is not
// acceptance of it -- a number moving proves nothing about whether the other
// dependents still work. What is checked here:
//
//   1. the override resolves where it is supposed to, in every path;
//   2. it stays inside each dependent's OWN declared range, so nothing is
//      being forced outside what its author supports;
//   3. the library itself works at that version;
//   4. the other affected dependent -- the Excalidraw fork's font subsetting,
//      through fonteditor-core -- still parses a font with it.
//
// mammoth's own path is covered by knowledgeDocxExtraction.test.ts, which
// parses six real .docx fixtures through it.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const readJson = (relative: string) =>
  JSON.parse(fs.readFileSync(path.join(process.cwd(), relative), 'utf8'));

/** The version the override pins. Stated once; every check below reads it. */
const PINNED = '0.8.15';

describe('the @xmldom/xmldom override', () => {
  it('is declared in the manifest, not left to resolution', () => {
    const manifest = readJson('package.json');
    expect(manifest.overrides?.['@xmldom/xmldom']).toBe(PINNED);
  });

  it('actually resolves to the pinned version', () => {
    const resolved = require('@xmldom/xmldom/package.json') as { version: string };
    expect(resolved.version).toBe(PINNED);
  });

  it('stays inside each dependent\'s own declared range', () => {
    // An override that forces a dependency outside what a package says it
    // supports is a different and worse thing than one that picks a patch
    // inside it. Both of these are caret ranges over 0.8.x.
    const mammoth = readJson('node_modules/mammoth/package.json');
    expect(mammoth.dependencies['@xmldom/xmldom']).toMatch(/^\^0\.8\./);

    const fontEditor = readJson('node_modules/fonteditor-core/package.json');
    expect(fontEditor.dependencies['@xmldom/xmldom']).toMatch(/^\^0\.8\./);
  });

  it('parses and serializes at the pinned version', () => {
    const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
    const xml = '<r><a k="1">text &amp; more</a></r>';
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    expect(doc.documentElement.getElementsByTagName('a')[0].textContent).toBe('text & more');
    // Round-trips without losing the escape -- the serialization advisories
    // this override closes were all about exactly this.
    expect(new XMLSerializer().serializeToString(doc)).toContain('text &amp; more');
  });
});

describe('the OTHER dependent the override touches', () => {
  it('the Excalidraw fork\'s font subsetting still parses an SVG font', () => {
    // fonteditor-core is what the fork uses to subset fonts for export, and
    // its SVG reader is xmldom. This is the path an override on a shared
    // transitive dependency could break silently -- the fork builds fine and
    // font export stops working.
    const { Font } = require('fonteditor-core');
    const svg = '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><defs>'
      + '<font id="t" horiz-adv-x="500">'
      + '<font-face font-family="T" units-per-em="1000" ascent="800" descent="-200"/>'
      + '<missing-glyph horiz-adv-x="500"/>'
      + '<glyph unicode="A" horiz-adv-x="600" d="M0 0L300 700L600 0Z"/>'
      + '</font></defs></svg>';

    const parsed = (Font.create(svg, { type: 'svg' }) as { get(): {
      glyf: readonly unknown[]; head: { unitsPerEm: number };
    } }).get();

    expect(parsed.head.unitsPerEm).toBe(1000);
    // The missing-glyph plus the one real glyph.
    expect(parsed.glyf.length).toBe(2);
  });
});
