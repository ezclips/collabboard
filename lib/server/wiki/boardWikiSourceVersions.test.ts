import { describe, expect, it } from 'vitest';

import {
  readCurrentSourceVersions,
  type BoardWikiVersionClient,
} from './boardWikiSourceVersions';
import {
  boardAiCitationIdentityKey,
  type BoardAiCitationItem,
} from '../../domain/ai/boardAiChatCitation';

/**
 * THE READ SIDE OF THE VERSION COMPARISON.
 *
 * Two things matter here that the domain tests cannot see: the revision must
 * survive PostgREST's int8 serialization exactly (hence the `::text` cast), and
 * a failed query must THROW rather than resolve to an empty map -- on a wiki
 * page, an empty map means every source is gone.
 */

const BOARD = 'board-1';
const DOC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const POST = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const docItem: BoardAiCitationItem = {
  type: 'knowledge-page',
  knowledgeDocumentId: DOC,
  pageNumber: 6,
  label: 'doc — page 6',
};
const postItem: BoardAiCitationItem = { type: 'padlet', padletId: POST, label: 'a board post' };

interface StubRows {
  readonly documents?: readonly Record<string, unknown>[];
  readonly padlets?: readonly Record<string, unknown>[];
  readonly documentError?: unknown;
  readonly padletError?: unknown;
}

function stubClient(rows: StubRows = {}) {
  const selects: string[] = [];
  const client: BoardWikiVersionClient = {
    from(table) {
      const isDocuments = table === 'knowledge_documents';
      return {
        select(columns: string) {
          return {
            eq() {
              return {
                async in(_column: string, values: readonly string[]) {
                  selects.push(columns);
                  const error = isDocuments ? rows.documentError : rows.padletError;
                  if (error) return { data: null, error };
                  const tableRows = isDocuments ? rows.documents : rows.padlets;
                  const data = (tableRows ?? []).filter((row) => values.includes(String(row.id)));
                  return { data, error: null };
                },
              };
            },
          };
        },
      };
    },
  };
  return { client, selects };
}

describe('the revision survives the wire as an exact string', () => {
  it('preserves an int8 past Number.MAX_SAFE_INTEGER exactly', async () => {
    const { client } = stubClient({
      documents: [{
        id: DOC,
        content_sha256: 'sha-1',
        transcript_mutation_revision: '9007199254740993',
        updated_at: 't',
      }],
    });

    const versions = await readCurrentSourceVersions(client, BOARD, [docItem]);

    expect(versions.get(boardAiCitationIdentityKey(docItem))).toEqual({
      kind: 'document',
      contentSha256: 'sha-1',
      transcriptMutationRevision: '9007199254740993',
      updatedAt: 't',
    });
  });

  it('stringifies a bare number as a fallback for an uncast response', async () => {
    const { client } = stubClient({
      documents: [{ id: DOC, content_sha256: 'sha-1', transcript_mutation_revision: 42, updated_at: 't' }],
    });

    const versions = await readCurrentSourceVersions(client, BOARD, [docItem]);

    expect(versions.get(boardAiCitationIdentityKey(docItem))).toEqual({
      kind: 'document',
      contentSha256: 'sha-1',
      transcriptMutationRevision: '42',
      updatedAt: 't',
    });
  });

  it('omits the key for a null column rather than materializing null', async () => {
    const { client } = stubClient({
      documents: [{ id: DOC, content_sha256: 'sha-1', transcript_mutation_revision: null, updated_at: 't' }],
    });

    const versions = await readCurrentSourceVersions(client, BOARD, [docItem]);
    const version = versions.get(boardAiCitationIdentityKey(docItem));

    expect(version).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(version, 'transcriptMutationRevision')).toBe(false);
  });

  it('omits the key when the column is missing from the response entirely', async () => {
    // What an un-migrated database would produce if the error were swallowed:
    // a row with no revision key at all.
    const { client } = stubClient({
      documents: [{ id: DOC, content_sha256: 'sha-1', updated_at: 't' }],
    });

    const versions = await readCurrentSourceVersions(client, BOARD, [docItem]);
    const version = versions.get(boardAiCitationIdentityKey(docItem));

    expect(version).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(version, 'transcriptMutationRevision')).toBe(false);
  });

  it('asks the database for the ::text cast, which is the only lossless transport', async () => {
    const { client, selects } = stubClient({ documents: [] });

    await readCurrentSourceVersions(client, BOARD, [docItem]);

    expect(selects.some((columns) => columns.includes('transcript_mutation_revision::text'))).toBe(true);
  });
});

describe('the transcript discriminator is pulled out of the jsonb, never the column', () => {
  it('marks a row a transcript when the scalar is present', async () => {
    // `->>` yields text, so a representation version arrives as a string; only
    // its PRESENCE is read here, and the value is never interpreted.
    const { client } = stubClient({
      documents: [{
        id: DOC,
        content_sha256: 'sha-1',
        transcript_mutation_revision: '3',
        is_transcript: '1',
        updated_at: 't',
      }],
    });

    const versions = await readCurrentSourceVersions(client, BOARD, [docItem]);

    expect(versions.get(boardAiCitationIdentityKey(docItem))).toMatchObject({ isTranscript: true });
  });

  it('omits the key when the scalar comes back null, which is every non-transcript', async () => {
    const { client } = stubClient({
      documents: [{ id: DOC, content_sha256: 'sha-1', is_transcript: null, updated_at: 't' }],
    });

    const versions = await readCurrentSourceVersions(client, BOARD, [docItem]);
    const version = versions.get(boardAiCitationIdentityKey(docItem));

    expect(version).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(version, 'isTranscript')).toBe(false);
  });

  it('omits the key when the response carries no is_transcript at all', async () => {
    const { client } = stubClient({
      documents: [{ id: DOC, content_sha256: 'sha-1', updated_at: 't' }],
    });

    const versions = await readCurrentSourceVersions(client, BOARD, [docItem]);
    const version = versions.get(boardAiCitationIdentityKey(docItem));

    expect(version).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(version, 'isTranscript')).toBe(false);
  });

  it('selects the aliased scalar and never the bare column', async () => {
    // The payload argument, as a source-level assertion: the bare column is
    // every cue and can reach 8 MiB, per source, per render. This proves the
    // query we SEND, not that PostgREST accepted it -- see the patch's
    // local-stack syntax proof for that half.
    const { client, selects } = stubClient({ documents: [] });

    await readCurrentSourceVersions(client, BOARD, [docItem]);
    const documentSelect = selects.find((columns) => columns.includes('content_sha256'));

    expect(documentSelect).toContain('is_transcript:transcript_representation->>representationVersion');
    expect(documentSelect).not.toContain('transcript_representation,');
    expect(documentSelect).not.toMatch(/(?:^|,\s*)transcript_representation\s*,/);
  });
});

describe('a failed read fails loudly, never as "all sources gone"', () => {
  it('throws when the document query carries an error', async () => {
    // The un-migrated case the ordering dependency names: unknown column ->
    // PostgREST error -> data null. Swallowed, that renders every source gone.
    const error = { code: '42703', message: 'column transcript_mutation_revision does not exist' };
    const { client } = stubClient({ documentError: error });

    await expect(readCurrentSourceVersions(client, BOARD, [docItem])).rejects.toEqual(error);
  });

  it('throws when the padlets query carries an error', async () => {
    const error = { message: 'connection reset' };
    const { client } = stubClient({ padletError: error });

    await expect(readCurrentSourceVersions(client, BOARD, [postItem])).rejects.toEqual(error);
  });
});
