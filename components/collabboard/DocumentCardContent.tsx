"use client";

import React, { useLayoutEffect, useRef, useState } from 'react';

interface DocumentCardContentProps {
  // Pre-sanitized HTML. Omit to render only the overlay button (CardPreview
  // already renders its own preview body beneath it).
  content?: string;
  // Presentation-only; mirrors PostCardContent's default-branch fallback (§29.6/§30.4).
  textColor?: string | null;
  // Presence-gated AND overflow-gated: no handler -> no button; a handler
  // with content that fits inside the clamp -> no button either (PATCH-152
  // targeted correction). Capability is decided entirely by the caller's
  // routing, never here -- this component only measures rendered overflow.
  onRead?: () => void;
  className?: string;
}

// PATCH-149B1b-iii §27.4: the single shared Document "Read" affordance --
// CardPreview and PostCardContent both delegate here so the button has one
// implementation (PATCH-149 §27 NC9). Owns no capability, routing, predicate
// or persistence logic.
//
// PATCH-152 targeted correction: Read is no longer shown merely because a
// handler is present -- it only appears when the clamped preview actually
// overflows its available area (real scrollHeight > clientHeight measured
// after render), so short Documents never show a Read button.
export default function DocumentCardContent({ content, textColor, onRead, className }: DocumentCardContentProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) { setIsOverflowing(false); return; }
    setIsOverflowing(el.scrollHeight > el.clientHeight);
  }, [content]);

  return (
    <>
      {content !== undefined && (
        <div className="select-none pointer-events-none">
          <div
            ref={bodyRef}
            className="text-xs prose prose-sm break-words tiptap"
            style={{
              wordWrap: 'break-word',
              overflowWrap: 'break-word',
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 12,
              WebkitBoxOrient: 'vertical',
              color: textColor || '#1F2937',
            }}
            dangerouslySetInnerHTML={{ __html: content }}
          />
        </div>
      )}
      {onRead && isOverflowing && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRead(); }}
          aria-label="Read document"
          className={
            className ||
            'absolute inset-x-2 bottom-2 z-20 rounded-md bg-black/40 hover:bg-black/60 focus-visible:bg-black/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition-colors pointer-events-auto'
          }
        >
          Read
        </button>
      )}
    </>
  );
}
