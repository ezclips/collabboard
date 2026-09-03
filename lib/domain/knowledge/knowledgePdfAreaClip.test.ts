import { describe, expect, it } from 'vitest';
import {
  KNOWLEDGE_SOURCE_CLIP_MIME,
  buildKnowledgeSourceClipTransfer,
  knowledgeSourceClipPageRequest,
  parseKnowledgeSourceAreaClipPayload,
  parseKnowledgeSourceClipPayload,
  parseKnowledgeSourceTextClipPayload,
  type KnowledgeSourceAreaClipPayload,
} from './knowledgeSourceClipPayload';

/**
 * R6B, group A -- the area arm of the ONE clip transfer.
 *
 * The two properties these pin are (1) an area clip carries identity and a
 * rectangle and NOTHING else, and (2) the two arms can never be read as each
 * other, in either direction.
 */

const DOC = '55555555-5555-4555-8555-555555555555';

const AREA: KnowledgeSourceAreaClipPayload = {
  kind: 'area',
  sourceDocumentId: DOC,
  originalFilename: 'synthetic.pdf',
  pageNumber: 3,
  region: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
};

const TEXT = {
  kind: 'text' as const,
  sourceDocumentId: DOC,
  originalFilename: 'synthetic.pdf',
  pageNumber: 3,
  charStart: 0,
  charEnd: 5,
  selectedText: 'hello',
};

const transfer = (value: unknown) => JSON.stringify(value);

describe('A1-A6: an area clip survives the transfer intact', () => {
  it('A1: round-trips through the shared builder byte for byte', () => {
    const parsed = parseKnowledgeSourceClipPayload(buildKnowledgeSourceClipTransfer(AREA));
    expect(parsed).toEqual(AREA);
  });

  it('A2: rides the SAME dedicated type as the text arm, never text/plain', () => {
    // One dedicated type is what stops arbitrary dropped text from forging a
    // clip; a second type for areas would be a second thing to get wrong.
    expect(KNOWLEDGE_SOURCE_CLIP_MIME).toBe('application/collabboard-knowledge-clip');
  });

  it('A3: the narrowing parser returns it and the text parser refuses it', () => {
    const raw = buildKnowledgeSourceClipTransfer(AREA);
    expect(parseKnowledgeSourceAreaClipPayload(raw)).toEqual(AREA);
    expect(parseKnowledgeSourceTextClipPayload(raw)).toBeNull();
  });

  it('A4: a text clip is refused by the area parser', () => {
    const raw = buildKnowledgeSourceClipTransfer(TEXT);
    expect(parseKnowledgeSourceAreaClipPayload(raw)).toBeNull();
    expect(parseKnowledgeSourceTextClipPayload(raw)).toEqual(TEXT);
  });

  it('A5: the rectangle is rebuilt field by field, never spread', () => {
    // A forged transfer may attach anything; only the four rectangle members
    // and the three identity members may survive.
    const parsed = parseKnowledgeSourceAreaClipPayload(transfer({
      ...AREA,
      region: { ...AREA.region, storagePath: 'knowledge/other-board/secret.webp', bytes: 'AAAA' },
      imageBytes: 'ZGF0YQ==',
      dataUrl: 'data:image/webp;base64,ZGF0YQ==',
      storagePath: 'board-derived/other/pdf-areas/x.webp',
    }));
    expect(parsed).toEqual(AREA);
    expect(Object.keys(parsed ?? {}).sort())
      .toEqual(['kind', 'originalFilename', 'pageNumber', 'region', 'sourceDocumentId']);
    expect(Object.keys(parsed?.region ?? {}).sort()).toEqual(['height', 'width', 'x', 'y']);
  });

  it('A6: the serialized area clip contains no bytes, data URL or Storage path', () => {
    // The privacy property stated as the transfer itself: a crop of a private
    // PDF must not be reconstructible from a DataTransfer.
    const raw = buildKnowledgeSourceClipTransfer(AREA);
    for (const forbidden of ['base64', 'data:image', 'bytes', 'storagePath', 'signedUrl', 'padlet-files']) {
      expect(raw, forbidden).not.toContain(forbidden);
    }
  });
});

describe('A7-A14: an area clip that cannot be proven whole is not a clip', () => {
  it('A7: an unknown kind is refused rather than coerced into either arm', () => {
    for (const kind of ['image', 'AREA', 'Area', '', null, undefined, 1, {}]) {
      expect(parseKnowledgeSourceClipPayload(transfer({ ...AREA, kind })), String(kind)).toBeNull();
    }
  });

  it('A8: a missing or non-UUID-shaped document id is refused', () => {
    for (const id of ['', null, 42, {}, undefined]) {
      expect(parseKnowledgeSourceAreaClipPayload(transfer({ ...AREA, sourceDocumentId: id })), String(id)).toBeNull();
    }
  });

  it('A9: a page number that is not a positive integer is refused', () => {
    for (const page of [0, -1, 1.5, '3', null, NaN, Infinity]) {
      expect(parseKnowledgeSourceAreaClipPayload(transfer({ ...AREA, pageNumber: page })), String(page)).toBeNull();
    }
  });

  it('A10: a rectangle outside the unit page is refused', () => {
    const outside = [
      { x: -0.1, y: 0, width: 0.5, height: 0.5 },
      { x: 0, y: -0.1, width: 0.5, height: 0.5 },
      { x: 0.6, y: 0, width: 0.5, height: 0.5 },
      { x: 0, y: 0.6, width: 0.5, height: 0.5 },
    ];
    for (const region of outside) {
      expect(parseKnowledgeSourceAreaClipPayload(transfer({ ...AREA, region })), JSON.stringify(region)).toBeNull();
    }
  });

  it('A11: a zero, negative or non-finite extent is refused', () => {
    const degenerate = [
      { x: 0.1, y: 0.1, width: 0, height: 0.4 },
      { x: 0.1, y: 0.1, width: 0.4, height: 0 },
      { x: 0.1, y: 0.1, width: -0.4, height: 0.4 },
      { x: 0.1, y: 0.1, width: Number.NaN, height: 0.4 },
      { x: 0.1, y: 0.1, width: Number.POSITIVE_INFINITY, height: 0.4 },
    ];
    for (const region of degenerate) {
      expect(parseKnowledgeSourceAreaClipPayload(transfer({ ...AREA, region })), JSON.stringify(region)).toBeNull();
    }
  });

  it('A12: a missing or malformed region is refused', () => {
    for (const region of [undefined, null, 'x', 42, [], { x: 0.1, y: 0.1, width: 0.4 }]) {
      expect(parseKnowledgeSourceAreaClipPayload(transfer({ ...AREA, region })), String(region)).toBeNull();
    }
  });

  it('A13: malformed, empty and non-object transfers are refused, never repaired', () => {
    for (const raw of ['', '   ', 'not json', '[]', 'null', '"area"', '123', null, undefined]) {
      expect(parseKnowledgeSourceClipPayload(raw as string), String(raw)).toBeNull();
      expect(parseKnowledgeSourceAreaClipPayload(raw as string), String(raw)).toBeNull();
    }
  });

  it('A14: an area clip never reaches the text note-draft builder', () => {
    // knowledgeSourceClipPageRequest only accepts the text arm, and the text
    // parser is the only thing that can produce one, so an area clip cannot be
    // turned into a citation with fabricated character offsets.
    const raw = buildKnowledgeSourceClipTransfer(AREA);
    const text = parseKnowledgeSourceTextClipPayload(raw);
    expect(text).toBeNull();
    // The text arm still works exactly as before, unchanged by the new arm.
    const stillText = parseKnowledgeSourceTextClipPayload(buildKnowledgeSourceClipTransfer(TEXT));
    expect(stillText).not.toBeNull();
    expect(knowledgeSourceClipPageRequest(stillText!)).toEqual({
      sourceDocumentId: DOC,
      originalFilename: 'synthetic.pdf',
      pageNumber: 3,
      pageText: '',
      selection: { charStart: 0, charEnd: 5, selectedText: 'hello' },
    });
  });
});
