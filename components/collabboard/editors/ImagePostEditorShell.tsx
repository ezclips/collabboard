'use client';

import React from 'react';
import { createPortal } from 'react-dom';

/**
 * R6I-C2 -- the Image post editor's modal shell.
 *
 * This is the geometry and stacking every Image post editor uses: a portalled
 * backdrop, and a three-column grid whose flanking tracks are both `1fr` so the
 * card never shifts when a side panel opens.
 *
 * PORTALLED FOR A STRUCTURAL REASON, NOT A Z-INDEX ONE (R6C). Callers render
 * from inside CanvasViewport's `isolation: isolate` boundary, which makes the
 * whole canvas subtree paint as ONE atomic layer at z-index:auto among its
 * root-level siblings -- so no z-index asked for in there, 60000 included, can
 * raise it above the Knowledge reader. Only leaving the subtree can. This is
 * what the PDF-area creation modal was missing: it rendered `z-[160]` in place
 * and opened underneath the reader.
 *
 * The tier lives here as a constant so the persisted overlay and the pre-save
 * draft cannot drift apart.
 */

/** The tier every Image post editor paints at, above the docked reader. */
export const IMAGE_POST_EDITOR_OVERLAY_Z_CLASS = 'z-[60000]';

/** The backdrop's full class list. One declaration, both editors. */
export const IMAGE_POST_EDITOR_BACKDROP_CLASS =
  `fixed inset-0 ${IMAGE_POST_EDITOR_OVERLAY_Z_CLASS} flex items-center justify-center bg-black/35 backdrop-blur-sm`;

/**
 * The three-column row. Flanking tracks are equal `1fr`, so opening a panel
 * cannot drag the card sideways (R6E-C1); the row is a definite width because
 * `1fr` needs something to distribute against.
 */
export const IMAGE_POST_EDITOR_GRID_STYLE: React.CSSProperties = {
  gridTemplateColumns: '1fr auto 1fr',
  width: 'calc(100vw - 80px)',
  maxHeight: 'calc(100vh - 80px)',
  pointerEvents: 'none',
};

export interface ImagePostEditorShellProps {
  /** Identifies the surface for tests and for the stacking contract. */
  readonly dataUi: string;
  /** Backdrop dismissal handlers, from the shared useBackdropDismiss. */
  readonly backdropProps?: Record<string, unknown>;
  /** Left track: the vertical Image toolbar. */
  readonly toolbar?: React.ReactNode;
  /** Centre track: the Image card itself. */
  readonly children: React.ReactNode;
  /** Right track: style/emoji/comment panels, when the post exists. */
  readonly panel?: React.ReactNode;
}

export default function ImagePostEditorShell({
  dataUi,
  backdropProps,
  toolbar,
  children,
  panel,
}: ImagePostEditorShellProps) {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className={IMAGE_POST_EDITOR_BACKDROP_CLASS} data-ui={dataUi} {...backdropProps}>
      {/* Grid tracks are pointer-events: none (pure layout, often wider than
          their visible content) with pointer events re-enabled only on the
          actual toolbar/card/panel boxes, so empty grid space still counts as
          a genuine backdrop click. */}
      <div className="relative grid items-start gap-6" style={IMAGE_POST_EDITOR_GRID_STYLE}>
        <div className="flex items-start justify-end" style={{ pointerEvents: 'none' }}>
          <div style={{ pointerEvents: 'auto' }} onClick={(e) => e.stopPropagation()}>
            {toolbar}
          </div>
        </div>

        {children}

        <div className="flex items-start justify-start" style={{ pointerEvents: 'none' }}>
          <div style={{ pointerEvents: 'auto' }} onClick={(e) => e.stopPropagation()}>
            {panel}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
