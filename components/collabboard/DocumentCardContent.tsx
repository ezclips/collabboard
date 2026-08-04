"use client";

import React from 'react';

interface DocumentCardContentProps {
  // Pre-sanitized HTML. Omit to render only the overlay button (CardPreview
  // already renders its own preview body beneath it).
  content?: string;
  // Presence-gated: no handler -> no button (PATCH-149B1b-iii §27.4).
  // Capability is decided entirely by the caller's routing, never here.
  onRead?: () => void;
  className?: string;
}

// PATCH-149B1b-iii §27.4: the single shared Document "Read" affordance --
// CardPreview and PostCardContent both delegate here so the button has one
// implementation (PATCH-149 §27 NC9). Owns no capability, routing, predicate
// or persistence logic.
export default function DocumentCardContent({ content, onRead, className }: DocumentCardContentProps) {
  return (
    <>
      {content !== undefined && (
        <div className="select-none pointer-events-none">
          <div
            className="text-xs prose prose-sm break-words tiptap"
            style={{
              wordWrap: 'break-word',
              overflowWrap: 'break-word',
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 12,
              WebkitBoxOrient: 'vertical',
            }}
            dangerouslySetInnerHTML={{ __html: content }}
          />
        </div>
      )}
      {onRead && (
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
