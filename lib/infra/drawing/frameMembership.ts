export interface FrameLikeBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface FrameCandidate extends FrameLikeBounds {
  readonly id: string;
}

export interface ElementFrameState extends FrameLikeBounds {
  readonly frameId: string | null | undefined;
}

export interface FrameMembershipResult {
  readonly frameId: string | null;
  readonly viaFallback: boolean;
}

/**
 * Resolves explicit membership first, otherwise uses strict center-point
 * containment. Overlapping frames use their input array order as the tie-break.
 */
export function resolveFrameMembership(
  element: ElementFrameState,
  frames: readonly FrameCandidate[],
): FrameMembershipResult {
  if (element.frameId !== null && element.frameId !== undefined) {
    return { frameId: element.frameId, viaFallback: false };
  }

  const centerX = element.x + element.width / 2;
  const centerY = element.y + element.height / 2;
  const matchingFrame = frames.find((frame) =>
    centerX > frame.x
    && centerX < frame.x + frame.width
    && centerY > frame.y
    && centerY < frame.y + frame.height,
  );

  return matchingFrame
    ? { frameId: matchingFrame.id, viaFallback: true }
    : { frameId: null, viaFallback: false };
}
