/**
 * PATCH-301 Addendum 3. The `?template=` request, parked in sessionStorage so
 * it survives a remount (React Strict Mode runs mount effects twice) and the
 * Timeline auto-init's window. The value is JSON `{ id, state }`: `state` is
 * `pending` until the apply starts, then `applying`, so a remount mid-apply
 * can tell "not yet applied" from "already applying" and never apply twice.
 * Every storage access is guarded.
 */
export type BoardTemplateRequestState = 'pending' | 'applying';

export interface BoardTemplateRequest {
  id: string;
  state: BoardTemplateRequestState;
}

function requestKey(boardId: string): string {
  return `board-template-request:${boardId}`;
}

export function readBoardTemplateRequest(boardId: string): BoardTemplateRequest | null {
  try {
    const raw = window.sessionStorage.getItem(requestKey(boardId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BoardTemplateRequest> | null;
    if (
      !parsed ||
      typeof parsed.id !== 'string' ||
      (parsed.state !== 'pending' && parsed.state !== 'applying')
    ) {
      return null;
    }
    return { id: parsed.id, state: parsed.state };
  } catch {
    return null;
  }
}

export function writeBoardTemplateRequest(
  boardId: string,
  id: string,
  state: BoardTemplateRequestState = 'pending',
): void {
  try {
    window.sessionStorage.setItem(requestKey(boardId), JSON.stringify({ id, state }));
  } catch {
    // Without storage the request cannot survive; the URL is still stripped.
  }
}

export function clearBoardTemplateRequest(boardId: string): void {
  try {
    window.sessionStorage.removeItem(requestKey(boardId));
  } catch {
    // Without storage there is nothing to clear.
  }
}

/**
 * True while a request is parked for this board, or while the current URL still
 * carries a `template` param (the brief window before the picker strips it).
 */
export function hasBoardTemplateRequest(boardId: string): boolean {
  if (readBoardTemplateRequest(boardId) !== null) return true;
  try {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).has('template');
  } catch {
    return false;
  }
}
