import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// THE TRANSCRIPT CONSISTENCY INVARIANT CANNOT BE ENFORCED WHERE IT IS BROKEN.
//
// A transcript is stored as kind 'text' with a non-null transcript
// representation, so any path that writes a text document can reach one. The
// importer's own guard (transcriptConsistencyBreak) protects ONE direction
// only: it stops the importer replacing plain text with a transcript. It does
// nothing about the direction that matters more -- an ordinary text write
// path, running as service_role, rewriting a transcript's text and leaving its
// cues and representation describing words that are no longer there.
//
// A ROW CHECK CANNOT ESTABLISH IT EITHER. The inconsistency is between a
// document's text and its CHILD chunk and cue rows; a CHECK constraint sees
// one row. Only the transaction that writes the document and its children
// together can hold this invariant, which is why it belongs in the RPC.
//
// UNTIL THAT RPC EXISTS, this suite is the control that exists: it PINS the
// files that touch these tables. A new writer changes the set and fails here,
// so it has to be considered against the invariant rather than discovered
// afterwards. It does not prove the existing writers are safe -- it proves
// nobody added one quietly.

const listFiles = (table: string): string[] =>
  execFileSync(
    'git',
    ['grep', '-l', '--', table, '--', 'lib/**/*.ts', 'app/**/*.ts', 'workers/**/*.ts'],
    { encoding: 'utf8' },
  )
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.endsWith('.test.ts'))
    .sort();

// Pinned 2026-09-21. Adding a file here is a decision about the invariant
// above, not a formality: say in the commit why the new writer cannot leave a
// transcript's text disagreeing with its cues.
const DOCUMENT_TOUCHERS = [
  'app/api/boards/[id]/ai/notes/provenance/route.ts',
  'app/api/boards/[id]/knowledge/[documentId]/original/route.ts',
  'app/api/boards/[id]/knowledge/[documentId]/pages/[pageNumber]/image/route.ts',
  'app/api/boards/[id]/knowledge/[documentId]/pages/route.ts',
  'app/api/boards/[id]/knowledge/[documentId]/render-pages/route.ts',
  // Domain files that only NAME the table (types, comments, prompt text). They
  // are pinned with the rest deliberately: the set is what is checked, and a
  // file that starts naming the table is worth noticing either way.
  'lib/domain/ai/boardAiSearchContext.ts',
  'lib/domain/knowledge/knowledgeIngestion.ts',
  'lib/domain/knowledge/knowledgePersistence.ts',
  'lib/infra/knowledge/knowledgeDeletionAdapters.ts',
  'lib/infra/knowledge/knowledgeIngestionAdapters.ts',
  'lib/infra/knowledge/knowledgeReadAdapters.ts',
  'lib/infra/knowledge/knowledgeSourceHighlightAdapters.ts',
  'lib/infra/knowledge/knowledgeSourceReferenceWriteAdapters.ts',
  'lib/infra/knowledge/knowledgeTextIngestionAdapters.ts',
  'lib/server/ai/boardAiChatContext.ts',
  'lib/server/knowledge/knowledgeDocumentDeleteSession.ts',
  'lib/server/wiki/boardWikiSourceVersions.ts',
];

const CHUNK_TOUCHERS = [
  'app/api/boards/[id]/knowledge/[documentId]/pages/route.ts',
  'lib/domain/knowledge/knowledgeTextSourceLocator.ts',
  'lib/infra/ai/boardAiSearchReader.ts',
  'lib/infra/knowledge/knowledgeEmbeddingAdapters.ts',
  'lib/infra/knowledge/knowledgeSemanticSearchAdapters.ts',
  'lib/infra/knowledge/knowledgeTextIngestionAdapters.ts',
  'lib/server/ai/boardAiChatContext.ts',
];

describe('transcript consistency: the writers that exist', () => {
  it('pins every file that touches knowledge_documents', () => {
    expect(listFiles('knowledge_documents')).toEqual(DOCUMENT_TOUCHERS);
  });

  it('pins every file that touches knowledge_chunks', () => {
    expect(listFiles('knowledge_chunks')).toEqual(CHUNK_TOUCHERS);
  });

  it('records that no transcript-aware write path exists yet', () => {
    // When the RPC lands, this expectation flips and the guard moves into the
    // transaction. Until then the claim stays honest: the invariant is pinned,
    // not enforced.
    expect(DOCUMENT_TOUCHERS).not.toContain('lib/infra/knowledge/knowledgeTranscriptAdapters.ts');
  });
});
