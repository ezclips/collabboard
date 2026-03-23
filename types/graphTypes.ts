import type { Padlet } from './collabboard';

export type FreeformEdgeRelationType = 'solid' | 'dashed' | 'dotted';
export type FreeformEdgeDirection = 'none' | 'forward' | 'backward' | 'bidirectional';

export interface FreeformGraphEdge {
    id: string;
    board_id: string;
    source_post_id: string;
    target_post_id: string;
    relation_type: FreeformEdgeRelationType;
    direction: FreeformEdgeDirection;
    label: string | null;
    style: any | null; // Custom style (color, width, etc.)
    created_at: string;
    updated_at: string;
}

export interface FreeformGraphSettings {
    board_id: string;
    layout_mode: 'manual' | 'auto';
    focus_node_id: string | null;
    show_minimap: boolean;
    snap_strength: number;
    updated_at: string;
}

// Runtime type guards for strict execution
export function isFreeformGraphEdge(obj: any): obj is FreeformGraphEdge {
    return (
        obj !== null &&
        typeof obj === 'object' &&
        typeof obj.id === 'string' &&
        typeof obj.board_id === 'string' &&
        typeof obj.source_post_id === 'string' &&
        typeof obj.target_post_id === 'string'
    );
}

export function isFreeformGraphSettings(obj: any): obj is FreeformGraphSettings {
    return (
        obj !== null &&
        typeof obj === 'object' &&
        typeof obj.board_id === 'string' &&
        (obj.layout_mode === 'manual' || obj.layout_mode === 'auto')
    );
}
