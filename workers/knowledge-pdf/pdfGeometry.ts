import type { KnowledgePageGeometryInput } from '../../lib/domain/knowledge/knowledgeExtraction';

export interface PdfGeometryPage {
  readonly rotate: number;
  getViewport(options: { readonly scale: number; readonly rotation: number; readonly dontFlip?: boolean }): {
    readonly width: number;
    readonly height: number;
  };
}

export interface PdfGeometryDocument {
  readonly numPages: number;
  getPage(pageNumber: number): Promise<PdfGeometryPage>;
  destroy(): Promise<void>;
}

export type PdfGeometryLoader = (bytes: Uint8Array) => Promise<PdfGeometryDocument>;

/**
 * PDF.js is used only for page geometry.  Width and height are the canonical
 * source-page dimensions at rotation=0; the page's rotation is stored
 * separately.  This keeps OpenDataLoader's bottom-left source bboxes in the
 * same coordinate space and leaves viewer rotation as a separate transform.
 */
export async function extractPdfPageGeometry(
  bytes: Uint8Array,
  loadDocument: PdfGeometryLoader = loadWithPdfJs,
): Promise<readonly KnowledgePageGeometryInput[]> {
  const document = await loadDocument(bytes);
  try {
    const geometry: KnowledgePageGeometryInput[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1, rotation: 0, dontFlip: true });
      const rotation = normalizeRotation(page.rotate);

      if (
        !Number.isFinite(viewport.width) ||
        !Number.isFinite(viewport.height) ||
        viewport.width <= 0 ||
        viewport.height <= 0
      ) {
        throw new Error(`PDF.js returned invalid geometry for page ${pageNumber}`);
      }

      geometry.push({
        pageNumber,
        widthPoints: viewport.width,
        heightPoints: viewport.height,
        rotation,
      });
    }
    return geometry;
  } finally {
    await document.destroy();
  }
}

export function normalizeRotation(rotation: number): 0 | 90 | 180 | 270 {
  if (!Number.isFinite(rotation)) throw new Error('PDF.js returned an invalid page rotation');
  const normalized = ((Math.round(rotation) % 360) + 360) % 360;
  if (normalized !== 0 && normalized !== 90 && normalized !== 180 && normalized !== 270) {
    throw new Error(`PDF.js returned unsupported page rotation ${rotation}`);
  }
  return normalized;
}

async function loadWithPdfJs(bytes: Uint8Array): Promise<PdfGeometryDocument> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = getDocument({
    data: bytes,
    isEvalSupported: false,
    useSystemFonts: false,
  });
  return (await loadingTask.promise) as unknown as PdfGeometryDocument;
}
