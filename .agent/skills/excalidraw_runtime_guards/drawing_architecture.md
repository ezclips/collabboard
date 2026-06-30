# Drawing Architecture Contract

## Separation of systems

Freeform:
- uses metadata.zIndex
- DOM layering
- React render order

Drawing:
- uses Excalidraw scene order ONLY
- NO metadata.zIndex
- NO DOM z-index logic

## Embeddables

- Padlets in Drawing are Excalidraw embeddables
- Identified by: el.type === "embeddable"
- Linked via: el.link === `padlet://<id>`

## Ordering

- Source of truth = scene.elements array order
- Reorder must ONLY:
  - affect embeddables
  - preserve all non-embeddables EXACTLY

## Event Routing

Back-plane lines:
- DO NOT receive events directly
- MUST go through DrawingLayout bridge

Bridge responsibilities:
- mousedown
- click
- contextmenu
- dblclick

## Guard Rules

Bridge must bail if:
- tool !== selection
- target !== canvas.excalidraw__canvas
- no back target found

## Forbidden

- DO NOT mix metadata.zIndex into Drawing
- DO NOT reorder DOM for Drawing
- DO NOT modify Excalidraw internals