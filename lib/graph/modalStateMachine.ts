/**
 * Strict Modal State Machine to avoid ghosting or guessing what to render.
 */
export type ModalAction =
    | { type: 'OPEN_EDGE_SETTINGS'; payload: { edgeId: string } }
    | { type: 'OPEN_GRAPH_SETTINGS' }
    | { type: 'CLOSE_ALL' };

export interface ModalState {
    activeModal: 'EDGE_SETTINGS' | 'GRAPH_SETTINGS' | 'NONE';
    payload: any | null;
    error: 'UNSUPPORTED_ACTION' | 'INVALID_PAYLOAD' | null;
}

export const initialModalState: ModalState = {
    activeModal: 'NONE',
    payload: null,
    error: null,
};

export function modalReducer(state: ModalState, action: ModalAction): ModalState {
    switch (action.type) {
        case 'OPEN_EDGE_SETTINGS':
            if (!action.payload || typeof action.payload.edgeId !== 'string') {
                console.error("Freeform Graph: INVALID_PAYLOAD for OPEN_EDGE_SETTINGS");
                return { activeModal: 'NONE', payload: null, error: 'INVALID_PAYLOAD' };
            }
            return { activeModal: 'EDGE_SETTINGS', payload: action.payload, error: null };

        case 'OPEN_GRAPH_SETTINGS':
            return { activeModal: 'GRAPH_SETTINGS', payload: null, error: null };

        case 'CLOSE_ALL':
            return { activeModal: 'NONE', payload: null, error: null };

        default:
            console.error("Freeform Graph: UNSUPPORTED_ACTION");
            // Hard reject, no fallback UI ghosting.
            return { activeModal: 'NONE', payload: null, error: 'UNSUPPORTED_ACTION' };
    }
}
