/**
 * The transcript's version representation: the exact bytes `content_sha256` is
 * taken over for a transcript source.
 *
 * WHY TIMING IS IN THE HASH. The wiki's staleness signal compares
 * `content_sha256`. If cue timings sat outside it, re-importing a corrected
 * caption file whose words are identical but whose timings shifted would not
 * change the hash: every citing page would keep a timestamp that now points at
 * the wrong moment, and nothing would be flagged stale. A timing-only
 * correction changes what a citation MEANS, so it must change the version.
 *
 * WHAT `content_sha256` ALREADY IS, verified before extending it: an opaque,
 * per-kind fingerprint rather than "the hash of the text". The PDF path hashes
 * the raw uploaded bytes; the text and DOCX path hashes UTF-8 of the canonical
 * text. Every consumer treats it as opaque -- the wiki compares it for
 * inequality, the PDF ETag uses it as a component, the extraction RPC compares
 * stored against stored -- and no consumer recomputes it from text. So this is
 * a compatible extension, not a redefinition.
 *
 * NORMALISATION IS UNITS AND SERIALISATION ONLY. It never shifts a timestamp,
 * removes or merges an overlap, reorders cues, or rounds away precision the
 * source format supports. Equivalent spellings of the same instant hash
 * identically; changed timing or a changed video association does not.
 */
import type { KnowledgeTranscriptPlacedCue } from './knowledgeTranscriptDocument';
import type { KnowledgeTranscriptFormat } from './knowledgeTranscriptCues';

/**
 * The layout version, INSIDE the hashed bytes.
 *
 * A future change to this layout is therefore a new version rather than a
 * silent re-interpretation of hashes already stored -- the same rule the
 * extraction contract follows. Bump it when the framing changes, never when
 * only a value changes.
 */
export const KNOWLEDGE_TRANSCRIPT_REPRESENTATION_VERSION = 1;

export interface KnowledgeTranscriptVersionInput {
  readonly canonicalText: string;
  readonly cues: readonly KnowledgeTranscriptPlacedCue[];
  /**
   * The video this transcript CLAIMS to describe, or null.
   *
   * In the hash because timestamp links mean something different against a
   * different video: the same cues associated with another video are a
   * different thing to cite, and a reader following the link would land
   * somewhere unrelated.
   */
  readonly videoIdentity: string | null;
}

/**
 * UNITS, stated because a length prefix is ambiguous otherwise.
 *
 *   - `text` is prefixed with its length in UTF-8 BYTES, because the prefix
 *     frames bytes in a UTF-8 byte string.
 *   - `charStart` / `charEnd` are UTF-16 CODE UNITS, because those are
 *     citation offsets and must mean exactly what `String.slice` means.
 *
 * The two are different numbers for the same text whenever it is not pure
 * ASCII, so they are labelled in the output itself rather than left to a
 * reader to infer.
 */
export function knowledgeTranscriptVersionRepresentation(
  input: KnowledgeTranscriptVersionInput,
): string {
  const textBytes = new TextEncoder().encode(input.canonicalText).length;
  const lines: string[] = [
    `knowledge-transcript\t${KNOWLEDGE_TRANSCRIPT_REPRESENTATION_VERSION}`,
    `video\t${input.videoIdentity ?? '-'}`,
    // LENGTH-PREFIXED, and the reason is stated accurately rather than
    // dramatically. An earlier version of this comment claimed the prefix
    // prevents a collision from a transcript whose text contains newlines and
    // tabs. THAT WAS OVERSTATED: the attempt is in the tests, and no collision
    // could be constructed, because the cue block is a suffix determined by
    // the real cues -- text that swallows another transcript's framing still
    // leaves its own cue block behind it.
    //
    // What the prefix actually buys: the representation stays unambiguously
    // framed, so it can be read back by eye or by code without guessing where
    // the text ends, and the UNITS are declared rather than inferred. It is
    // precautionary, and cheap, and kept on those grounds.
    `text\tutf8-bytes=${textBytes}\tutf16-units=${input.canonicalText.length}`,
    input.canonicalText,
    `cues\t${input.cues.length}\toffsets=utf16\ttimes=ms`,
  ];
  for (const cue of input.cues) {
    // File order, overlaps intact. Not sorted, not merged, not de-duplicated.
    lines.push(`${cue.charStart}\t${cue.charEnd}\t${cue.startMs}\t${cue.endMs}`);
  }
  return `${lines.join('\n')}\n`;
}

export function knowledgeTranscriptVersionBytes(
  input: KnowledgeTranscriptVersionInput,
): Uint8Array {
  return new TextEncoder().encode(knowledgeTranscriptVersionRepresentation(input));
}

/**
 * Everything needed to recompute the version, stored alongside the document.
 *
 * The point of persisting this is that a stored row can be re-hashed and
 * compared WITHOUT re-parsing the original upload. A verification that depends
 * on re-running the parser proves the parser is deterministic, not that the
 * stored row is the one that was hashed.
 */
export interface KnowledgeTranscriptStoredRepresentation {
  readonly representationVersion: number;
  readonly videoIdentity: string | null;
  readonly cues: readonly {
    readonly charStart: number;
    readonly charEnd: number;
    readonly startMs: number;
    readonly endMs: number;
  }[];
  /** Recorded as provenance, never inferred from the text. `null` means unknown. */
  readonly language: string | null;
  readonly trackKind: 'human' | 'machine' | 'unknown';
  /**
   * Which parser produced these cues. The domain FOLLOWS
   * `KnowledgeTranscriptFormat`, so one union describes the concept rather than
   * two drifting apart.
   *
   * WIDENING THIS DOMAIN DOES NOT CHANGE THE REPRESENTATION VERSION. The
   * representation's SHAPE is unchanged -- only the value domain of an existing
   * field grows -- and `format` is NOT part of the hashed bytes
   * (`knowledgeTranscriptVersionBytes` covers canonical text, cues and video
   * identity). So every stored row stays valid and readable, and no
   * `representationVersion` bump is warranted or given.
   */
  readonly format: KnowledgeTranscriptFormat;
  /** The association is the user's claim. Nothing here verifies it. */
  readonly videoAssociation: 'claimed' | 'none';
}

export function knowledgeTranscriptStoredRepresentation(input: {
  readonly cues: readonly KnowledgeTranscriptPlacedCue[];
  readonly videoIdentity: string | null;
  readonly language: string | null;
  readonly trackKind: 'human' | 'machine' | 'unknown';
  readonly format: KnowledgeTranscriptFormat;
}): KnowledgeTranscriptStoredRepresentation {
  return {
    representationVersion: KNOWLEDGE_TRANSCRIPT_REPRESENTATION_VERSION,
    videoIdentity: input.videoIdentity,
    cues: input.cues.map((cue) => ({
      charStart: cue.charStart,
      charEnd: cue.charEnd,
      startMs: cue.startMs,
      endMs: cue.endMs,
    })),
    language: input.language,
    trackKind: input.trackKind,
    format: input.format,
    videoAssociation: input.videoIdentity === null ? 'none' : 'claimed',
  };
}

/** Rebuilds the hashed bytes from what was stored, with no parser involved. */
export function knowledgeTranscriptVersionBytesFromStored(
  stored: KnowledgeTranscriptStoredRepresentation,
  canonicalText: string,
): Uint8Array | null {
  // A stored row written by a future layout must not be re-hashed under this
  // one: the answer would differ for a reason that is not a content change.
  if (stored.representationVersion !== KNOWLEDGE_TRANSCRIPT_REPRESENTATION_VERSION) return null;
  return knowledgeTranscriptVersionBytes({
    canonicalText,
    videoIdentity: stored.videoIdentity,
    cues: stored.cues as readonly KnowledgeTranscriptPlacedCue[],
  });
}
