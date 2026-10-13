'use client';

/**
 * PATCH-355. Formatting-safe HTML segments for translation.
 *
 * A note's `content` is editor HTML. Translating its plain text and writing it
 * back would destroy `<strong>`, lists and links, so translation works on the
 * text nodes only: `extractSegments` lists them in document order, and
 * `replaceSegments` writes the translations back into the SAME nodes, keeping
 * each node's leading and trailing whitespace. Tags and attributes are never
 * touched.
 *
 * Browser-only (DOMParser). Pure otherwise.
 */

/** The non-empty text nodes of an HTML string, in document order. */
export function extractSegments(html: string): { segments: string[] } {
  return { segments: parseWithTextNodes(html).nodes.map((node) => node.data.trim()) };
}

/**
 * The same HTML with each text node's value replaced, in order. Throws when the
 * translation count does not match, so a short or long answer is never written
 * partially.
 */
export function replaceSegments(html: string, translated: readonly string[]): string {
  const { body, nodes } = parseWithTextNodes(html);
  if (nodes.length !== translated.length) {
    throw new Error(`noteHtmlSegments: expected ${nodes.length} segments, got ${translated.length}`);
  }
  nodes.forEach((node, index) => {
    const original = node.data;
    const leading = original.slice(0, original.length - original.trimStart().length);
    const trailing = original.slice(original.trimEnd().length);
    node.data = `${leading}${translated[index]}${trailing}`;
  });
  return body.innerHTML;
}

/** Parse `html` once, keeping the body and every non-empty text node in order. */
function parseWithTextNodes(html: string): { body: HTMLElement; nodes: Text[] } {
  const body = new DOMParser().parseFromString(
    typeof html === 'string' ? html : '',
    'text/html',
  ).body;
  const walker = body.ownerDocument.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text;
    if (text.data.trim().length > 0) nodes.push(text);
  }
  return { body, nodes };
}
