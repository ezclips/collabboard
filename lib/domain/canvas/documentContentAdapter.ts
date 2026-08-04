// PATCH-149B1a: explicit boundary between stored Document content and TipTap
// HTML. Reuses the project's existing DOMPurify sanitization boundary
// (components/collabboard/SafeHtmlContent.tsx) rather than a second one.
import DOMPurify from 'dompurify';

export type DocumentContentClass = 'empty' | 'plain-text' | 'html' | 'malformed';

// Conservative, matches the real-tag allowlist SafeHtmlContent uses — never a
// permissive "<word>" match, so bare angle brackets in prose are never
// mistaken for markup.
const SUPPORTED_TAG = /<\/?(?:p|br|div|span|ul|ol|li|strong|em|b|i|u|s|a|h[1-6]|blockquote|code|pre|mark)(?:\s[^>]*)?\/?>/i;

export function classifyDocumentContent(raw: unknown): DocumentContentClass {
  if (typeof raw !== 'string' || raw.trim() === '') return 'empty';
  if (SUPPORTED_TAG.test(raw)) return 'html';
  if (/[<>]/.test(raw)) return 'malformed';
  return 'plain-text';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Escaped text mapped to paragraphs/line breaks so structure survives.
// Used for both plain-text and malformed content — malformed never becomes
// markup; it only ever becomes visible, escaped text.
function toEscapedParagraphs(raw: string): string {
  const normalized = raw.replace(/\r\n/g, '\n');
  return normalized
    .split(/\n{2,}/)
    .map((para) => `<p>${para.split('\n').map(escapeHtml).join('<br>') || '&nbsp;'}</p>`)
    .join('');
}

/** Convert stored Document content to safe TipTap initial HTML. */
export function toEditorHtml(raw: unknown): string {
  const cls = classifyDocumentContent(raw);
  if (cls === 'empty') return '';
  if (cls === 'html') return DOMPurify.sanitize(raw as string);
  return toEscapedParagraphs(raw as string);
}

/**
 * Normalize TipTap's getHTML() output for later persistence. Title and
 * metadata are never touched here — they are owned by the caller.
 */
export function fromEditorHtml(html: string | null | undefined): string {
  const trimmed = (html ?? '').trim();
  return trimmed === '' || trimmed === '<p></p>' ? '' : trimmed;
}
