/**
 * What a DOCX upload IS, separate from how it is read.
 *
 * The predicate and the media type live here rather than beside the extractor
 * because three callers need them and only one of those may load mammoth: the
 * upload route, the uploader in the browser, and the adapter itself. A client
 * component reaching into `lib/infra` to learn which files it may offer would
 * pull a ZIP parser toward the bundle to answer a question about a filename.
 *
 * ROUTING ONLY. Neither the extension nor the declared media type is trusted
 * to say what the bytes ARE -- the extractor decides that, and refuses what it
 * cannot open. These decide which reader is asked.
 */

/** The media type Word writes for a .docx. */
export const KNOWLEDGE_DOCX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const KNOWLEDGE_DOCX_EXTENSION = '.docx';

/** The file picker's accept fragment for Word documents. */
export const KNOWLEDGE_DOCX_ACCEPT = `${KNOWLEDGE_DOCX_MIME_TYPE},${KNOWLEDGE_DOCX_EXTENSION}`;

/**
 * Is this upload meant for the DOCX path at all?
 *
 * `.doc` is deliberately NOT accepted. The old binary format is a different
 * thing entirely, mammoth cannot read it, and accepting it here would route it
 * to an extractor that can only refuse it with a confusing message.
 */
export function isKnowledgeDocxCandidate(candidate: {
  readonly filename: string; readonly mimeType: string;
}): boolean {
  return candidate.filename.trim().toLowerCase().endsWith(KNOWLEDGE_DOCX_EXTENSION)
    || candidate.mimeType === KNOWLEDGE_DOCX_MIME_TYPE;
}
