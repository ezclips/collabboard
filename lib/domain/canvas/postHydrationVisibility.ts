/**
 * ENG-CANVAS-HYDRATION-H1: pure hydration-visibility decision for persisted
 * canvas posts.
 *
 * Previously this policy lived inline in useCanvasData.fetchData() and asked
 * only whether the BODY was meaningful, so a persisted post carrying a real
 * title and a deliberately blank body was discarded during hydration. That is
 * exactly the shape the Knowledge "Create Note from source" flow writes (title
 * is meaningful, body is left blank for the user to author), and a discarded
 * post is also missing from every downstream per-post read.
 *
 * Ghost cleanup is intentionally preserved: a post with neither a title nor a
 * body still does not hydrate. Visibility depends on the persisted post's own
 * text only -- never on layer ordering or any other presentation field.
 */

/** The minimal structural shape the decision needs. Nothing else is readable. */
export interface PersistedCanvasPostVisibilityInput {
  readonly type: string;
  readonly title?: string | null;
  readonly content?: string | null;
}

const GHOSTABLE_POST_TYPES: ReadonlySet<string> = new Set(['note', 'text']);

/** A title is meaningful when it is a string with non-whitespace characters. */
function hasMeaningfulTitle(title: string | null | undefined): boolean {
  return typeof title === 'string' && title.trim().length > 0;
}

/**
 * Unchanged body semantics: strip tags and the two nbsp entities the editors
 * emit, then trim. This is the pre-existing cleanup, moved verbatim.
 */
function hasMeaningfulContent(content: string | null | undefined): boolean {
  if (typeof content !== 'string') return false;
  const stripped = content
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#160;/g, ' ')
    .trim();
  return stripped.length > 0;
}

/**
 * Keep a persisted note/text post when EITHER its title OR its body is
 * meaningful. All other post types hydrate unconditionally, as before.
 */
export function isPersistedCanvasPostVisible(post: PersistedCanvasPostVisibilityInput): boolean {
  if (!GHOSTABLE_POST_TYPES.has(post.type)) return true;
  return hasMeaningfulTitle(post.title) || hasMeaningfulContent(post.content);
}
