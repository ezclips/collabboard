/**
 * PATCH-297 defect 1. A Timeline board auto-creates one blank entry when it
 * opens empty. Live, when that create failed the effect deleted its
 * "attempted" marker, so the next render retried -- 1,672 creates in two
 * minutes, each with an error toast. This helper owns the once-per-board
 * decision so it is testable without mounting the 12k-line CanvasClient.
 */
export interface TimelineAutoInitInput {
  isTimelineLayout: boolean;
  canvasId: string | null | undefined;
  loading: boolean;
  canEdit: boolean;
  rootContainerCount: number;
  attempted: Set<string>;
  createEmptyContainer: () => Promise<boolean>;
  onFailure: () => void;
}

export type TimelineAutoInitOutcome = 'skipped' | 'created' | 'failed';

export const TIMELINE_AUTO_INIT_FAILURE_TOAST =
  'Could not create the first timeline entry. Use + to add one.';

export async function attemptTimelineAutoInitOnce(
  input: TimelineAutoInitInput,
): Promise<TimelineAutoInitOutcome> {
  const { isTimelineLayout, canvasId, loading, canEdit, rootContainerCount, attempted } = input;
  if (!isTimelineLayout || !canvasId || loading || !canEdit) return 'skipped';
  if (attempted.has(canvasId)) return 'skipped';

  // Mark before the async create so a re-render mid-flight cannot double-create.
  attempted.add(canvasId);

  if (rootContainerCount > 0) return 'skipped';

  const created = await input.createEmptyContainer();
  if (!created) {
    // Keep the marker on failure: one attempt per board per page load.
    input.onFailure();
    return 'failed';
  }
  return 'created';
}
