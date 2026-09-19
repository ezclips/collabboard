/**
 * A wiki page, serialized as an Open Knowledge Format concept file.
 *
 * OKF (Google Cloud, v0.2) is a directory tree of markdown files with YAML
 * frontmatter, one concept per file. It is explicitly not a runtime, not a
 * search index, and confers no ranking benefit -- so it replaces nothing here.
 * It is a way for a page to leave this product intact.
 *
 * OKF IS A WIRE FORMAT, NEVER OUR SCHEMA, and that boundary is the reason this
 * module exists at all rather than a storage change. OKF puts provenance in
 * frontmatter inside the markdown body; our body is `content`, which is
 * client-writable. Storing `sources` there would hand a caller the version
 * fields the server resolves -- the laundering hole rejected when a save was
 * made to carry `appliedProposalId` as a REFERENCE rather than data -- and
 * would discard the slug constraint, the title constraint and the column-level
 * UPDATE allowlist with it. So this is a one-way projection: pages are read
 * and written as rows, and only ever LEAVE as OKF.
 *
 * Pure: no I/O, no clock, no randomness. Given a page it returns the same bytes
 * every time, which is what makes a golden-file test meaningful.
 */
import { boardWikiMarkersIn } from './boardWikiCompiledPage';
import type { BoardWikiPageSource } from './boardWikiPageSources';
import type { BoardAiCitationItem } from '../ai/boardAiChatCitation';

/**
 * The spec version this exporter targets, written into every file it produces.
 *
 * OKF calls itself "a starting point, not a finished standard". A bundle that
 * does not say which version it was written against is undebuggable the first
 * time the format moves.
 */
export const OKF_SPEC_VERSION = '0.2';

/**
 * The concept type every page is. OKF requires exactly one field, and this is
 * it: a short string naming the kind of concept.
 */
export const OKF_CONCEPT_TYPE = 'wiki_page';

/**
 * THE URI SCHEME, deliberately in ONE function.
 *
 * `sources[].resource` is required by OKF and is a URI. We hold ids, and a
 * citation opens through an in-app callback rather than a URL, so there is no
 * existing address to reuse. Whatever is minted here becomes the identity these
 * pages present to the outside world, and it is expensive to change once
 * anything has consumed an export -- so it lives in one place, and a change is
 * one edit rather than a search.
 *
 * A custom scheme rather than an https link, because an https URL would promise
 * a fetchable public address that does not exist: every one of these resources
 * is behind the board's authorization, and a consumer following such a link
 * would get a sign-in page rather than the source.
 */
export function okfResourceUri(boardId: string, item: BoardAiCitationItem): string {
  const board = `collabboard://board/${boardId}`;
  switch (item.type) {
    case 'padlet':
    case 'padlet-image':
      return `${board}/post/${item.padletId ?? ''}`;
    case 'knowledge-page':
      return `${board}/document/${item.knowledgeDocumentId ?? ''}/page/${item.pageNumber ?? ''}`;
    case 'knowledge-selection':
      return `${board}/document/${item.knowledgeDocumentId ?? ''}/page/${item.pageNumber ?? ''}`
        + `?chars=${item.charStart ?? 0}-${item.charEnd ?? 0}`;
    case 'knowledge-document':
      return `${board}/document/${item.knowledgeDocumentId ?? ''}`;
    default:
      return board;
  }
}

export function okfPageUri(boardId: string, slug: string): string {
  return `collabboard://board/${boardId}/wiki/${slug}`;
}

export interface BoardWikiOkfPage {
  readonly boardId: string;
  readonly slug: string;
  readonly title: string;
  readonly content: string;
  readonly sources: readonly BoardWikiPageSource[];
  readonly compiledAt: string | null;
  /** When a person last saved the page, and who. A human act, never a machine's. */
  readonly updatedAt: string;
  readonly updatedBy: string | null;
}

/** YAML scalars, quoted the one way that is always safe to re-read. */
function yamlString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * The actor convention OKF specifies: a person is `human:<id>`, an agent is
 * `<producer>/<version>`, a process is `process:<id>`.
 */
export function okfHumanActor(userId: string): string {
  return `human:${userId}`;
}

/**
 * Resolve `[S1.4]` markers into ordinary markdown links.
 *
 * OKF expresses relationships as plain markdown links whose kind is "conveyed
 * by the surrounding prose", which is coarser than what a compiled page already
 * carries. Exporting the markers verbatim would produce something portable and
 * meaningless: `[S1.4]` names a position in an array only this product holds.
 *
 * The positional grammar is `S<block>.<passage>`, and a page's sources are the
 * flat list those positions were assigned from, so the Nth marker family maps
 * to the Nth source. A marker with no source behind it is LEFT ALONE rather
 * than dropped -- a page that says more than its chain can support should look
 * that way in the export too, not be quietly tidied.
 */
export function okfLinkedContent(
  content: string,
  sources: readonly BoardWikiPageSource[],
  boardId: string,
): string {
  const markers = boardWikiMarkersIn(content);
  const order = new Map(markers.map((marker, index) => [marker, index]));
  return content.replace(/\[(S[1-9][0-9]*(?:\.[1-9][0-9]*)?)\]/g, (whole, marker: string) => {
    const index = order.get(marker);
    if (index === undefined) return whole;
    const source = sources[index];
    if (!source) return whole;
    return `[${marker}](${okfResourceUri(boardId, source.item)})`;
  });
}

/**
 * One page as one OKF concept file.
 *
 * TWO FIELDS ARE DELIBERATELY ABSENT, and both absences are load-bearing:
 *
 * `generated.by` -- OKF wants `<producer>/<version>`. The compiling model is
 * known at compile time and is not persisted, so writing anything here would be
 * a guess wearing a provenance field's clothes. Omitted until it is stored.
 *
 * `stale_after` -- OKF wants an absolute instant. Ours is not a timestamp: it
 * is computed by comparing each recorded source version against the live one,
 * which is a better answer than any date. A guessed instant would be worse than
 * an empty field AND worse than the truth we have.
 *
 * `verified` is written ONLY from a human save. OKF treats human verification
 * as a trust tier; stamping it on machine output is exactly the overclaim the
 * citation work and the wiki plan both exist to prevent.
 */
export function boardWikiOkfDocument(page: BoardWikiOkfPage): string {
  const lines: string[] = ['---'];
  lines.push(`type: ${OKF_CONCEPT_TYPE}`);
  lines.push(`title: ${yamlString(page.title)}`);
  lines.push(`resource: ${yamlString(okfPageUri(page.boardId, page.slug))}`);
  lines.push(`okf_version: ${yamlString(OKF_SPEC_VERSION)}`);

  if (page.sources.length > 0) {
    lines.push('sources:');
    for (const source of page.sources) {
      lines.push(`  - resource: ${yamlString(okfResourceUri(page.boardId, source.item))}`);
      lines.push(`    title: ${yamlString(source.item.label)}`);
      // The version this page was compiled against -- not the source's current
      // state, which is the whole point of recording it as content.
      if (source.version.updatedAt) {
        lines.push(`    last_modified: ${yamlString(source.version.updatedAt)}`);
      }
    }
  }

  // `generated` carries only what is known. A compilation that never happened
  // is not reported as one.
  if (page.compiledAt) {
    lines.push('generated:');
    lines.push(`  at: ${yamlString(page.compiledAt)}`);
  }

  // A save is a person accepting what the page says -- including a person
  // accepting a proposal. That is a verification event; a compilation is not.
  if (page.updatedBy) {
    lines.push('verified:');
    lines.push(`  - by: ${yamlString(okfHumanActor(page.updatedBy))}`);
    lines.push(`    at: ${yamlString(page.updatedAt)}`);
  }

  lines.push('---');
  lines.push('');
  lines.push(`# ${page.title}`);
  lines.push('');
  lines.push(okfLinkedContent(page.content, page.sources, page.boardId));
  lines.push('');
  return lines.join('\n');
}

/** One page's path inside the bundle. */
export function boardWikiOkfFilename(slug: string): string {
  return `${slug}.md`;
}

/**
 * The bundle's `index.md` -- a reserved OKF filename, for progressive
 * disclosure. Links are bundle-relative, which is one of the two link forms the
 * spec defines.
 */
export function boardWikiOkfIndex(
  pages: readonly { readonly slug: string; readonly title: string }[],
): string {
  const lines: string[] = ['---'];
  lines.push('type: index');
  lines.push(`title: ${yamlString('Board wiki')}`);
  lines.push(`okf_version: ${yamlString(OKF_SPEC_VERSION)}`);
  lines.push('---');
  lines.push('');
  lines.push('# Board wiki');
  lines.push('');
  if (pages.length === 0) {
    lines.push('This board has no wiki pages.');
  } else {
    for (const page of pages) {
      lines.push(`- [${page.title}](/${boardWikiOkfFilename(page.slug)})`);
    }
  }
  lines.push('');
  return lines.join('\n');
}
