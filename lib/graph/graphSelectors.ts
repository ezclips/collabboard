import type { Padlet } from '../../types/collabboard';
import type { FreeformGraphEdge } from '../../types/graphTypes';

/**
 * Selectors map raw graph data into memoizable view models.
 */

export interface GraphRenderNode {
    post: Padlet;
    isFocused: boolean;
    isInNeighborhood: boolean; // connected to focused node
    layer: number; // for z-indexing
}

export function selectRenderNodes(
    allPosts: Padlet[],
    allEdges: FreeformGraphEdge[],
    focusNodeId: string | null
): GraphRenderNode[] {
    // Compute neighborhood
    const neighborhoodIds = new Set<string>();
    if (focusNodeId) {
        neighborhoodIds.add(focusNodeId);
        for (const edge of allEdges) {
            if (edge.source_post_id === focusNodeId) neighborhoodIds.add(edge.target_post_id);
            if (edge.target_post_id === focusNodeId) neighborhoodIds.add(edge.source_post_id);
        }
    }

    return allPosts.map(post => {
        const isFocused = post.id === focusNodeId;
        const isInNeighborhood = neighborhoodIds.has(post.id);

        // Z-index: focused node on top, then neighborhood, then others
        let layer = 0;
        if (isFocused) layer = 3000;
        else if (isInNeighborhood) layer = 2000;
        else if (focusNodeId) layer = 500; // dimly lit layer if something else is focused
        else layer = 1000; // default unobstructed layer

        return {
            post,
            isFocused,
            isInNeighborhood,
            layer
        };
    });
}

/**
 * Filters edges to only those where both source and target are present.
 */
export function selectValidEdges(
    posts: Padlet[],
    edges: FreeformGraphEdge[]
): FreeformGraphEdge[] {
    const postIds = new Set(posts.map(p => p.id));
    return edges.filter(e => postIds.has(e.source_post_id) && postIds.has(e.target_post_id));
}
