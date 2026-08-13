"use client";

import React from 'react';

// The URL-input + Add-button pair shared by CommentPopup's and
// CommentEditor's Link popovers (PATCH 8AR) -- both wrap this in their own
// positioned container (CommentPopup: an anchored, portaled fixed box;
// CommentEditor: a static absolute box next to the card), so placement,
// portaling, and outer chrome (border/shadow/padding on the wrapping div)
// stay local to each caller. Only the input+button pair itself, which was
// byte-for-byte identical in structure and behavior (just sizing) between
// the two, is shared here. `inputClassName`/`applyButtonClassName` are
// required, not defaulted, so each caller reproduces its own exact
// pre-extraction sizing rather than converging on one look.
interface CommentLinkPopoverProps {
  url: string;
  onUrlChange: (url: string) => void;
  onApply: () => void;
  onCancel: () => void;
  inputClassName: string;
  applyButtonClassName: string;
}

export function CommentLinkPopover({
  url,
  onUrlChange,
  onApply,
  onCancel,
  inputClassName,
  applyButtonClassName,
}: CommentLinkPopoverProps) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="url"
        value={url}
        onChange={(e) => onUrlChange(e.target.value)}
        placeholder="google.com"
        className={inputClassName}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') onApply();
          if (e.key === 'Escape') onCancel();
        }}
      />
      <button onClick={onApply} className={applyButtonClassName}>
        Add
      </button>
    </div>
  );
}
