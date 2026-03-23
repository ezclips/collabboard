
export const DND_KIND_CONTAINER_MOVE = 'columns-container-move';
export const DND_KIND_POST_MOVE = 'columns-post-move';

export type ColumnDragPayload =
    | { kind: "container"; id: string; fromSectionId: string }
    | { kind: "post"; id: string; fromSectionId: string };

export function encodeDragPayload(payload: ColumnDragPayload): string {
    return JSON.stringify(payload);
}

export function decodeDragPayload(raw: string): ColumnDragPayload | null {
    if (!raw) return null;

    // Try JSON first
    try {
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.kind === 'container' || parsed.kind === 'post') && parsed.id) {
            return parsed;
        }
    } catch (e) {
        // Ignore error, try fallback
    }

    // Fallback: Legacy prefix parsing
    if (raw.startsWith(`${DND_KIND_CONTAINER_MOVE}:`)) {
        const id = raw.slice(`${DND_KIND_CONTAINER_MOVE}:`.length).trim();
        if (id) return { kind: 'container', id, fromSectionId: '' }; // sectionId unknown in legacy
    }

    if (raw.startsWith(`${DND_KIND_POST_MOVE}:`)) {
        const id = raw.slice(`${DND_KIND_POST_MOVE}:`.length).trim();
        if (id) return { kind: 'post', id, fromSectionId: '' };
    }

    return null;
}
