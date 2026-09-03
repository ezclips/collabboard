import type { KnowledgeSourceAreaClipPayload } from '../../domain/knowledge/knowledgeSourceClipPayload';

/**
 * R6B -- the browser's one way to turn a dropped area clip into a card.
 *
 * It sends IDENTITY, A RECTANGLE AND A PLACEMENT. It does not read the PDF, it
 * does not rasterise anything, and it never uploads image bytes: the server
 * crops from its own stored page derivative, which is what keeps the crop as
 * private as the document and keeps the client from becoming a second, weaker
 * source of truth about what a page contains.
 */

/**
 * Where the card lands, and nothing else. Its SIZE is deliberately absent: the
 * server derives that from the persisted page geometry, so a crop is never
 * stretched to a shape the browser guessed.
 */
export interface KnowledgePdfAreaImagePlacement {
  readonly positionX: number;
  readonly positionY: number;
}

export type KnowledgePdfAreaImageResult =
  | { readonly ok: true; readonly padlet: Record<string, unknown> }
  | { readonly ok: false; readonly status: number | null };

export function knowledgePdfAreaImageEndpoint(boardId: string): string {
  return `/api/boards/${encodeURIComponent(boardId)}/knowledge/area-image`;
}

export async function requestKnowledgePdfAreaImage(
  boardId: string,
  payload: KnowledgeSourceAreaClipPayload,
  placement: KnowledgePdfAreaImagePlacement,
  fetchImpl: typeof fetch = fetch,
): Promise<KnowledgePdfAreaImageResult> {
  let response: Response;
  try {
    response = await fetchImpl(knowledgePdfAreaImageEndpoint(boardId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Field by field, never a spread of the payload: the request body is a
      // contract, not a passthrough for whatever a transfer happened to carry.
      body: JSON.stringify({
        knowledgeDocumentId: payload.sourceDocumentId,
        pageNumber: payload.pageNumber,
        region: payload.region,
        title: payload.originalFilename,
        positionX: placement.positionX,
        positionY: placement.positionY,
      }),
    });
  } catch {
    // A network failure is not a partial creation: nothing was placed.
    return { ok: false, status: null };
  }
  if (!response.ok) return { ok: false, status: response.status };

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, status: response.status };
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, status: response.status };
  }
  const padlet = (body as Record<string, unknown>).padlet;
  if (padlet === null || typeof padlet !== 'object' || Array.isArray(padlet)) {
    return { ok: false, status: response.status };
  }
  return { ok: true, padlet: padlet as Record<string, unknown> };
}
