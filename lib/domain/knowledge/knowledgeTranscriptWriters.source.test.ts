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
// THE RPC NOW HOLDS IT FOR ITS OWN WRITES -- knowledge_transcript_replace_version
// writes document, representation and chunks in one transaction and validates
// cue containment first. It cannot hold it for anyone ELSE’S write path, so
// this suite remains the control for those: it PINS the
// files that touch these tables. A new writer changes the set and fails here,
// so it has to be considered against the invariant rather than discovered
// afterwards. It does not prove the existing writers are safe -- it proves
// nobody added one quietly.

// --untracked, because a NEW writer is exactly the thing this is watching for
// and a new file is untracked until it is staged. Without it the tripwire
// stayed quiet through the whole commit that introduced the transcript
// adapter, and would only have fired afterwards.
const listFiles = (table: string): string[] =>
  execFileSync(
    'git',
    ['grep', '-l', '--untracked', '--', table, '--', 'lib/**/*.ts', 'app/**/*.ts', 'workers/**/*.ts'],
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
  // NAMES both tables in its header only, to explain WHY the join it performs
  // was missing: the cues live on the document, the search reads the chunks.
  // It writes nothing and reads nothing -- it is a pure function over a
  // representation and a character range.
  'lib/domain/ai/boardAiTranscriptPassage.ts',
  'lib/domain/knowledge/knowledgeIngestion.ts',
  'lib/domain/knowledge/knowledgePersistence.ts',
  // ADDED by the transcript-timestamp join: it now SELECTS
  // transcript_representation for the documents a search returned. A read,
  // board-scoped, and it cannot leave text disagreeing with cues because it
  // selects neither the text nor anything writable.
  'lib/infra/ai/boardAiSearchReader.ts',
  'lib/infra/knowledge/knowledgeDeletionAdapters.ts',
  'lib/infra/knowledge/knowledgeIngestionAdapters.ts',
  'lib/infra/knowledge/knowledgeReadAdapters.ts',
  'lib/infra/knowledge/knowledgeSourceHighlightAdapters.ts',
  'lib/infra/knowledge/knowledgeSourceReferenceWriteAdapters.ts',
  'lib/infra/knowledge/knowledgeTextIngestionAdapters.ts',
  // ADDED with the transcript adapter, and it is the one writer here that
  // CANNOT leave a transcript's text disagreeing with its cues: it writes
  // nothing itself. Every mutation goes through knowledge_transcript_*, which
  // writes document, representation and chunks in one transaction and
  // validates cue containment against those chunks before doing so.
  'lib/infra/knowledge/knowledgeTranscriptAdapters.ts',
  // ADDED by PATCH-156 Part B, and it cannot break the invariant for a reason
  // stronger than care: IT CANNOT WRITE. Its Supabase client interface exposes
  // exactly `from(...).select(...).eq(...).not(...).order(...)` and nothing
  // else -- no insert, no update, no delete, no rpc -- so a write from this
  // file is a compile error rather than a review finding. It reads the board's
  // transcripts to decorate media cards and deliberately does not select the
  // cues or the canonical text, so it cannot make them disagree either.
  'lib/infra/knowledge/knowledgeTranscriptIndexAdapters.ts',
  'lib/server/ai/boardAiChatContext.ts',
  // ADDED by PATCH-176 (table from a document), and it CANNOT WRITE: its client
  // interface exposes only `from(...).select(...)` with eq/is/gte/lte/order --
  // no insert, update, delete or rpc -- so a write here is a compile error. It
  // reads a ready document's pages or chunks, board-scoped, through the caller's
  // own client, to show them to the model; it never touches cues.
  'lib/server/ai/tableFromDocumentSource.ts',
  'lib/server/knowledge/knowledgeDocumentDeleteSession.ts',
  'lib/server/wiki/boardWikiSourceVersions.ts',
];

const CHUNK_TOUCHERS = [
  'app/api/boards/[id]/knowledge/[documentId]/pages/route.ts',
  // Header comment only; see the note in DOCUMENT_TOUCHERS.
  'lib/domain/ai/boardAiTranscriptPassage.ts',
  'lib/domain/knowledge/knowledgeTextSourceLocator.ts',
  'lib/infra/ai/boardAiSearchReader.ts',
  'lib/infra/knowledge/knowledgeEmbeddingAdapters.ts',
  'lib/infra/knowledge/knowledgeSemanticSearchAdapters.ts',
  'lib/infra/knowledge/knowledgeTextIngestionAdapters.ts',
  'lib/server/ai/boardAiChatContext.ts',
  // PATCH-176: read-only; see the note in DOCUMENT_TOUCHERS.
  'lib/server/ai/tableFromDocumentSource.ts',
];

describe('transcript consistency: the writers that exist', () => {
  it('pins every file that touches knowledge_documents', () => {
    expect(listFiles('knowledge_documents')).toEqual(DOCUMENT_TOUCHERS);
  });

  it('pins every file that touches knowledge_chunks', () => {
    expect(listFiles('knowledge_chunks')).toEqual(CHUNK_TOUCHERS);
  });

  it('records that the transcript adapter is the only transcript-aware writer', () => {
    // The adapter now exists and is pinned. What is still absent is a
    // transcript-aware guard in any OTHER write path: the RPC protects its own
    // writes, and nothing stops a different service_role text path rewriting a
    // transcript's text out from under its cues.
    expect(DOCUMENT_TOUCHERS).toContain('lib/infra/knowledge/knowledgeTranscriptAdapters.ts');
  });
});
