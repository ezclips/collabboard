# drawing-slide-mode-custom-posts-audit.md

## ROLE

You are working inside an existing production React / Next.js / Tailwind / Supabase codebase with a complex collaborative canvas system that integrates Excalidraw.

Act as a senior frontend engineer with strict audit-first discipline.

This document captures the **audit only** for the issue:

> Custom left-toolbar posts are NOT included in slide / presentation mode.

No fixes are implemented here.

---

## GOAL

Identify **why custom posts (padlets)** created via the left toolbar are **not included in slide/presentation mode**, while native Excalidraw elements are.

---

## CRITICAL RULE (DO NOT BREAK)

This audit is **NOT fully proven from code yet**.

- This is a **high-confidence architectural hypothesis**
- NOT a fully verified root cause from runtime + code trace
- DO NOT implement based only on this document
- MUST run a **real audit of presentation element collection logic before patching**

---

## KNOWN CONTEXT

### Drawing system
- Built on **Excalidraw**
- Uses **embeddables** for padlets
- Padlets linked via:
  - `el.type === "embeddable"`
  - `el.link === "padlet://<padlet.id>"`

### Presentation system
- Uses Excalidraw **frames / scene elements**
- Likely collects elements via:
  - scene traversal
  - frame grouping
  - Excalidraw API

### Observed behavior
- Native Excalidraw elements (shapes, text, etc.) appear in slides
- Custom padlet posts (left toolbar) do NOT appear

---

## FILES (LIKELY INVOLVED — NOT VERIFIED)

| File | Responsibility |
|------|----------------|
| DrawingLayout.tsx | drawing orchestration, presentation trigger |
| ExcalidrawWrapper.tsx | Excalidraw mount |
| CanvasClient.tsx | layout + state orchestration |
| presentation / slide logic | collects elements for slides |
| padlet ↔ embeddable mapping logic | linking layer |

---

## FINDINGS (ARCHITECTURAL — NOT FULLY VERIFIED)

### 1. Two parallel systems exist

#### A. Native Excalidraw elements
- Stored in Excalidraw scene
- Managed internally by Excalidraw
- Included automatically in:
  - frame logic
  - export
  - presentation traversal

#### B. Custom padlet posts
- Stored in app state (Supabase / React)
- Represented in drawing via:
  - embeddables (`type === "embeddable"`)
  - `link = "padlet://<id>"`
- Rendered via custom components

---

### 2. Presentation likely operates on scene elements only

- Slide/presentation mode appears to:
  - traverse Excalidraw scene
  - group by frames

- It includes:
  - shapes
  - text
  - lines
  - images
  - frames

- It likely does NOT include:
  - external app state objects
  - unless explicitly handled

---

### 3. Embeddables may be excluded from presentation traversal

Possible (NOT PROVEN):
- presentation logic filters element types
- embeddables are ignored or skipped
- no explicit handling of:
  - `type === "embeddable"`
  - `padlet://` links

---

### 4. Missing integration bridge (HYPOTHESIS)

There is likely no layer that:
- detects embeddables
- resolves `padlet://id`
- injects padlet data into slide rendering

---

## CURRENT WORKING HYPOTHESIS (NOT FINAL ROOT CAUSE)

> Presentation mode likely only processes native Excalidraw scene elements, and embeddables linked to padlets are not explicitly included in that collection logic.

---

## WHAT MUST BE VERIFIED NEXT (MANDATORY)

Before ANY patch:

1. Locate presentation element collection logic
2. Confirm:
   - where elements are gathered
   - whether embeddables are included/excluded
3. Log:
   - elements passed into presentation
   - presence/absence of embeddables
4. Check:
   - frame traversal logic
   - element filtering conditions
5. Verify:
   - whether `type === "embeddable"` is ignored

---

## PATCH TARGET (DO NOT IMPLEMENT YET)

Will likely involve:

- extending presentation element collection
- including:
  - `el.type === "embeddable"`
  - `el.link.startsWith("padlet://")`
- resolving padlet data
- rendering padlets in slide mode

BUT:
→ Only after real audit confirms this path

---

## GUARDRails

Do NOT:
- modify Excalidraw internals
- break frame logic
- change scene ordering
- affect Freeform system
- change padlet storage model

Must preserve:
- existing presentation behavior for native elements
- existing padlet rendering in canvas
- performance of slide mode

---

## STATUS

- Root cause: ❗ NOT fully proven
- Confidence: High (architecture-based)
- Implementation: NOT STARTED
- Next step: REAL audit of presentation pipeline

---

## Runtime Note (2026-03-30)

Separate from the slide-content audit above, the custom Drawing top-right button cluster was runtime-verified against a live localhost canvas.

- The stable anchor path must stay inside Excalidraw-owned DOM, not app-shell or `CanvasViewport` containers.
- A measured `left` position is now required for the custom cluster because the closed and presentation-open layouts need different visual targets.
- Latest verified runtime measurements:
  - closed at width 1200: stock-toolbar gap `16px`
  - presentation open at width 1200: stock-toolbar gap `110.5px`, sidebar gap `110.5px`
- If this positioning regresses later, verify the live DOM boxes first before changing the anchor or offset logic.
