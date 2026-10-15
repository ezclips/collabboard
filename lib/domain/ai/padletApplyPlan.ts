/**
 * PATCH-372 Addendum 1. The PURE bookkeeping behind Board AI's Apply.
 *
 * WHY IT EXISTS. The first version read the RENDER-TIME `padlets`/`sections`
 * closure for every change, so later changes in one batch never saw earlier
 * ones: three posts dropped into one container all computed the same
 * `childPadletIds`, and eight moves into one column all landed on the same
 * `sectionPosition` (the empty-target branch's 1000). This function keeps a
 * BATCH-LOCAL working copy and computes every position, sibling list and
 * `childPadletIds` from IT -- never from the caller's state.
 *
 * Pure and browser-safe: no clock, no randomness, no I/O. The caller passes
 * `now` and `newId`, and executes the returned writes through its own client
 * functions, so RLS, freeze and guest approval decide exactly as for a manual
 * edit. No deletes exist here.
 */

import { type PadletApplyChangeResult, type PadletProposedChange } from './padletChangeProposals';

/** The minimum a working post needs. A `Padlet` satisfies it. */
export interface PadletApplyPost {
  readonly id: string;
  readonly type: string;
  readonly metadata?: Record<string, unknown> | null;
}

/** The minimum a working section needs. A `BoardSection` satisfies it. */
export interface PadletApplySection {
  /** `board_sections.id` is a BIGINT live; normalised to a string here. */
  readonly id: string | number;
  readonly position?: number | null;
}

export interface PadletApplyPlanOptions {
  readonly boardId: string;
  /** The board's layout, for a `create-panel`'s order key. */
  readonly layout: string;
  /** The timestamp every inserted row carries. */
  readonly now: string;
  /** A fresh row id. Passed in so the plan stays pure. */
  readonly newId: () => string;
}

/**
 * One DB write, tagged with the change it belongs to so the caller can report
 * per-change outcomes and stop the batch at the change that failed.
 */
export type PadletApplyWrite =
  | { readonly changeIndex: number; readonly kind: 'insert-section'; readonly sectionId: string; readonly title: string; readonly position: number }
  | { readonly changeIndex: number; readonly kind: 'insert-post'; readonly row: Record<string, unknown> }
  | { readonly changeIndex: number; readonly kind: 'update-fields'; readonly postId: string; readonly fields: Record<string, unknown> }
  | { readonly changeIndex: number; readonly kind: 'update-metadata'; readonly postId: string; readonly metadata: Record<string, unknown> };

/** One change's plan outcome, positionally aligned with the input changes. */
export interface PadletApplyChangePlanResult {
  readonly ok: boolean;
  readonly message?: string;
}

export interface PadletApplyPlan {
  /** The writes, in the order they must be executed. */
  readonly writes: readonly PadletApplyWrite[];
  /** One entry per input change. */
  readonly results: readonly PadletApplyChangePlanResult[];
}

const idText = (value: unknown): string => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
};

const numberOf = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

interface WorkingPost {
  readonly id: string;
  readonly type: string;
  metadata: Record<string, unknown>;
}

function childIdsOf(metadata: Record<string, unknown>): string[] {
  const ids = metadata.childPadletIds;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
}

/** The next free `sectionPosition` in one section, from the WORKING copy. */
function nextSectionPosition(posts: readonly WorkingPost[], sectionId: string, excludeId?: string): number {
  const siblings = posts.filter((post) => (
    idText(post.metadata.sectionId) === sectionId
    && !idText(post.metadata.parentId)
    && post.id !== excludeId
  ));
  return siblings.reduce((max, post) => Math.max(max, numberOf(post.metadata.sectionPosition) ?? 0), -1) + 1;
}

/**
 * The ordered DB writes for a batch of approved changes, computed from a
 * working copy of the board.
 */
export function planPadletApply(
  changes: readonly PadletProposedChange[],
  posts: readonly PadletApplyPost[],
  sections: readonly PadletApplySection[],
  options: PadletApplyPlanOptions,
): PadletApplyPlan {
  const writes: PadletApplyWrite[] = [];
  const results: PadletApplyChangePlanResult[] = [];

  // The batch-local working copy: everything below reads THIS, never the
  // caller's render-time state.
  const workingPosts: WorkingPost[] = posts.map((post) => ({
    id: post.id,
    type: post.type,
    metadata: { ...(post.metadata ?? {}) },
  }));
  const workingSections = sections.map((section) => ({
    id: idText(section.id),
    position: numberOf(section.position) ?? 0,
  }));
  // The panel ids a `create-panel` made in THIS batch, by lower-cased name.
  const createdPanels = new Map<string, string>();

  const panelIdFor = (change: PadletProposedChange): string | null => (
    change.panelId ?? createdPanels.get((change.newPanelName ?? '').toLowerCase()) ?? null
  );
  const findPost = (id: string): WorkingPost | null => workingPosts.find((post) => post.id === id) ?? null;
  const findSection = (id: string) => workingSections.find((section) => section.id === id) ?? null;

  for (let changeIndex = 0; changeIndex < changes.length; changeIndex += 1) {
    const change = changes[changeIndex];
    const ok = (): void => { results.push({ ok: true }); };
    const fail = (message: string): void => { results.push({ ok: false, message }); };

    if (change.kind === 'create-panel') {
      const name = change.newPanelName ?? '';
      if (!name) { fail('Could not create the panel'); continue; }
      if (change.panelKind === 'section') {
        const position = workingSections.length > 0
          ? Math.max(...workingSections.map((section) => section.position)) + 1
          : 0;
        // `board_sections.id` is DB-assigned, so the plan invents a placeholder
        // id here and every later write in the batch references THAT. The
        // executor maps placeholder -> real id (see `executePadletApplyPlan`).
        const id = options.newId();
        writes.push({ changeIndex, kind: 'insert-section', sectionId: id, title: name, position });
        workingSections.push({ id, position });
        createdPanels.set(name.toLowerCase(), id);
      } else {
        const orderKey = options.layout === 'timeline' ? 'position_in_timeline' : 'wallPosition';
        const roots = workingPosts.filter((post) => post.type === 'container' && !idText(post.metadata.parentId));
        const nextOrder = roots.reduce((max, post) => Math.max(max, numberOf(post.metadata[orderKey]) ?? -1), -1) + 1;
        const id = options.newId();
        const metadata: Record<string, unknown> = {
          childPadletIds: [],
          kind: 'container',
          isContainer: true,
          [orderKey]: nextOrder,
        };
        writes.push({
          changeIndex,
          kind: 'insert-post',
          row: {
            id,
            board_id: options.boardId,
            title: name,
            content: '',
            type: 'container',
            position_x: 0,
            position_y: 0,
            width: 280,
            height: 200,
            created_at: options.now,
            updated_at: options.now,
            metadata,
          },
        });
        workingPosts.push({ id, type: 'container', metadata });
        createdPanels.set(name.toLowerCase(), id);
      }
      ok();
      continue;
    }

    if (change.kind === 'create') {
      const panelId = panelIdFor(change);
      const title = change.title;
      if (!panelId || !title) { fail('Could not find the panel'); continue; }
      const section = findSection(panelId);
      if (section) {
        const id = options.newId();
        const metadata: Record<string, unknown> = {
          sectionId: section.id,
          sectionPosition: nextSectionPosition(workingPosts, section.id),
        };
        writes.push({
          changeIndex,
          kind: 'insert-post',
          row: {
            id,
            board_id: options.boardId,
            title,
            content: change.text ?? '',
            type: 'text',
            position_x: 0,
            position_y: 0,
            width: 280,
            height: 280,
            created_at: options.now,
            updated_at: options.now,
            metadata,
          },
        });
        workingPosts.push({ id, type: 'text', metadata });
      } else {
        const container = findPost(panelId);
        if (!container || container.type !== 'container') { fail('Could not find the panel'); continue; }
        const id = options.newId();
        writes.push({
          changeIndex,
          kind: 'insert-post',
          row: {
            id,
            board_id: options.boardId,
            title,
            content: change.text ?? '',
            type: 'text',
            position_x: 0,
            position_y: 0,
            width: 300,
            height: 200,
            created_at: options.now,
            updated_at: options.now,
            metadata: { parentId: container.id },
          },
        });
        workingPosts.push({ id, type: 'text', metadata: { parentId: container.id } });
        // The container's childPadletIds grows by ONE per create, from the
        // WORKING value -- the whole point of this module.
        const metadata = { ...container.metadata, childPadletIds: [...childIdsOf(container.metadata), id] };
        writes.push({ changeIndex, kind: 'update-metadata', postId: container.id, metadata });
        container.metadata = metadata;
      }
      ok();
      continue;
    }

    if (change.kind === 'update') {
      const post = change.postId ? findPost(change.postId) : null;
      if (!post) { fail('Could not find the post'); continue; }
      const fields: Record<string, unknown> = {};
      if (change.title !== undefined) fields.title = change.title;
      if (change.text !== undefined) fields.content = change.text;
      writes.push({ changeIndex, kind: 'update-fields', postId: post.id, fields });
      ok();
      continue;
    }

    // move
    const post = change.postId ? findPost(change.postId) : null;
    const panelId = panelIdFor(change);
    if (!post || !panelId) { fail('Could not find the post'); continue; }
    const section = findSection(panelId);
    if (section) {
      // Out of any container it was in, from the WORKING childPadletIds.
      const oldParentId = idText(post.metadata.parentId);
      if (oldParentId) {
        const oldContainer = findPost(oldParentId);
        if (oldContainer) {
          const metadata = {
            ...oldContainer.metadata,
            childPadletIds: childIdsOf(oldContainer.metadata).filter((id) => id !== post.id),
          };
          writes.push({ changeIndex, kind: 'update-metadata', postId: oldContainer.id, metadata });
          oldContainer.metadata = metadata;
        }
      }
      const metadata: Record<string, unknown> = {
        ...post.metadata,
        sectionId: section.id,
        sectionPosition: nextSectionPosition(workingPosts, section.id, post.id),
      };
      delete metadata.parentId;
      writes.push({ changeIndex, kind: 'update-metadata', postId: post.id, metadata });
      post.metadata = metadata;
      ok();
      continue;
    }

    const container = findPost(panelId);
    if (!container || container.type !== 'container') { fail('Could not find the panel'); continue; }
    const oldParentId = idText(post.metadata.parentId);
    if (oldParentId && oldParentId !== container.id) {
      const oldContainer = findPost(oldParentId);
      if (oldContainer) {
        const metadata = {
          ...oldContainer.metadata,
          childPadletIds: childIdsOf(oldContainer.metadata).filter((id) => id !== post.id),
        };
        writes.push({ changeIndex, kind: 'update-metadata', postId: oldContainer.id, metadata });
        oldContainer.metadata = metadata;
      }
    }
    if (!childIdsOf(container.metadata).includes(post.id)) {
      const metadata = { ...container.metadata, childPadletIds: [...childIdsOf(container.metadata), post.id] };
      writes.push({ changeIndex, kind: 'update-metadata', postId: container.id, metadata });
      container.metadata = metadata;
    }
    const metadata = { ...post.metadata, parentId: container.id };
    writes.push({ changeIndex, kind: 'update-metadata', postId: post.id, metadata });
    post.metadata = metadata;
    ok();
  }

  return { writes, results };
}

/**
 * Rewrites a write's section reference through a placeholder -> real id map.
 *
 * `board_sections.id` is DB-assigned (a BIGINT), so an `insert-section` write
 * carries a placeholder id the plan invented and later writes reference it. A
 * write whose `sectionId` is a key in the map is rewritten to the id the INSERT
 * returned; anything else is returned unchanged. Pure -- returns a new write.
 */
export function remapSectionIds(
  write: PadletApplyWrite,
  sectionIds: ReadonlyMap<string, string>,
): PadletApplyWrite {
  if (sectionIds.size === 0) return write;
  if (write.kind === 'insert-post') {
    const metadata = write.row.metadata as Record<string, unknown> | undefined;
    const sectionId = metadata?.sectionId;
    if (typeof sectionId === 'string' && sectionIds.has(sectionId)) {
      return { ...write, row: { ...write.row, metadata: { ...metadata, sectionId: sectionIds.get(sectionId) } } };
    }
    return write;
  }
  if (write.kind === 'update-metadata') {
    const sectionId = write.metadata.sectionId;
    if (typeof sectionId === 'string' && sectionIds.has(sectionId)) {
      return { ...write, metadata: { ...write.metadata, sectionId: sectionIds.get(sectionId) } };
    }
    return write;
  }
  return write;
}

/**
 * The I/O the executor needs, injected so the loop itself stays pure and
 * testable. Each method is the SAME client path a manual edit uses.
 */
export interface PadletApplySink {
  /** Creates a section; returns its DB-assigned id, or null on failure. */
  insertSection: (input: { readonly placeholderId: string; readonly title: string; readonly position: number }) => Promise<string | null>;
  insertPost: (row: Record<string, unknown>) => Promise<void>;
  updateFields: (postId: string, fields: Record<string, unknown>) => Promise<void>;
  updateMetadata: (postId: string, metadata: Record<string, unknown>) => Promise<void>;
  /** A write threw: converge the caller's optimistic state on the server's. */
  onFailure?: (error: unknown) => void;
}

/**
 * Runs a plan's writes IN ORDER through the sink, mapping each `insert-section`
 * write's placeholder id to the real one the INSERT returned and rewriting
 * every later write's `sectionId` through that map. A failure STOPS the batch;
 * the returned array is positionally aligned with the plan's changes.
 */
export async function executePadletApplyPlan(
  plan: PadletApplyPlan,
  sink: PadletApplySink,
): Promise<readonly PadletApplyChangeResult[]> {
  const sectionIds = new Map<string, string>();
  const results: PadletApplyChangeResult[] = [];
  for (let index = 0; index < plan.results.length; index += 1) {
    const planned = plan.results[index];
    if (!planned.ok) {
      results.push({ ok: false, message: planned.message });
      break;
    }
    try {
      for (const write of plan.writes) {
        if (write.changeIndex !== index) continue;
        if (write.kind === 'insert-section') {
          const realId = await sink.insertSection({
            placeholderId: write.sectionId,
            title: write.title,
            position: write.position,
          });
          if (realId) sectionIds.set(write.sectionId, realId);
          continue;
        }
        const effective = remapSectionIds(write, sectionIds);
        if (effective.kind === 'insert-post') {
          await sink.insertPost(effective.row);
        } else if (effective.kind === 'update-fields') {
          await sink.updateFields(effective.postId, effective.fields);
        } else if (effective.kind === 'update-metadata') {
          await sink.updateMetadata(effective.postId, effective.metadata);
        }
      }
    } catch (error) {
      sink.onFailure?.(error);
      results.push({ ok: false, message: 'Could not apply this change' });
      break;
    }
    results.push({ ok: true });
  }
  return results;
}
