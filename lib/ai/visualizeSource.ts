import type { Padlet } from '@/types/collabboard';
import { getMeaningfulTitle } from '@/lib/infra/collabboard/postTitle';

/**
 * PATCH-235. The plain text of a post, for "Visualize…". The post's meaningful
 * title plus its body converted to text. Pure and DOMParser-free so it runs on
 * the server, in jsdom and in the browser alike.
 *
 * (There is an `htmlToText` in components/collabboard/canvas/engine/utils.ts,
 * but it only strips tags and `&nbsp;` -- no entity decoding, no block breaks --
 * and it lives in the component layer, so this helper is its own.)
 */

const MAX_LENGTH = 4000;
const BLOCK_END = /<\s*(?:br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/blockquote|\/pre)\b[^>]*>/gi;
const TAG = /<[^>]*>/g;
const ENTITY = /&(amp|lt|gt|quot|#39|apos|nbsp);/g;

const ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

function decodeEntities(text: string): string {
  return text.replace(ENTITY, (match) => ENTITY_MAP[match] ?? match);
}

function htmlToPlain(html: string): string {
  const withBreaks = html.replace(BLOCK_END, '\n');
  const withoutTags = withBreaks.replace(TAG, '');
  const decoded = decodeEntities(withoutTags);
  return decoded
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Trim to `max` characters without cutting a word in half.
 */
function trimToWordBoundary(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastSpace = slice.lastIndexOf(' ');
  return (lastSpace > 0 ? slice.slice(0, lastSpace) : slice).trim();
}

export function visualizeSourceText(padlet: Pick<Padlet, 'title' | 'content' | 'type'>): string {
  // The shared placeholder rule: "New Note"/"New Post"/"Untitled"/type names
  // never become the prompt's first line.
  const title = getMeaningfulTitle(padlet.title, padlet.type);
  const body = htmlToPlain(typeof padlet.content === 'string' ? padlet.content : '');
  const combined = [title, body].filter(Boolean).join('\n\n');
  return trimToWordBoundary(combined, MAX_LENGTH);
}
