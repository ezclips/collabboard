// The canonical text of a text source: the one string that offsets, hashes,
// chunks and citations all agree about.
//
// ===========================================================================
// EVERYTHING DOWNSTREAM IS COMPUTED AGAINST THIS STRING, SO IT IS COMPUTED ONCE
// ===========================================================================
//
// A citation names [charStart, charEnd) and a reader highlights that range.
// Those two agree only if the bytes were turned into characters exactly the
// same way on both sides -- and the ways they can disagree are all invisible:
// a BOM that shifts every offset by one, a CRLF file whose offsets were
// computed after normalisation but applied before it, a hash taken over raw
// bytes so that re-saving a file with different line endings looks like new
// content.
//
// So: decode, strip, normalise, THEN hash and chunk. Never in another order,
// and never twice with different rules.
//
// WHAT IS REFUSED, AND WHY EACH ONE IS REFUSED RATHER THAN REPAIRED:
//
//   - Invalid UTF-8. TextDecoder's default is to replace bad sequences with
//     U+FFFD, which turns a wrong guess about a file's encoding into a corpus
//     of plausible-looking mojibake nobody will ever notice. `fatal: true`
//     makes it an error the user can act on ("this is not UTF-8") instead.
//   - NUL bytes. PostgreSQL text cannot hold U+0000 at all -- it is not a
//     policy choice, the insert fails. Refusing here names the reason; letting
//     it through produces a driver error about an invalid byte sequence.
//
// WHAT IS NOT REFUSED. Unusual but valid text is accepted. Control characters,
// unnormalised combining marks, right-to-left runs, a file that is one enormous
// line: none of these is a reason to refuse, and "this looks like nothing"
// is not a decidable property. Emptiness is handled downstream by the chunker,
// which produces nothing for a source with nothing in it.
//
// NORMALISATION FORM IS DELIBERATELY NOT APPLIED. NFC would silently rewrite a
// user's file -- a decomposed umlaut becoming a composed one changes the
// character count, so every offset would describe a string the user never
// uploaded. Composed and decomposed umlauts are both preserved exactly as they
// arrived, and the round-trip fixtures cover both.

/** Why a source could not be made canonical. Shown to the user verbatim. */
export type KnowledgeTextRefusal =
  | 'not-utf8'
  | 'contains-nul';

export type KnowledgeTextCanonicalResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly reason: KnowledgeTextRefusal; readonly message: string };

const MESSAGES: Record<KnowledgeTextRefusal, string> = {
  'not-utf8': 'This file is not valid UTF-8 text. Save it as UTF-8 and upload it again.',
  'contains-nul': 'This file contains NUL bytes, so it is not text. It may be a binary file with a text extension.',
};

/** U+FEFF as the first character: a byte-order mark, not content. */
const BOM = '﻿';

/**
 * The canonical text, or the reason there is not one.
 *
 * The order of operations here is the contract: decode strictly, strip a
 * leading BOM, then normalise line endings. Offsets and the content hash are
 * both taken from the result and never from anything earlier in the chain.
 */
export function canonicalizeKnowledgeText(bytes: Uint8Array): KnowledgeTextCanonicalResult {
  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return { ok: false, reason: 'not-utf8', message: MESSAGES['not-utf8'] };
  }

  return canonicalizeDecodedKnowledgeText(decoded);
}

/**
 * The same contract, from a string that is already text.
 *
 * Split out for the extraction step: a DOCX is a ZIP, so it never survives the
 * strict decode above and must be turned into text BEFORE canonicalisation.
 * Both paths converge here, so a `.txt` and a `.docx` are normalised by one
 * rule rather than by two that drift.
 */
export function canonicalizeDecodedKnowledgeText(decoded: string): KnowledgeTextCanonicalResult {
  // A BOM anywhere else is a legitimate (if odd) zero-width character and is
  // left alone; only a LEADING one is an encoding marker rather than content.
  const withoutBom = decoded.startsWith(BOM) ? decoded.slice(BOM.length) : decoded;

  // CRLF first, then any lone CR. Doing it in one pass with an alternation
  // would be equivalent; doing lone-CR first would turn CRLF into two
  // newlines.
  const text = withoutBom.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  if (text.includes('\u0000')) {
    return { ok: false, reason: 'contains-nul', message: MESSAGES['contains-nul'] };
  }

  return { ok: true, text };
}

/**
 * The bytes the content hash is taken over: the canonical text, re-encoded.
 *
 * NOT the uploaded bytes. Two uploads of the same document that differ only in
 * line endings or a BOM are the same content, and hashing what the user
 * happened to save would report the second as a new version -- which, for the
 * wiki, means marking every page that cites it stale for a change that did not
 * happen.
 */
export function knowledgeTextHashInput(canonicalText: string): Uint8Array {
  return new TextEncoder().encode(canonicalText);
}

/**
 * Is this index safe to cut at -- that is, does it fall between characters
 * rather than inside one?
 *
 * Offsets are UTF-16 code units, because that is what String.prototype.slice
 * counts and what every consumer of these ranges will use. An index that lands
 * between a high and a low surrogate would split an astral character (an emoji,
 * most commonly) into two halves that render as replacement glyphs on both
 * sides of the cut.
 */
export function isSafeTextCutIndex(text: string, index: number): boolean {
  if (index <= 0 || index >= text.length) return true;
  const before = text.charCodeAt(index - 1);
  const after = text.charCodeAt(index);
  const highSurrogate = before >= 0xd800 && before <= 0xdbff;
  const lowSurrogate = after >= 0xdc00 && after <= 0xdfff;
  return !(highSurrogate && lowSurrogate);
}

/**
 * The nearest safe cut at or before `index`.
 *
 * Moves BACK rather than forward so a cut can never exceed the budget that
 * asked for it.
 */
export function safeTextCutIndex(text: string, index: number): number {
  return isSafeTextCutIndex(text, index) ? index : index - 1;
}
