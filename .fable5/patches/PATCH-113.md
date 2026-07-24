# PATCH-113 — Stacked Padlet-Card Pointer-Event Blocking (Proposal)

**Status:** **PROPOSAL — NOT AUTHORIZED FOR IMPLEMENTATION.** This
document exists to present the diagnosis and fix options for review
before any file scope, interfaces, model assignment, or hard-stops are
bound. No code changes are authorized by this document as written.

---

## 0. Bug report (verbatim intent)

In an external Chrome browser, a comment card's drag handle and Edit
button stop responding when a "New Container" card is visually stacked
close enough above it on the drawing canvas. Moving the container away
restores interaction. Works in the VS Code-hosted browser. Follow-up
testing established: moving the container far enough in **any** of
four directions (up, down-past, left, or right) restores interaction —
not only "up."

## 1. Root cause — confirmed by direct source trace

Three independent, pre-existing facts combine to produce this bug.
None of them are new to this session; none were touched by PATCH-105–112.

**(a) Every padlet-linked embeddable always has `pointer-events: all`.**
`components/collabboard/canvas/excalidraw_fork/packages/excalidraw/components/App.tsx:1699-1709`:
```ts
pointerEvents: (() => {
  const isPadlet = typeof el.link === "string" && el.link.startsWith("padlet://");
  ...
  return (isActive || (isPadlet && !isDrawingLinear && !isDraggingLinearPoint))
    ? POINTER_EVENTS.enabled   // "all"
    : POINTER_EVENTS.disabled; // "none"
})(),
```
Upstream Excalidraw's design is: an embeddable's content sits behind a
click-through "shield" (`pointer-events: none`) unless the user has
explicitly activated it (double-click). This fork adds an unconditional
`isPadlet` OR-branch, so **every** post/container/comment card is fully
interactive at all times, with no shield — a deliberate choice
(presumably so cards are directly clickable without an activation step)
that has this side effect as an unexamined consequence.

**(b) No z-index differentiation between cards.** DOM paint order
follows scene z-order only (`App.tsx:1479`); no explicit `z-index`
exists in `css/styles.scss:785-813`. Whichever card is later in the
scene's z-order paints on top and, per (a), fully owns pointer events
anywhere inside its box — including areas that are visually just its
empty background, not any interactive chrome.

**(c) Container height has no upper bound.**
`components/collabboard/canvas/layouts/DrawingLayout.tsx:524-543`:
```ts
onNaturalHeight={(h) => {
  const stripH = 28;
  const newHeight = Math.max(stripH + 22 + h, 80); // no ceiling
  ...
  excAPI.updateScene({ ...elements with el.height = newHeight... });
}}
```
A `ResizeObserver` feeds a container's real DOM content height
(`scrollHeight`) straight into the Excalidraw scene element's `height`
field, uncapped. Enough wrapped content (e.g. a long run of characters
with no natural break) grows the container's actual scene bounding box
— confirmed via the user's own DevTools inspection showing a real
`324×270` box — large enough to geometrically overlap whatever sits
below it.

**Combined:** the container's box grows into the comment card's space;
because of (a)+(b), the container (if higher in z-order) wins all
pointer events in the overlap region, including the comment's drag
handle and Edit button.

**On the "any of four directions" finding:** this confirms, rather
than complicates, the diagnosis. Two axis-aligned rectangles overlap
only when they overlap on *both* the X-axis and the Y-axis
simultaneously. Moving the container far enough in any single
direction — up, down, left, or right — breaks the overlap on at least
one axis, which is sufficient to end the conflict regardless of which
direction was chosen. This is exactly what a pure rectangle
-intersection model predicts.

**On the Chrome-only aspect:** not confirmed from source. No
Chrome-specific code path exists anywhere in the relevant files. The
most plausible explanation is an environment difference (window size
/zoom between the external browser and the VS Code-hosted one changing
whether the two boxes happen to overlap at all) rather than a genuine
Blink-specific pointer-events divergence — but this needs live
cross-browser testing at matched geometry to confirm, which is out of
scope for a source-only investigation.

## 2. Fix options (bind — choose exactly one before authorization)

### Option A — Narrow: clamp container height growth

Cap the value written in `DrawingLayout.tsx`'s `onNaturalHeight`
handler so a container can never grow past a sane bound (Excalidraw's
existing `overflow: hidden` on its inner wrapper handles the visual
clipping automatically — no other CSS change needed):
```diff
 onNaturalHeight={(h) => {
   const stripH = 28;
-  const newHeight = Math.max(stripH + 22 + h, 80);
+  const MAX_CONTAINER_HEIGHT = 600;
+  const newHeight = Math.min(Math.max(stripH + 22 + h, 80), MAX_CONTAINER_HEIGHT);
```
- **Fixes:** the user's exact reported trigger (unbounded container
  growth from wrapped content).
- **Does not fix:** the underlying always-on-pointer-events/no-shield
  gap (§1a/§1b) shared by every padlet card type. Any other future
  cause of two cards overlapping (manual drag placement, a different
  content type that also auto-grows, a future feature) would reproduce
  the same class of bug.
- **Risk:** low. One function, one file, a numeric clamp. No change to
  the vendored Excalidraw fork. Easy to test, easy to review, easy to
  revert.
- **Effort:** small.

### Option B — Broader: fix the underlying overlap/click-through gap

Restore some form of click-through behavior for the *non-interactive*
background area of an inactive padlet card, so a lower card's
interactive chrome (drag handle, buttons, inputs) can still receive
events through a higher card's empty space — likely via a targeted
`elementsFromPoint`-based re-dispatch at `pointerdown` time, or a more
conservative shield-only-on-background-hit approach, inside the
`isPadlet` branch at `App.tsx:1699-1709`.
- **Fixes:** the general class of problem — any two overlapping padlet
  cards, for any reason, present or future.
- **Does not fix by itself:** the container's unbounded growth (§1c)
  would still be worth capping regardless, as a separate concern (a
  container that can grow to 270px+ tall from one pathological string
  is arguably a UX problem on its own, independent of this bug).
- **Risk:** materially higher. Touches the vendored Excalidraw fork's
  core pointer-events model, shared by every card type (containers,
  comments, posts, images, etc.) and every interaction mode (arrow
  -drawing, linear-point dragging, activation state). Needs much
  broader regression testing — every existing drag/click/activate
  interaction across all card types, not just containers and comments.
  Higher chance of subtle, hard-to-characterize side effects.
- **Effort:** materially larger; would need its own investigation
  -first phase (characterize current click-through/shield behavior
  exhaustively before changing it) matching this session's PATCH-111
  -style discipline, not a same-turn fix.

## 3. Recommendation

**Option A**, for the same reason this session has consistently
preferred the narrowest fix that resolves the proven defect (PATCH-112
itself, PATCH-105–110's incremental scoping): it directly closes the
reported trigger, is low-risk, and doesn't foreclose doing Option B
later as its own separately-investigated, separately-authorized patch
if overlapping-card interaction turns out to be a recurring problem
beyond this one trigger. Recommending Option A does not mean Option B's
concern is dismissed — it's deferred, not rejected, exactly as
PATCH-112 deferred `bridge.ts`'s stale `isEmbeddableInSlideFrame`
reconciliation rather than folding it in.

## 4. What happens next

This document is a proposal only. Once a fix scope is chosen (A, B, or
a modification of either), this file will be rewritten in this
session's standard bound-patch format (exact interfaces/diff, file
scope, safety fences, test matrix, hard-stops, model assignment,
implementation commit message) before any implementation begins. No
code has been written or changed as part of this document.
