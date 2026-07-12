import { createBrowserSupabaseClient } from './browserClient';

/**
 * PATCH-042: narrow raw-passthrough wrappers for the canvas hook's four
 * legacy padlets-table raw operations plus the drawing-layout dynamic
 * update statement. All calls run on the STANDARD cookie/browser client -
 * the same client-component singleton the hook previously used (the
 * PATCH-025 identity fact).
 *
 * DELIBERATE house-style exception (same ruling as workspaceMembers.ts /
 * legacyToken.ts / passwordSecurity.ts): these return RAW supabase shapes,
 * not Result - the ~25 CanvasClient call sites (and one JSX prop receiver)
 * destructure `{ data, error }` directly through useCanvasData's unchanged
 * return surface, and a behavior-preserving extraction must not translate
 * them. Rows and update payloads pass through verbatim - the table is the
 * shape's only validator, exactly as before (the PATCH-029 insert fact,
 * extended to the dynamic update).
 *
 * SHRINK-ONLY: do not add consumers beyond useCanvasData.ts. Each function
 * dies when its CanvasClient consumers are extracted onto canvas commands -
 * lib/domain/canvas/posts.ts remains the ONLY surface for new callers.
 * PATCH-049: deletePostRowById retired (its three CanvasClient consumers
 * moved onto canvas.deletePost) - the module's first export death.
 */

export function insertPostRow(row: object) {
    return createBrowserSupabaseClient().from('padlets').insert(row);
}

export function insertPostRowReturning(row: object) {
    return createBrowserSupabaseClient()
        .from('padlets')
        .insert(row)
        .select()
        .single();
}

export function updatePostRowById(id: string, fields: object) {
    return createBrowserSupabaseClient()
        .from('padlets')
        .update(fields)
        .eq('id', id);
}

