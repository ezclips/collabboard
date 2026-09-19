import { describe, expect, it } from 'vitest';

import {
  boardWikiMarkersIn,
  readBoardWikiCompilation,
  type BoardWikiCompiledPassage,
} from './boardWikiCompiledPage';

const DOC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const POST = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const passages: readonly BoardWikiCompiledPassage[] = [
  {
    token: 'S1.1',
    item: { type: 'padlet', padletId: POST, label: 'Audi A2 Stoßstange demontieren' },
    version: { kind: 'post', updatedAt: '2026-09-01T00:00:00Z' },
  },
  {
    token: 'S1.2',
    item: { type: 'knowledge-page', knowledgeDocumentId: DOC, pageNumber: 6, label: 'handbook — page 6' },
    version: { kind: 'document', contentSha256: 'sha-1', updatedAt: '2026-09-01T00:00:00Z' },
  },
];

const ok = (content: string) => {
  const reading = readBoardWikiCompilation(content, passages);
  if (!reading.ok) throw new Error(`expected ok, got ${reading.reason}`);
  return reading.value;
};

const rejected = (content: string) => {
  const reading = readBoardWikiCompilation(content, passages);
  if (reading.ok) throw new Error('expected a rejection');
  return reading.reason;
};

describe('a compiled page is read, not trusted', () => {
  it('keeps the markers in the content it returns', () => {
    // THE CONTRACT. Strip them at compile time and which SENTENCE came from
    // which passage is lost permanently -- no later feature can recover it
    // without recompiling, and a recompilation does not produce the same page
    // twice. Stored, a claim-level view stays derivable over pages that
    // already exist.
    const value = ok('The horn sits behind the bumper [S1.1].\nOne side is enough [S1.2].');
    expect(value.content).toContain('[S1.1]');
    expect(value.content).toContain('[S1.2]');
  });

  it('records only the passages the page actually cited, in first-citation order', () => {
    const value = ok('Second first [S1.2].\nThen the other [S1.1].\nAnd again [S1.2].');
    expect(value.sources.map((source) => source.item.label))
      .toEqual(['handbook — page 6', 'Audi A2 Stoßstange demontieren']);
  });

  it('carries each cited passage\'s compile-time version into the chain', () => {
    // This is where a source's version legitimately enters the record: from the
    // passage the server itself retrieved, never from anything a client sent.
    const value = ok('A claim [S1.2].');
    expect(value.sources[0].version).toEqual({
      kind: 'document', contentSha256: 'sha-1', updatedAt: '2026-09-01T00:00:00Z',
    });
  });

  it('does not count a heading as a claim', () => {
    // Unit 0's first metric defect: counting the title rejected pages whose
    // every sentence was sound.
    const value = ok('# Audi A2 bumper\nThe horn sits behind it [S1.1].');
    expect(value.claimCount).toBe(1);
    expect(value.declined).toBe(false);
  });

  it('accepts a bold heading too, which is what the model actually emits', () => {
    // Observed: "**Stoßstange und Lasche am Aluprofil**".
    expect(ok('**Stoßstange und Lasche**\nEine Aussage [S1.1].').claimCount).toBe(1);
  });
});

describe('THE TRUNCATION CHECK, on a path where finish_reason is not observable', () => {
  it('rejects a page whose last sentence has no closing marker', () => {
    // adapter.generateText() returns a bare string; the finish reason is
    // discarded, so a compilation cut off at the cap arrives indistinguishable
    // from a complete one. The prompt's "every sentence ends with its marker"
    // makes the common case visible.
    expect(rejected('The horn sits behind the bumper [S1.1].\nThen you unscrew the')).toBe('truncated');
  });

  it('does not let a truncated tail hide as a heading', () => {
    // The trap this rule exists for: a fragment cut at the token cap is short
    // and unpunctuated, which is exactly the shape of a bare title. Treating
    // headings as title-position-only is what keeps the fragment visible to the
    // truncation check instead of being filtered out before it.
    expect(rejected('# A title\nA claim [S1.1].\nThen you unscrew the')).toBe('truncated');
    // And a real title at the top is still not a claim.
    expect(ok('A title in bare text\nA claim [S1.1].').claimCount).toBe(1);
  });

  it('accepts a page whose last sentence ends with the marker and no full stop', () => {
    // Some models put the stop before the marker. Both endings are finished.
    expect(ok('A claim. [S1.1]').claimCount).toBe(1);
  });

  it('accepts trailing whitespace after the final marker', () => {
    expect(ok('A complete claim [S1.1].  \n').claimCount).toBe(1);
  });

  it('does not claim to prove completeness -- a page ending mid-thought BUT marked passes', () => {
    // Stated as a test so the limit is on the record rather than implied: this
    // catches a shape, not truncation itself.
    expect(ok('The first step is [S1.1].').claimCount).toBe(1);
  });
});

describe('rejection is the default for anything uncertain', () => {
  it('rejects an unattributed sentence', () => {
    // The cost of accepting a bad compilation is a durable page; the cost of
    // rejecting a good one is a second click.
    expect(rejected('The horn sits behind the bumper [S1.1].\nAlso you should check the fuse.')).toBe('unattributed');
  });

  it('REJECTS THE WHOLE PAGE for one invented token, rather than dropping it', () => {
    // In chat a bad token costs one citation on an answer that scrolls away. On
    // a page it is a durable claim whose provenance points nowhere -- and a
    // model naming a passage it was never given is evidence about the rest.
    expect(rejected('A claim [S1.1].\nAnother [S9.9].')).toBe('invented-token');
  });

  it('rejects an empty or whitespace page', () => {
    for (const bad of ['', '   ', '\n\n']) expect(rejected(bad), JSON.stringify(bad)).toBe('empty');
  });

  it('rejects a page that is only a heading', () => {
    expect(rejected('# A title and nothing else')).toBe('empty');
  });
});

describe('the licensed refusal is an outcome, not a failure', () => {
  it('reads a declining page as declined rather than unattributed', () => {
    // Unit 0's second metric defect: this scored the most desirable behaviour a
    // compiler has as its worst failure.
    const value = ok('The passages do not cover who won the chess tournament in Berlin.');
    expect(value.declined).toBe(true);
    expect(value.sources).toEqual([]);
  });

  it('recognises the German form, since the corpus is German', () => {
    expect(ok('Die Passagen decken dieses Thema nicht ab.').declined).toBe(true);
  });

  it('a declining page proposes no sources, so it cannot claim provenance it has none of', () => {
    expect(ok('The passages do not cover this topic.').sources).toHaveLength(0);
  });

  it('is not triggered by a refusal-shaped sentence that DOES cite something', () => {
    // "The passages do not cover X [S1.1]" is a claim about the passages, made
    // from a passage. It is attributed, so it is an ordinary claim.
    const value = ok('The passages do not cover the fuse box [S1.1].');
    expect(value.declined).toBe(false);
    expect(value.sources).toHaveLength(1);
  });
});

describe('the markers stay recoverable from stored content', () => {
  it('lists every distinct marker a stored page carries', () => {
    // A function with a test rather than a promise in a comment: if a future
    // change strips markers on the way into storage, this returns nothing.
    expect(boardWikiMarkersIn('One [S1.1]. Two [S1.2]. Again [S1.1].')).toEqual(['S1.1', 'S1.2']);
  });

  it('accepts the block-level form as well as the passage-level one', () => {
    // The grammar is the chat path's, unchanged: S3 and S3.2 both parse.
    expect(boardWikiMarkersIn('Block level [S3]. Passage level [S3.2].')).toEqual(['S3', 'S3.2']);
  });

  it('finds nothing in a page that carries none', () => {
    expect(boardWikiMarkersIn('A page a person wrote by hand.')).toEqual([]);
  });
});
