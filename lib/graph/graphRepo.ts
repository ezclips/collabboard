import { SupabaseClient } from '@supabase/supabase-js';
import type { FreeformGraphEdge, FreeformGraphSettings } from '../../types/graphTypes';

/**
 * Isolated repository for Freeform Graph data operations.
 * Operates strictly on the new tables: freeform_graph_edges, freeform_graph_settings.
 */
export class FreeformGraphRepo {
    private isTableUnavailable = false;

    constructor(private supabase: SupabaseClient, private boardId: string) { }

    private isMissingRelationError(error: unknown): boolean {
        const err = error as { code?: string; message?: string } | null;
        return err?.code === '42P01' || String(err?.message || '').includes('does not exist');
    }

    private normalizeRelationType(value: unknown): FreeformGraphEdge['relation_type'] {
        return value === 'solid' || value === 'dashed' || value === 'dotted' ? value : 'solid';
    }

    private normalizeDirection(value: unknown): FreeformGraphEdge['direction'] {
        return value === 'none' || value === 'forward' || value === 'backward' || value === 'bidirectional'
            ? value
            : 'forward';
    }

    private normalizeLayoutMode(value: unknown): FreeformGraphSettings['layout_mode'] {
        return value === 'auto' || value === 'manual' ? value : 'manual';
    }

    async getEdges(): Promise<FreeformGraphEdge[]> {
        if (this.isTableUnavailable) return [];

        const { data, error } = await this.supabase
            .from('freeform_graph_edges')
            .select('*')
            .eq('board_id', this.boardId);

        if (error && this.isMissingRelationError(error)) {
            this.isTableUnavailable = true;
            console.warn('[FreeformGraphRepo] freeform_graph_edges table unavailable (missing or RLS error):', error);
            return [];
        }
        if (error) throw error;
        console.debug('[FreeformGraphRepo] getEdges returned', (data || []).length, 'edges for board', this.boardId);
        return data || [];
    }

    async getSettings(): Promise<FreeformGraphSettings | null> {
        if (this.isTableUnavailable) return null;

        const { data, error } = await this.supabase
            .from('freeform_graph_settings')
            .select('*')
            .eq('board_id', this.boardId)
            .single();

        if (error && this.isMissingRelationError(error)) {
            this.isTableUnavailable = true;
            return null;
        }
        if (error && error.code !== 'PGRST116') throw error; // PGRST116 is not found
        return data;
    }

    async upsertEdge(edgeData: Partial<FreeformGraphEdge>): Promise<FreeformGraphEdge> {
        if (!edgeData.id) throw new Error("FreeformGraphRepo: upsertEdge requires an id");
        if (!edgeData.board_id) throw new Error("FreeformGraphRepo: upsertEdge requires board_id");

        // Explicit bounds checking
        if (edgeData.relation_type && !['solid', 'dashed', 'dotted'].includes(edgeData.relation_type)) {
            throw new Error(`FreeformGraphRepo: Invalid relation_type ${edgeData.relation_type}`);
        }

        if (this.isTableUnavailable) {
            return {
                id: edgeData.id,
                board_id: edgeData.board_id,
                source_post_id: edgeData.source_post_id || '',
                target_post_id: edgeData.target_post_id || '',
                relation_type: this.normalizeRelationType(edgeData.relation_type),
                direction: this.normalizeDirection(edgeData.direction),
                label: edgeData.label ?? null,
                style: edgeData.style ?? null,
                created_at: edgeData.created_at || new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
        }

        const { data, error } = await this.supabase
            .from('freeform_graph_edges')
            .upsert({ ...edgeData, updated_at: new Date().toISOString() })
            .select()
            .single();

        if (error && this.isMissingRelationError(error)) {
            this.isTableUnavailable = true;
            console.warn('[FreeformGraphRepo] upsertEdge failed - table unavailable. Edge was NOT saved to DB:', error);
            return {
                id: edgeData.id,
                board_id: edgeData.board_id,
                source_post_id: edgeData.source_post_id || '',
                target_post_id: edgeData.target_post_id || '',
                relation_type: this.normalizeRelationType(edgeData.relation_type),
                direction: this.normalizeDirection(edgeData.direction),
                label: edgeData.label ?? null,
                style: edgeData.style ?? null,
                created_at: edgeData.created_at || new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
        }
        if (error) throw error;
        return data;
    }

    async deleteEdge(edgeId: string): Promise<void> {
        if (this.isTableUnavailable) return;

        const { error } = await this.supabase
            .from('freeform_graph_edges')
            .delete()
            .eq('id', edgeId)
            .eq('board_id', this.boardId);

        if (error && this.isMissingRelationError(error)) {
            this.isTableUnavailable = true;
            return;
        }
        if (error) throw error;
    }

    async updateSettings(settings: Partial<FreeformGraphSettings>): Promise<FreeformGraphSettings> {
        if (this.isTableUnavailable) {
            return {
                board_id: this.boardId,
                layout_mode: this.normalizeLayoutMode(settings.layout_mode),
                focus_node_id: settings.focus_node_id ?? null,
                show_minimap: settings.show_minimap ?? false,
                snap_strength: settings.snap_strength ?? 0.5,
                updated_at: new Date().toISOString(),
            };
        }

        const { data, error } = await this.supabase
            .from('freeform_graph_settings')
            .upsert({
                board_id: this.boardId,
                ...settings,
                updated_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error && this.isMissingRelationError(error)) {
            this.isTableUnavailable = true;
            return {
                board_id: this.boardId,
                layout_mode: this.normalizeLayoutMode(settings.layout_mode),
                focus_node_id: settings.focus_node_id ?? null,
                show_minimap: settings.show_minimap ?? false,
                snap_strength: settings.snap_strength ?? 0.5,
                updated_at: new Date().toISOString(),
            };
        }
        if (error) throw error;
        return data;
    }
}
