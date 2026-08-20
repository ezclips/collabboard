/**
 * Parser-neutral extraction contract for Knowledge/PDF V1.
 *
 * This file intentionally has no knowledge of a concrete PDF parser, runtime,
 * filesystem, or persistence layer.
 */

export const KNOWLEDGE_PDF_BBOX_COORDINATE_SYSTEM = 'pdf-points-bottom-left' as const;

export type KnowledgePdfElementType =
  | 'paragraph'
  | 'heading'
  | 'list'
  | 'list-item'
  | 'table'
  | 'table-cell'
  | 'caption'
  | 'image'
  | 'formula'
  | 'other';

export interface KnowledgePdfParserIdentity {
  readonly name: string;
  readonly version: string;
  readonly optionsHash?: string;
}

export interface KnowledgeBoundingBox {
  readonly left: number;
  readonly bottom: number;
  readonly right: number;
  readonly top: number;
  readonly coordinateSystem: typeof KNOWLEDGE_PDF_BBOX_COORDINATE_SYSTEM;
}

export interface KnowledgePageGeometry {
  readonly widthPoints: number;
  readonly heightPoints: number;
  readonly rotation?: number;
}

export interface KnowledgeElementMetadata {
  readonly sourceType?: string;
  readonly headingLevel?: number;
  readonly numberingStyle?: string;
  readonly numberOfRows?: number;
  readonly numberOfColumns?: number;
  readonly rowNumber?: number;
  readonly columnNumber?: number;
  readonly rowSpan?: number;
  readonly columnSpan?: number;
  readonly linkedContentSourceElementId?: string;
  readonly previousTableSourceElementId?: string;
  readonly nextTableSourceElementId?: string;
}

export interface KnowledgeExtractedElement {
  /** Parser-local identity retained only as part of provenance. */
  readonly sourceElementId?: string;
  readonly type: KnowledgePdfElementType;
  readonly pageNumber: number;
  readonly text?: string;
  readonly bbox?: KnowledgeBoundingBox;
  /** Reading order within the page, including nested semantic elements. */
  readonly readingOrder?: number;
  readonly metadata?: KnowledgeElementMetadata;
  readonly children?: readonly KnowledgeExtractedElement[];
}

export interface KnowledgeExtractedPage {
  readonly pageNumber: number;
  /** Missing geometry is intentional until a separate geometry source enriches it. */
  readonly widthPoints?: number;
  readonly heightPoints?: number;
  readonly rotation?: number;
  readonly text: string;
  readonly elements: readonly KnowledgeExtractedElement[];
}

export interface KnowledgePdfExtractionResult {
  readonly parser: KnowledgePdfParserIdentity;
  readonly document: {
    readonly contentSha256: string;
    readonly pageCount: number;
    readonly title?: string;
    readonly author?: string;
  };
  readonly pages: readonly KnowledgeExtractedPage[];
  /** True only when every normalized page has supplied width and height. */
  readonly citationReady: boolean;
  readonly rawArtifact?: {
    readonly format: string;
    readonly storageKey?: string;
  };
}
