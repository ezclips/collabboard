/**
 * The HTML that mammoth produced, turned into the text the offsets index.
 *
 * STRUCTURAL, NOT TEXTUAL. This walks a parsed tree; it never matches markup
 * with a regular expression and it never renders anything. That is not
 * fastidiousness: the input is derived from an uploaded file, so every rule
 * here is applied to content someone else chose, and a regex over markup is
 * how "<p>" inside a sentence becomes a paragraph break.
 *
 * WHY HTML AT ALL, when the XML is right there. mammoth's raw-text mode drops
 * footnote bodies entirely and emits no separator for a line break; its HTML
 * keeps heading level, list nesting, table structure and footnote bodies. The
 * structure is in the file, and only the convenience function throws it away.
 * Going through HTML costs one escaping round-trip -- which parse5 undoes
 * exactly -- and buys mammoth's handling of the Word quirks we have not seen.
 *
 * Every separator comes from the CONTRACT, never from a literal here.
 */
import { parseFragment } from 'parse5';

import type { KnowledgeExtractionContract } from './knowledgeExtractionContract';

/** The parse5 node shapes this walker cares about, named rather than `any`. */
interface HtmlNode {
  readonly nodeName: string;
  readonly tagName?: string;
  readonly value?: string;
  readonly attrs?: readonly { readonly name: string; readonly value: string }[];
  readonly childNodes?: readonly HtmlNode[];
}

export interface KnowledgeDocxHtmlTextResult {
  /** The text, exactly as it will be canonicalised, hashed and chunked. */
  readonly text: string;
  /**
   * How many images were present and contributed no text. Carried so the
   * upload can DISCLOSE it -- an image-heavy source that extracts to three
   * lines must not read as a fully indexed document.
   */
  readonly imageCount: number;
  /** Whether any footnote bodies were appended. */
  readonly footnoteCount: number;
}

const HEADING_LEVEL: Readonly<Record<string, number>> = {
  h1: 1, h2: 2, h3: 3, h4: 4, h5: 5, h6: 6,
};

const attr = (node: HtmlNode, name: string): string | undefined =>
  node.attrs?.find((a) => a.name === name)?.value;

/**
 * A footnote body, which mammoth emits as a trailing `<ol>` whose items carry
 * `id="footnote-N"`. It is an ordered list in the markup and is NOT one in the
 * document, so it must be told apart from a real numbered list -- otherwise
 * every document's footnotes read as a final numbered section of its prose.
 */
const isFootnoteList = (node: HtmlNode): boolean =>
  node.tagName === 'ol'
  && (node.childNodes ?? []).some((child) => (attr(child, 'id') ?? '').startsWith('footnote-'));

/**
 * The backlink mammoth appends inside each footnote body (`↑`). It is
 * navigation, not text, and it would otherwise be inside the citable range.
 */
const isFootnoteBacklink = (node: HtmlNode): boolean =>
  node.tagName === 'a' && (attr(node, 'href') ?? '').startsWith('#footnote-ref-');

/**
 * The INLINE reference, which mammoth renders as a link whose text is "[1]".
 * Emitting that link text would put a bare "[1]" in the prose, which reads as
 * the author's own bracket. The contract says the marker is "[^n]", matching
 * the footnote bodies at the end and the Markdown the reader already renders.
 */
const footnoteReferenceId = (node: HtmlNode): string | null => {
  if (node.tagName !== 'a') return null;
  const href = attr(node, 'href') ?? '';
  if (!href.startsWith('#footnote-') || href.startsWith('#footnote-ref-')) return null;
  return href.slice('#footnote-'.length) || null;
};

export function knowledgeDocxHtmlToText(
  html: string,
  contract: KnowledgeExtractionContract,
): KnowledgeDocxHtmlTextResult {
  const { separators } = contract;
  const blocks: string[] = [];
  const footnoteBlocks: string[] = [];
  let imageCount = 0;
  let footnoteCount = 0;

  /** The text of one inline run: everything below `node` that is not a block. */
  const inline = (node: HtmlNode): string => {
    if (node.nodeName === '#text') return node.value ?? '';
    if (node.tagName === 'br') return separators.lineBreak;
    if (node.tagName === 'img') { imageCount += 1; return ''; }
    if (isFootnoteBacklink(node)) return '';
    const footnoteId = footnoteReferenceId(node);
    if (footnoteId !== null) return `[^${footnoteId}]`;
    return (node.childNodes ?? []).map(inline).join('');
  };

  /** Collapse a cell's internal breaks: a row is one block by the contract. */
  const flatten = (text: string) => text.replace(/[\r\n]+/g, ' ');

  const push = (text: string) => { blocks.push(text); };

  const walkBlocks = (nodes: readonly HtmlNode[], listDepth: number): void => {
    for (const node of nodes) {
      const tag = node.tagName;

      if (node.nodeName === '#text') {
        // Whitespace between mammoth's own elements. Real text never lands
        // here, and emitting it would add blocks the document does not have.
        continue;
      }

      if (tag && HEADING_LEVEL[tag] !== undefined) {
        const text = inline(node).trim();
        // A heading is only a heading if the document's styles said so. When
        // no styles resolve, mammoth emits <p> and this branch is never
        // reached -- no heading is INFERRED from weight or size.
        push(`${'#'.repeat(HEADING_LEVEL[tag])} ${text}`);
        continue;
      }

      if (tag === 'p') { push(inline(node)); continue; }

      if (tag === 'ol' && isFootnoteList(node)) {
        for (const item of node.childNodes ?? []) {
          if (item.tagName !== 'li') continue;
          footnoteCount += 1;
          const id = (attr(item, 'id') ?? '').replace('footnote-', '');
          footnoteBlocks.push(`[^${id}]: ${flatten(inline(item)).trim()}`);
        }
        continue;
      }

      if (tag === 'ul' || tag === 'ol') {
        const ordered = tag === 'ol';
        let ordinal = 0;
        for (const item of node.childNodes ?? []) {
          if (item.tagName !== 'li') continue;
          ordinal += 1;
          // An item's own text is everything inline in it; a nested list is a
          // block and is walked after, one level deeper.
          const own = (item.childNodes ?? []).filter((c) => c.tagName !== 'ul' && c.tagName !== 'ol');
          const nested = (item.childNodes ?? []).filter((c) => c.tagName === 'ul' || c.tagName === 'ol');
          const marker = ordered ? `${ordinal}. ` : '- ';
          // The ordinal is the item's position within ITS level, not Word's
          // computed label: reproducing that needs numbering.xml restart
          // rules, which is a rendering problem, not an extraction one.
          push(`${'  '.repeat(listDepth)}${marker}${flatten(own.map(inline).join('')).trim()}`);
          if (nested.length) walkBlocks(nested, listDepth + 1);
        }
        continue;
      }

      if (tag === 'table') {
        // A boundary before and after, so a cited passage cannot run out of
        // prose and into a grid without anything marking the change.
        push(separators.tableBoundary === '\n' ? '' : separators.tableBoundary);
        for (const section of node.childNodes ?? []) {
          const rows = section.tagName === 'tr' ? [section] : (section.childNodes ?? []);
          for (const row of rows) {
            if (row.tagName !== 'tr') continue;
            const cells = (row.childNodes ?? [])
              .filter((c) => c.tagName === 'td' || c.tagName === 'th')
              .map((c) => flatten(inline(c)).trim());
            push(cells.join(separators.tableCell));
          }
        }
        push(separators.tableBoundary === '\n' ? '' : separators.tableBoundary);
        continue;
      }

      // Anything else with children is a wrapper; anything else without is
      // content with no text, and the contract says it emits nothing.
      if (node.childNodes?.length) walkBlocks(node.childNodes, listDepth);
    }
  };

  const fragment = parseFragment(html) as unknown as HtmlNode;
  walkBlocks(fragment.childNodes ?? [], 0);

  const all = footnoteBlocks.length
    ? [...blocks, '', ...footnoteBlocks]
    : blocks;

  return {
    text: all.join(separators.block),
    imageCount,
    footnoteCount,
  };
}
