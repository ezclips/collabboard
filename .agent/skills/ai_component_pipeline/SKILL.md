---
name: AI Component Pipeline
description: Full reference for the AI content generation, conversion, editing, rendering, and export pipeline. Covers contracts, API routes, validators, renderers, editor modals, canvas action strip, telemetry, enrichers, performance optimizations, CI testing, and all known gotchas.
---

# AI Component Pipeline

## Overview

The AI pipeline lets users generate structured content cards (lesson boards, diagrams, charts, photo cards, workshop boards) from a text prompt. Cards can be edited field-by-field, regenerated with the same or new prompt, converted to a different format (e.g. pie chart → bar chart), and exported as PDF/DOCX/Markdown.

The pipeline has three layers:

1. **Generation/conversion** — Next.js API routes call DeepSeek, validate the JSON response against Zod schemas, inject structural metadata, and return a `StoredAIContent` envelope.
2. **Rendering** — React components in `components/ai/` normalize the envelope and dispatch to the correct renderer.
3. **Canvas integration** — AI cards are padlets with `type: "ai-component"`. They live on the freeform canvas and carry an action strip (Edit → Regen → Convert → Export).

---

## Key File Map

### Contracts & Registry
| File | Purpose |
|---|---|
| `lib/ai/contracts.ts` | All TypeScript types: `AIMode`, `DiagramSubtype`, `StoredAIContent`, `LoadedAIContent`, data shape types for every mode |
| `lib/ai/mode-registry.ts` | `MODE_REGISTRY` — labels, descriptions, placeholders, system prompts, renderer hints, `requiresImages` flag per mode/subtype |
| `lib/ai/validators.ts` | Zod schemas per mode/subtype, `safeValidateAIContentWithSubtypeCheck`, `createValidationError` |
| `lib/ai/conversion-matrix.ts` | `isConversionAllowed`, `getConversionTargets` — defines which mode→mode conversions are permitted |
| `lib/ai/normalize-ai-content.ts` | `normalizeAIContent` — normalises legacy HTML, legacy lesson board, and structured envelopes into a discriminated union |
| `lib/ai/persistence.ts` | `serializeAIContentForPersistence` — converts `StoredAIContent` back to the shape saved in `padlet.metadata` |
| `lib/ai/diagram-engine.ts` | `renderDiagramCode` — singleton Mermaid loader + async render, returns `{ ok, svg }` or `{ ok, reason }` |
| `lib/ai/telemetry.ts` | All `trackAI*` functions — emit structured console events for generation, conversion, classification, rendering, enrichment |

### API Routes
| Route | File | Purpose |
|---|---|---|
| POST `/api/ai/generate-component` | `app/api/ai/generate-component/route.ts` | Classify (if auto) → generate via DeepSeek → inject metadata → validate → enrich images → return `StoredAIContent` |
| POST `/api/ai/convert-component` | `app/api/ai/convert-component/route.ts` | Check conversion allowed → call DeepSeek with source JSON → inject metadata → validate → return `StoredAIContent` |
| POST `/api/ai/classify-intent` | `app/api/ai/classify-intent/route.ts` | Ask DeepSeek to classify the prompt into a mode/subtype with confidence |

### Enrichers
| File | Purpose |
|---|---|
| `lib/ai/enrichers/resolve-images.ts` | `enrichAIContentImages` — for `photo_card` mode, resolves the image query against Unsplash (primary) / Pexels (fallback), uploads result to Supabase Storage, returns updated data with `image.url` |

### Renderers
| File | Handles |
|---|---|
| `components/ai/AIContentRenderer.tsx` | Top-level dispatcher — normalises content, wraps in error boundary, picks renderer |
| `components/ai/renderers/CodeDiagramRenderer.tsx` | `flowchart`, `mindmap` — calls Mermaid, shows SVG or fallback code block |
| `components/ai/renderers/ChartDiagramRenderer.tsx` | `pie_chart`, `bar_chart` — pure SVG, no external deps |
| `components/ai/renderers/TimelineDiagramRenderer.tsx` | `timeline` — vertical timeline |
| `components/ai/renderers/ComparisonDiagramRenderer.tsx` | `comparison` — two-column grid |
| `components/ai/renderers/StructuredLessonBoardRenderer.tsx` | `lesson_board` |
| `components/ai/renderers/WorkshopBoardRenderer.tsx` | `workshop_board` |
| `components/ai/renderers/PhotoCardRenderer.tsx` | `photo` — uses `<img>` (not `next/image`) to avoid hostname config issues |
| `components/ai/renderers/UnsupportedAIContent.tsx` | Fallback for unsupported types, render failures |

### Editor Modals
| File | Purpose |
|---|---|
| `components/collabboard/editors/AIComponentEditor.tsx` | Full generation UI: mode selector, auto classification, prompt, preview, save. Also used as regenerate flow when `lockedMode` is set |
| `components/ai/editors/AIContentEditModal.tsx` | Field-by-field editor for all structured types: code diagram editor, chart data point editor, timeline/comparison/lesson/workshop/photo editors. Includes live preview with 300 ms debounce on diagram code |
| `components/ai/editors/AIContentConvertModal.tsx` | Convert source envelope to a target mode/subtype. Left: target selector + optional instruction. Right: before/after preview split |

### Canvas Integration
| File | Purpose |
|---|---|
| `components/collabboard/canvas/ui/FreeformPadletCards.tsx` | Renders all freeform canvas cards including AI posts. Contains the action strip (Edit → Regen → Convert → Export) shown on hover |
| `components/collabboard/PostCardContent.tsx` | Renders the body of each card type. For `type: "ai-component"`, uses `VisibleAIContent` (IntersectionObserver wrapper) |
| `components/collabboard/AIComponentExportMenu.tsx` | Export dropdown: PDF (html2canvas), DOCX (docx library), Markdown (Turndown), Plain Text |

---

## Data Flow

### Generation
```
User prompt
  → AIComponentEditor.generate()
    → (if auto) POST /api/ai/classify-intent → { mode, subtype, confidence }
    → POST /api/ai/generate-component
        → resolvePromptConfig(mode, subtype)   // system prompt + renderer hint
        → callDeepSeek(finalPrompt)             // raw JSON string
        → parseModelJson(raw)                   // strips code fences
        → injectStructuralMetadata(...)         // adds type/subtype/renderer/title/code
        → safeValidateAIContentWithSubtypeCheck // Zod validation
        → enrichAIContentImages (photo_card)    // Unsplash/Pexels/Supabase Storage
        → return StoredAIContent envelope
  → setContent(envelope)
  → AIContentRenderer renders preview
  → User clicks "Save to Canvas"
  → onSave({ aiPrompt, aiComponentJson })
  → padlet.metadata.savedAIComponent = aiComponentJson
```

### On-canvas rendering path
```
Padlet (type: "ai-component")
  → PostCardContent → VisibleAIContent (IntersectionObserver)
  → AIContentRenderer
  → normalizeAIContent(padlet.metadata)
  → renderStructuredContent(data)
  → [specific renderer]
```

---

## `injectStructuralMetadata` — Critical Context

The DeepSeek model is instructed to return only semantic content fields (code, dataPoints, sections, blocks, etc.). The route owns all structural Zod schema fields:

- `type` — injected from `MODE_TYPE_FIELD[mode]` map (e.g. `photo_card` → `"photo"`)
- `subtype` — injected for diagram mode
- `renderer` — injected from `promptConfig.renderer`
- `title` — fallback derived from subtype/mode name in Title Case if model omits it
- `code` — fallback to original `userPrompt` when `renderer === "diagram_code"` and model omits code field

This prevents the most common class of validation failures (missing structural literals). Any remaining validation failures are genuine content-quality issues.

The function exists in both `generate-component/route.ts` and `convert-component/route.ts` (without the `userPrompt` code-fallback in the convert route, since there's no user-typed raw code).

---

## Validators

`lib/ai/validators.ts` exports `DIAGRAM_SUBTYPE_SCHEMAS` (a map of subtype → Zod schema) and `safeValidateAIContentWithSubtypeCheck`.

`createValidationError(zodError)` returns `{ message: string, issues: Array<{ path, message, code }> }`.

**Important**: When displaying validation errors to the user (`getErrorMessage` in AIComponentEditor), always check `error.issues[0]` before `error.message`. The outer message is the generic "AI content validation failed." — the specific field and reason is in `issues[0]`.

---

## Mode Registry

`lib/ai/mode-registry.ts` contains `MODE_REGISTRY` keyed by `AIMode`.

Each entry has:
- `label`, `description`, `placeholder` — used in the editor UI
- `systemPrompt` — the full prompt sent to DeepSeek
- `renderer` — hint used by `injectStructuralMetadata` (e.g. `"diagram_code"` for flowchart/mindmap)
- `requiresImages` — boolean, true only for `photo_card`

Diagram modes have a nested `subtypes` map with per-subtype `label`, `description`, `placeholder`, `systemPrompt`, `renderer`.

`resolvePromptConfig(mode, subtype)` returns `{ systemPrompt, renderer, mode: config }` — always use this rather than accessing `MODE_REGISTRY` directly.

---

## Conversion Matrix

`lib/ai/conversion-matrix.ts` defines which conversions are allowed. `getConversionTargets(mode, subtype)` returns `ConversionTarget[]`. The Convert button only appears when this returns a non-empty array.

Current allowed conversions are diagram-to-diagram (flowchart ↔ mindmap, pie_chart ↔ bar_chart). Cross-mode conversions (e.g. lesson_board → workshop_board) are not yet enabled.

---

## Renderers — Architecture Notes

### `AIContentRenderer`
- Normalises via `normalizeAIContent` which returns a discriminated union: `legacy_html | legacy_lesson_board | structured | unsupported_structured_version | unknown`
- Wraps output in `AIContentErrorBoundary` (class component) which calls `trackAIRenderFallback` on error
- `CodeDiagramRenderer` is loaded via `next/dynamic({ ssr: false })` to defer Mermaid (~300 kB) from the initial bundle
- Passes `onExportTargetReady` down to register the export DOM anchor

### `CodeDiagramRenderer`
- Uses `lastCodeRef` guard in the `useEffect`: skips Mermaid re-render when `data.code` hasn't changed
- Wrapped in `React.memo` with a custom comparator: `(prev, next) => prev.data.code === next.data.code && prev.data.subtype === next.data.subtype`
- Renders SVG via `dangerouslySetInnerHTML`
- Source code: collapsible `<details>` labeled **"View source"**, auto-collapsed on success, always visible on failure
- Shows a stable `min-h-[300px]` viewport during async render to prevent layout collapse

### All other renderers
All wrapped in `React.memo` (default shallow equality). Pure renders with no side effects.

### `PhotoCardRenderer`
Uses a plain `<img>` tag (not `next/image`) to avoid requiring the Supabase domain to be whitelisted in `next.config.ts`. Header pattern matches other renderers: type label ("photo card") → title → query.

### `UnsupportedAIContent`
Shows `AlertCircle` icon + "AI content unavailable" + message. Used for: unsupported subtypes, render errors caught by the error boundary, unsupported structured versions.

---

## Performance Optimizations (Step 19)

1. **React.memo on all 7 renderers** — prevents re-render on parent state changes that don't affect content
2. **Custom comparator on CodeDiagramRenderer** — only re-renders when `code` or `subtype` changes; prevents expensive Mermaid calls
3. **`lastCodeRef` guard** — belt-and-suspenders: skips the `renderDiagramCode` async call even if React.memo is bypassed
4. **Dynamic import for CodeDiagramRenderer** — splits Mermaid into a separate chunk, deferred until first diagram is rendered
5. **`VisibleAIContent` IntersectionObserver** in `PostCardContent` — AI cards off-screen render a null placeholder until they scroll within 100 px of the viewport. Prevents rendering 40 Mermaid/chart cards on page load

---

## Canvas Action Strip

Location: `FreeformPadletCards.tsx` — the top strip of each AI padlet card, visible on hover.

**Order (left to right): Edit → Regen → Convert → Export**

- **Edit** (`Pencil`) — opens `AIContentEditModal` for field-by-field editing
- **Regen** (`RefreshCw`) — opens `AIComponentEditor` in locked-mode (same type, new prompt)
- **Convert** (`ArrowLeftRight`) — opens `AIContentConvertModal`; only shown when `getConversionTargets()` returns results
- **Export** (`AIComponentExportMenu`) — dropdown for PDF/DOCX/Markdown/Text

All buttons use `data-no-drag="true"` and `onPointerDown={e => e.stopPropagation()}` to prevent canvas drag conflicts.

---

## Auto Mode

When `uiMode === 'auto'` in `AIComponentEditor`:

1. On generate, calls `POST /api/ai/classify-intent` with the prompt
2. Classify returns `{ mode, subtype, confidence: 'high' | 'low' }`
3. Mode/subtype are set in state and used for generation
4. An auto-resolved badge is shown:
   - High confidence: purple badge, "Auto selected · Diagram → Flowchart"
   - Low confidence: amber badge + warning line "Low confidence — not sure this is the best format. Choose a mode above to override."

If classification fails (network error, non-200), generation falls back silently to the current mode (default: `lesson_board`).

Auto mode description in the selector: "Picks the best format for your prompt — shown before generating."

---

## Editor Empty State

When `AIComponentEditor` has no content yet, the preview pane shows a clickable example prompt for the current mode:

```
auto         → "Water cycle for 7th grade"
lesson_board → "Photosynthesis for middle school"
diagram      → "How a JWT token is validated"
photo_card   → "Golden Gate Bridge at sunset"
workshop_board → "90-minute design sprint agenda"
```

Clicking the example fills the prompt textarea. Updates as user switches modes.

---

## Convert Modal UX

Helper text shown below the target selector: "Only compatible formats are shown. Preview the result before saving."

Flow: select → convert (spinner in right pane) → preview (before/after split) → save or try again. Target format is locked during conversion and preview. "Try again" resets to select phase.

---

## Telemetry Events (`lib/ai/telemetry.ts`)

| Function | When |
|---|---|
| `trackAIGenerationStarted` | Start of generate route |
| `trackAIGenerationSucceeded` | Successful envelope returned |
| `trackAIGenerationFailed` | Any failure in generate route (stage: provider/parse/validation/request) |
| `trackAIValidationFailed` | Zod schema validation failure |
| `trackAIEnrichmentFailed` | Image enrichment error (non-fatal) |
| `trackAIConversionStarted/Succeeded/Failed` | Convert route lifecycle |
| `trackAIAutoModeSelected` | Classify result used for generation |
| `trackAIAutoModeCorrectedByUser` | User overrides auto-detected mode |
| `trackAIRegenerationStarted/Succeeded/Failed` | Regen (locked mode) lifecycle |
| `trackAIRenderFallback` | Any renderer fallback (error boundary, unsupported subtype, empty code, non-positive chart values) |

---

## Image Enrichment (`photo_card` only)

`lib/ai/enrichers/resolve-images.ts` — `enrichAIContentImages`:

1. Takes the model-returned `image.query` string
2. Tries Unsplash API (requires `UNSPLASH_ACCESS_KEY`)
3. Falls back to Pexels API (requires `PEXELS_API_KEY`)
4. Uploads chosen image to Supabase Storage bucket `ai-components/` with path `{userId}/{uuid}/{slug}.jpg`
5. Returns updated data with `image.url` set to the Supabase Storage public URL
6. Errors are non-fatal: telemetry fires, route still returns content without `image.url`

For `PhotoCardRenderer`, if `data.image.url` is empty, shows the image query text as a placeholder instead of the image.

---

## Next.js Config — Supabase Images

`next.config.ts` has `images.remotePatterns` with `hostname: "*.supabase.co"` to allow `next/image` with Supabase Storage URLs.

Note: `PhotoCardRenderer` currently uses `<img>` (not `next/image`), so this config only matters if you switch it back to `next/image`.

---

## Golden Test Suite (`docs/ai-testing.md`)

Scripts: `npm run ai:test`, `ai:test:generation`, `ai:test:conversion`, `ai:test:classify`

Golden prompts: `lib/ai/golden-prompts.ts` (27 prompts)
Conversion fixtures: `lib/ai/test-fixtures/conversion-fixtures.ts`
Classify fixtures: `lib/ai/test-fixtures/classify-fixtures.ts`

**Failure categories:**
- `schema_validation_failure` → tune system prompt
- `empty_required_field` → add explicit constraint to prompt
- `renderer_risk_output` → tighten output format rules
- `classifier_mismatch` → review classifier prompt
- `conversion_mismatch` → check conversion route prompt
- `invalid_json` → usually a provider failure, retry to confirm

---

## CI Workflows

| File | Trigger | Suites |
|---|---|---|
| `.github/workflows/ai-quality.yml` | PR to main/master | classify → conversion → generation |
| `.github/workflows/ai-quality-nightly.yml` | Daily 02:00 UTC + manual | all |

Both: `npm run build && npm start` (production build), wait for server readiness, run suites with `set -o pipefail | tee`, upload results as artifacts.

Required secrets: `DEEPSEEK_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `UNSPLASH_ACCESS_KEY`, `PEXELS_API_KEY`

---

## Rate Limiting

Both `generate-component` and `convert-component` routes use an in-memory rate limiter: 5 requests per IP per minute (sliding window). Each route has its own `rateLimitMap` — they do not share state across routes or server restarts.

---

## Known Bugs Fixed / Important Constraints

### Validation failures from missing structural fields
**Problem**: Model returns JSON without `type`, `subtype`, `renderer`, or `title` — all required by Zod schemas.
**Fix**: `injectStructuralMetadata` in both routes injects these before validation. The model only needs to return content fields.

### "code: Invalid input" on raw Mermaid prompt
**Problem**: User pastes raw Mermaid code as prompt; model interprets and converts it but omits `code` field.
**Fix**: `injectStructuralMetadata` sets `code = userPrompt` when `renderer === "diagram_code"` and `code` is missing.

### Generic validation error message shown to user
**Problem**: `getErrorMessage` checked `error.message` before `error.issues` — always returned the generic fallback.
**Fix**: Check `error.issues[0]` first, prepend field path.

### Next.js `next/image` hostname error for Supabase Storage
**Fix**: Added `*.supabase.co` to `images.remotePatterns` in `next.config.ts`. `PhotoCardRenderer` uses plain `<img>` to avoid this dependency.

### Mermaid re-render on parent updates
**Fix**: `React.memo` with custom comparator + `lastCodeRef` guard in `CodeDiagramRenderer`.

### 40+ AI cards on canvas all render at load
**Fix**: `VisibleAIContent` IntersectionObserver in `PostCardContent` — only mounts `AIContentRenderer` when card is within 100 px of viewport.
