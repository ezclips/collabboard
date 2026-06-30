# GLOBAL RUNTIME GUARDRAILS (ALWAYS APPLY)

These rules MUST be included in EVERY task automatically.

---

## TOP FLOATING BUTTON CLUSTER (CRITICAL)

Do NOT modify anything related to the top floating button cluster.

Includes:
- rightClusterLeftPx
- measurement loops (useLayoutEffect / useEffect)
- .Island.App-toolbar querying
- portal rendering
- anchor resolution (rightClusterAnchorEl, drawingRootRef)
- opacity / visibility logic
- z-index or stacking

Reason:
This system is async, DOM-timing dependent, and extremely fragile.
It has already caused regressions multiple times.

If your change touches this area:
STOP and report.

---

## FREEFORM DOM (CRITICAL)

Do NOT change DOM hierarchy of FreeformPadletCards.

- no wrapper extraction
- no structure movement
- no layout ownership changes

Reason:
Drag, zoom, positioning depend on exact DOM structure.

---

## RUNTIME / EXPORT SPLIT

Do NOT mix:
- runtime slideshow rendering
- export/static rendering

These are separate pipelines.

---

## EXCALIDRAW INTEGRATION

Do NOT:
- modify Excalidraw internals
- rely on DOM z-index
- bypass scene order

---

## GENERAL RULE

If a change touches:
- rendering layers
- portals
- async rendering
- positioning systems

→ Assume HIGH RISK
→ Minimize scope
→ Do not refactor