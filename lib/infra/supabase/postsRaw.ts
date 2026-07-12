import { createBrowserSupabaseClient } from './browserClient';

/**
 * PATCH-042: narrow raw-passthrough wrappers for the canvas hook's legacy
 * padlets-table operations. All calls run on the STANDARD cookie/browser
 * client - the same client-component singleton the hook previously used (the
 * PATCH-025 identity fact).
 *
 * DELIBERATE house-style exception (same ruling as workspaceMembers.ts /
 * legacyToken.ts / passwordSecurity.ts): this returns a RAW supabase shape,
 * not Result - its remaining CanvasClient and CanvasModals consumers keep
 * their `{ data, error }` contracts until their own slices. Fields pass
 * through verbatim - the table is the shape's only validator, exactly as
 * before (the PATCH-029 insert fact, extended to the dynamic update).
 *
 * SHRINK-ONLY: do not add consumers beyond useCanvasData.ts. Each function
 * dies when its CanvasClient consumers are extracted onto canvas commands -
 * lib/domain/canvas/posts.ts remains the ONLY surface for new callers.
 * PATCH-049: deletePostRowById retired - the module's first export death.
 * PATCH-050: insertPostRowReturning retired - the second export death.
 * PATCH-051: insertPostRow retired - the third export death.
 */

export function updatePostRowById(id: string, fields: object) {
    return createBrowserSupabaseClient()
        .from('padlets')
        .update(fields)
        .eq('id', id);
}
