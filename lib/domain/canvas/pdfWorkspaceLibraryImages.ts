import { parseKnowledgePdfAreaProvenance } from '../knowledge/knowledgePdfAreaImagePolicy';
import type { KnowledgePdfAreaProvenance } from '../knowledge/knowledgePdfAreaImagePolicy';
import { resolveLibraryImagePreviewSrc } from './libraryImagePreviewSource';
import type { LibraryImagePreviewSource } from './libraryImagePreviewSource';

/**
 * A strict active-PDF view over the existing durable Library.
 *
 * This selector creates no Library rows, derives no object paths, and never
 * infers from filenames or placements. The durable Knowledge document id in
 * canonical PDF-area provenance is the only source identity.
 */

export interface PdfWorkspaceLibraryImageCandidate extends LibraryImagePreviewSource {
  readonly id: string;
  readonly title?: unknown;
  readonly type?: unknown;
  readonly created_at?: unknown;
  readonly updated_at?: unknown;
  readonly content?: LibraryImagePreviewSource['content'] & {
    readonly title?: unknown;
    readonly content?: unknown;
    readonly type?: unknown;
  };
}

export interface PdfWorkspaceLibraryImage {
  readonly libraryItemId: string;
  readonly title: string;
  readonly previewSrc: string;
  readonly pageNumber: number;
  readonly provenance: KnowledgePdfAreaProvenance;
  readonly createdAt: string;
}

function libraryItemType(item: PdfWorkspaceLibraryImageCandidate): string {
  const raw = item.content?.type ?? item.type;
  return typeof raw === 'string' ? raw.toLowerCase() : '';
}

function displayTitle(item: PdfWorkspaceLibraryImageCandidate): string {
  const topTitle = typeof item.title === 'string' ? item.title.trim() : '';
  if (topTitle) return topTitle;
  const contentTitle = typeof item.content?.title === 'string' ? item.content.title.trim() : '';
  if (contentTitle) return contentTitle;
  return 'Image';
}

function timestamp(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function selectPdfWorkspaceLibraryImages(
  items: Iterable<PdfWorkspaceLibraryImageCandidate>,
  activeDocumentId: string | null | undefined,
): readonly PdfWorkspaceLibraryImage[] {
  if (!activeDocumentId) return [];

  const selected: PdfWorkspaceLibraryImage[] = [];
  for (const item of items) {
    if (libraryItemType(item) !== 'image') continue;
    const provenance = parseKnowledgePdfAreaProvenance(item.content?.metadata ?? null);
    if (provenance === null) continue;
    if (provenance.knowledgeDocumentId !== activeDocumentId) continue;

    const previewSrc = resolveLibraryImagePreviewSrc(item);
    if (previewSrc === null) continue;

    selected.push({
      libraryItemId: item.id,
      title: displayTitle(item),
      previewSrc,
      pageNumber: provenance.pageNumber,
      provenance,
      createdAt: timestamp(item.created_at) || timestamp(item.updated_at),
    });
  }

  return selected.sort((a, b) => (
    a.pageNumber - b.pageNumber
    || a.createdAt.localeCompare(b.createdAt)
    || a.libraryItemId.localeCompare(b.libraryItemId)
  ));
}
