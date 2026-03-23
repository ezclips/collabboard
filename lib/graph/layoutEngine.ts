import type { Padlet } from '../../types/collabboard';
import type { FreeformGraphEdge } from '../../types/graphTypes';

/**
 * Auto-layout engine for Scrintal-like 'organize' feature.
 * A simple topological sort + horizontal layering for DAGs.
 */
export function organizeGraph(posts: Padlet[], edges: FreeformGraphEdge[]): Padlet[] {
    // If no edges, just return untouched or pack them
    if (edges.length === 0) return posts;

    // Build adjacency list
    const adj: Record<string, string[]> = {};
    const inDegree: Record<string, number> = {};
    posts.forEach(p => {
        adj[p.id] = [];
        inDegree[p.id] = 0;
    });

    edges.forEach(e => {
        if (adj[e.source_post_id] && adj[e.target_post_id]) {
            adj[e.source_post_id].push(e.target_post_id);
            inDegree[e.target_post_id] = (inDegree[e.target_post_id] || 0) + 1;
        }
    });

    // Kahn's algorithm for topological sort and rank assignment
    const queue: string[] = [];
    const rank: Record<string, number> = {};

    posts.forEach(p => {
        if (inDegree[p.id] === 0) {
            queue.push(p.id);
            rank[p.id] = 0;
        }
    });

    const sorted: string[] = [];
    while (queue.length > 0) {
        const curr = queue.shift()!;
        sorted.push(curr);

        for (const neighbor of adj[curr]) {
            // Assign rank strictly increasing
            rank[neighbor] = Math.max(rank[neighbor] || 0, rank[curr] + 1);
            inDegree[neighbor]--;
            if (inDegree[neighbor] === 0) {
                queue.push(neighbor);
            }
        }
    }

    // Handle cycles: posts not in 'sorted' get rank 0
    posts.forEach(p => {
        if (rank[p.id] === undefined) {
            rank[p.id] = 0;
        }
    });

    // Group by rank
    const rankGroups: Record<number, string[]> = {};
    posts.forEach(p => {
        const r = rank[p.id];
        if (!rankGroups[r]) rankGroups[r] = [];
        rankGroups[r].push(p.id);
    });

    // Assign coordinate positions based on rank
    const X_SPACING = 400;
    const Y_SPACING = 300;
    const START_X = 100;
    const START_Y = 100;

    const updatedPosts = posts.map(p => ({ ...p }));

    Object.entries(rankGroups).forEach(([rStr, group]) => {
        const r = parseInt(rStr);
        const x = START_X + r * X_SPACING;

        // Center the group vertically
        const totalHeight = group.length * Y_SPACING;
        let y = START_Y - totalHeight / 2;

        group.forEach(postId => {
            const post = updatedPosts.find(u => u.id === postId);
            if (post) {
                post.position_x = x;
                post.position_y = y;
                y += Y_SPACING;
            }
        });
    });

    return updatedPosts;
}
