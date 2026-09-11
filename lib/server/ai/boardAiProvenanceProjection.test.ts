import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { boardAiCitationsFromStored } from '@/lib/domain/ai/boardAiChatCitation';
import { createBoardAiProvenanceProof } from './boardAiProvenanceProof';

/**
 * O. The proof is stored, and never leaves the server.
 *
 * The stored envelope and the browser projection are deliberately different
 * shapes: the row carries the signature so the save path can verify it, and
 * the view carries only what the citation chips need. A proof that reached the
 * browser would be a replayable token for manufacturing provenance.
 */
const ENV_VAR = 'BOARD_AI_PROVENANCE_SIGNING_KEY';
const DOC_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

let originalKey: string | undefined;
beforeEach(() => {
  originalKey = process.env[ENV_VAR];
  process.env[ENV_VAR] = Buffer.alloc(32, 5).toString('base64');
});
afterEach(() => {
  if (originalKey === undefined) delete process.env[ENV_VAR];
  else process.env[ENV_VAR] = originalKey;
});

describe('the stored proof never reaches the browser', () => {
  const items = [{ type: 'knowledge-selection', knowledgeDocumentId: DOC_A, pageNumber: 5, charStart: 4, charEnd: 19, label: 'p. 5' }];
  // Built per test, not at collection time: signing needs the key that
  // beforeEach installs.
  const storedEnvelope = () => ({
    version: 1,
    items,
    proof: createBoardAiProvenanceProof({
      messageId: 'm', threadId: 't', boardId: 'b', content: 'c', citationItems: items,
    }),
  });

  it('the row really does carry the proof', () => {
    expect(storedEnvelope().proof.signature.length).toBeGreaterThan(0);
  });

  it('the sanitized projection drops it entirely', () => {
    const stored = storedEnvelope();
    const view = boardAiCitationsFromStored(stored);
    expect(view).not.toBeNull();
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain('proof');
    expect(serialized).not.toContain('signature');
    expect(serialized).not.toContain(stored.proof.signature);
    expect(Object.keys(view!)).toEqual(['version', 'items']);
  });

  it('...while keeping every field the citation UI needs', () => {
    // Display is unchanged: type, document, page, offsets, label.
    const stored = storedEnvelope();
    const view = boardAiCitationsFromStored(stored);
    expect(view!.items[0]).toEqual({
      type: 'knowledge-selection',
      knowledgeDocumentId: DOC_A,
      pageNumber: 5,
      charStart: 4,
      charEnd: 19,
      label: 'p. 5',
    });
  });

  it('the chat route sends only the sanitized projection to the browser', () => {
    const route = readFileSync(resolve(process.cwd(), 'app/api/boards/[id]/ai/chat/route.ts'), 'utf8');
    // Every citations field on a response body goes through the parser.
    expect(route).toContain('citations: boardAiCitationsFromStored(');
    // The signed envelope is what is PERSISTED, never what is returned.
    expect(route).toContain('citations: signedCitations as unknown as BoardAiJsonValue');
    const responseRegion = route.slice(route.indexOf('return NextResponse.json({\n      threadId: thread.id'));
    expect(responseRegion).not.toContain('signedCitations');
    expect(responseRegion).not.toContain('proof');
  });

  it('no client module imports the proof or the signing key', () => {
    for (const path of [
      'components/collabboard/BoardAiChatDrawer.tsx',
      'app/dashboard/canvas/[id]/CanvasClient.tsx',
      'lib/domain/ai/boardAiChatCitation.ts',
      'lib/domain/ai/boardAiNoteProvenance.ts',
    ]) {
      const source = readFileSync(resolve(process.cwd(), path), 'utf8');
      expect(source, path).not.toContain('boardAiProvenanceProof');
      expect(source, path).not.toContain('BOARD_AI_PROVENANCE_SIGNING_KEY');
    }
  });
});
