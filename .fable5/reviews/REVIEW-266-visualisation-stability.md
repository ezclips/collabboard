# REVIEW-266 — Visualisation stability

Date: 2026-10-03. Reviewer: Codex. Scope: PATCH-266, review only.

This completed review supersedes the earlier command-runner-blocked placeholder at this path. References are to the inspected working tree, which already includes PATCH-267's correction, not an assumed PATCH-262 checkout. Installed AntV and the application dependency are pinned to `0.2.20` (`package.json:50`). No product code was changed.

## 1. Summary

The feature is useful but not yet reliable for editing and saving user content.
The original missing-example-pie mechanism is confirmed; PATCH-267 fixes that path in current code and Chrome.
Top risk 1: a label-only edit promotes example numbers into apparently real, saveable chart data.
Top risk 2: a native mind-map label edit destroys real numeric values; structural edits also misdirect positional overrides.
Top risk 3: separate editing histories restore whole-outline snapshots and erase unrelated later edits.
Keep AntV as a pinned renderer; change editing ownership, identity, history, and persistence.
Chrome also reproduced hover-induced zoom loss and a saveable all-zero pie with no slices.
The existing pie regression file passes all 10 tests despite these failures. A browser interaction gate is necessary.
Two preview generations were made; every draft was cancelled; nothing was saved.

## 2. Missing pie: cause and current correction

`components/collabboard/editors/AIComponentEditor.tsx:568` counts valued source items. For two number-free points it builds `derivedOutline = withExampleValues(activeOutline)` at line 570, obtains suggestions at line 572, and selects those envelopes at line 589. `lib/ai/outline.ts:386` produces 50/50.

Replacing an infographic suggestion's outline with raw `activeOutline` removes those values. Current `optionEnvelope` at generator line 616 now correctly uses:

```ts
const currentOutline = needsExampleEnvelopes && derivedOutline ? derivedOutline : activeOutline;
```

It places this outline in `baseData`. **Keep PATCH-267's small correction.** Do not invent numbers inside the renderer as a second workaround.

`lib/ai/antv/mapOutline.ts:181` copies `item.value` to **datum.value** only when defined. Line 212 wraps items under a root only for `hierarchy-*`; pies take the flat branch at line 225. Installed `node_modules/@antv/infographic/esm/designs/structures/chart-pie.js:58` sums top-level `items[*].value`, treating missing values as zero; line 63 passes them to the pie layout. Labels/connectors can exist while sectors have zero area. Neither a wrong field name nor hierarchy nesting explains this case.

Independent pure-function reproduction called `withExampleValues`, `suggestDesigns`, and `toAntvOptions` on two items named for the file and website. For `antv:chart-pie-compact-card`, the raw outline produced two flat datums without values; the derived outline produced two flat datums with `value: 50`. The live response likewise contained two top-level items without numbers. Current Chrome drew a teal/orange 50/50 pie and visible pie/donut thumbnails after the correction.

This confirms the replacement mechanism and current fix. I did not check out or run the pre-267 revision: attribution to the introducing PATCH-260 commit is historical information from the specs, not an independent bisect.

### Envelope/outline consumer audit

| Consumer | Current path |
|---|---|
| Main editable infographic | `OutlineSuggestionsPanel.tsx:261` calls `envelopeFor(effectiveSelected)`; line 663 passes it to `InfographicRenderer`. Receives corrected example values. |
| Hover preview | Panel line 660 calls `envelopeFor(hoverOption)` through the read-only `AIContentRenderer`. Same corrected choice. |
| Tiles | Panel line 442 calls `envelopeFor(option)`; `SuggestionThumbButton` renders it read-only. Same corrected choice. |
| Selected envelope/save | Generator lines 635/641 serialize `optionEnvelope(selectedOption)`. Line 650 gates Save using the numeric-count check; remaining defect F1. |
| Edit text | Generator line 1619 passes **derivedOutline** while examples are active; panel line 530 hands it to `OutlineTextEditor`. Label/title edits spread the whole derived outline into source state: F1. |
| Add / element editing | Panel line 314 appends to its received outline; line 663 gives the preview outline to renderer edits. Generator line 561 accepts the whole returned outline as source. Additional routes for preview/source replacement. |
| Native mind-map edits | Panel line 667 calls `outlineFromMindmapTree`, which drops values/text styles: F2. |
| Theme/style/kicker | Generator lines 151/160/625 and `useDiagramKicker.ts:31` spread data and stamp their fields; they do not replace the outline. Not the original pie cause. |
| Regeneration/customization | Generator lines 910–916 replace source and suggestions with the new response. This is explicit regeneration, not a lossless presentation edit. |

`withExampleValues` preserves `elementOverrides` and additions through its outline spread. They did not cause the original empty pie, although their editing/storage ownership has separate hazards below.

## 2b. Live session and verification log

### Environment and restrictions

Verified against the already-running **`next dev` on localhost:3000**, with PATCH-267 present. No production build, second server, restart, process kill, installation, git write, direct database call, or direct provider call was made. No cookies, storage entries, credentials, or request headers were read.

Connected Playwright to `http://127.0.0.1:9333`; installed the prescribed request lock before navigating my page. GET/HEAD/OPTIONS were permitted, only POST `/api/ai/generate-outline` allowed among writes, with an eight-call cap and unexpected-write stop flag. No Save, Save to Canvas, Make pie chart, post context-menu, board-edit, or Board AI action was used.

**Setup deviation:** first invocation failed before attachment because Playwright required the brief's default-export fallback. The next non-interactive invocation opened and immediately closed my first write-locked tab when stdin ended (zero generations/clicks, empty blocked list). I then ran interactively in a second new write-locked tab. Thus two sequential review-owned tabs were created, rather than the brief's single tab; none was left open, no owner tab was touched, and `browser.close()` was never called. I record this rather than claim literal single-tab compliance.

### Actions and observations

1. Navigated to the specified board at 1460×850. The board's last-visited PATCH and Next's error-overlay POST were aborted as expected.
2. Read post identities and scoped controls by `data-padlet-id`. Opened the generator through `[data-toolbar-tool="ai-component"]`. Two exact-name subtype locators timed out because names include descriptions; neither caused a generation/write. Subsequent locators used actual button text.
3. Diagram → my own text `My fancy padlet-slideshow.pdf: the slideshow file itself, and watson.ch, the website associated with the file.` → Pie Chart → Generate. **Call 1, HTTP 200.** Outline: `kind: parts`, two flat items (`padlet-slideshow.pdf`, `watson.ch`), no values.
4. Main `antv:chart-pie-compact-card` showed two 50.0% sectors, Example numbers, disabled Save. Nine chart entries were offered, including six pie variants. Visible pie/donut thumbnails contained sectors; I did not individually scroll/render every lazy tile.
5. Edit text showed two values of 50. Changed **only** first label to `PDF file reviewed`, then focused title. **Example badge disappeared, Save enabled, values still 50/50.** No AI request; did not Save.
6. Bar Chart rendered two 50-valued bars. Zoomed to 73%; opening Colours & Fonts and reopening Designs retained 73%. Hovered column design (104%), then moved to preview toolbar: selected bar returned at **66%**, losing the previous view. Cancelled.
7. Scoped existing infographic post `108dffef-0d02-4a15-bb45-e1ea10a3dc17` (title `My fancy padlet-slideshow.pdf`, content includes `watson.ch`), hovered and clicked its `Regenerate with AI`. Stored-outline suggestions opened with prompt `My fancy padlet-slideshow.pdf\n\nIt is watson.ch`, **without a generation**. This locked generator exposed **no Pie Chart subtype button**, so the exact post-entry-to-Pie sequence could not be repeated. No context-menu workaround was used.
8. In that generator's preview: Add circle → Edit text → title `REVIEW unsaved title` → element editor Undo. **Circle disappeared AND title reverted to `My fancy padlet-slideshow.pdf`.** Cancelled; original post untouched.
9. Fresh toolbar generator, own text `Budget: Venue 40%, Food 30%, Travel 20%, Activities 10%.` → Pie Chart → Generate. **Call 2, HTTP 200.** Four supplied values arrived, pie showed 40/30/20/10, Save enabled.
10. Mindmap → explicitly select native `mindmap` tile → leave hover → click Venue in preview → rename to `Venue renamed`, Enter → Pie Chart. **Real values disappeared:** four 25% sectors, Example badge, Save disabled. No AI request.
11. Edit text → set all four values to zero. Labels/connectors remained, no pie disk. Four sector paths each read `M0,-140L0,0Z` (zero area). **Save enabled**, no no-positive-values explanation. Cancelled.
12. Confirmed generator closed, printed final counters/blocked list, closed only my inspection tab and exited.

**Final generation count: 2 of 8. Final blocked list, one occurrence each:**

```text
PATCH https://atkgocwwqbjjhitpavei.supabase.co/rest/v1/boards
POST http://localhost:3000/__nextjs_original-stack-frames
```

Console: expected `Error updating last_visited_at: ... TypeError: Failed to fetch`, plus two `Failed to load resource: net::ERR_FAILED` messages for the blocked requests. No other console error or uncaught page error observed. Screenshot “1 Issue” badge is the expected write-lock consequence.

### Screenshots and checks

Visually inspected screenshots in **`C:/Windows/Temp/codex-review-266/`**, outside the repo:

| Screenshot | Evidence |
|---|---|
| `pie-fixed.png` | Nonempty teal/orange half-pie, Example badge, disabled Save, working visible pie/donut thumbnails. |
| `example-save-enabled.png` | Renamed label, unchanged 50/50, no example badge, enabled purple Save. |
| `mindmap-lost-values.png` | Prompt still says 40/30/20/10; renamed item; four 25% example sectors, Save disabled. |
| `zero-pie.png` | Four zero inputs, leader lines/cards without pie disk, enabled Save. |

Commands:

- `node C:/Windows/Temp/codex-review-266/inspect.mjs`: guarded session above; interactive commands acted only on its page.
- `node C:/Windows/Temp/codex-review-266/pure.cjs`: installed TypeScript transpilation hook and local pure helpers; raw/example mapping, tree round-trip, index drift, partial example totals, validation/serialization mismatch. No test added to the repo.
- `npx vitest run components/collabboard/editors/AIComponentEditor.patch257.test.tsx --reporter=dot`: **1 file, 10 tests passed, 8.00 seconds**. Includes PATCH-267 tests; no separate patch267 test file exists here.
- No full suite/typecheck: no TypeScript changed; focused tests and real-browser interactions were more useful evidence. No baseline-wide gate claim.

## 3. Ranked findings

Paths are repo-relative. HIGH means likely loss/misrepresentation of work; MEDIUM means a material narrower behavioral/maintenance risk. No CRITICAL issue was established by the permitted checks.

| ID | Severity | Area and `file:line` | Failure scenario / recommendation | Confidence |
|---|---|---|---|---|
| F1 | **HIGH** | Provenance — `components/collabboard/editors/AIComponentEditor.tsx:561`, `:568`, `:646`, `:1619`; `OutlineTextEditor.tsx:22`; `OutlineSuggestionsPanel.tsx:530` | No values → preview 50/50 → label edit copies derived outline into source → numeric count becomes two → badge disappears/Save enables. Keep examples out of canonical content; gate by provenance/completeness. | **Live confirmed**, source traced. |
| F2 | **HIGH** | Lossy tree — `lib/ai/outlineToVisuals.ts:109`, `:129`; `components/collabboard/editors/OutlineSuggestionsPanel.tsx:667` | 40/30/20/10 → native mind-map rename → pie becomes equal examples. Both conversion directions omit `value` and `textStyle`. Apply semantic edits to stable source items, not reconstructed lossy projections. | **Live values**, pure test also confirms style loss. |
| F3 | **HIGH** | Undo — `components/ai/renderers/AntvElementEditor.tsx:214`, `:262`, `:320`, `:331` | Add circle → side-panel title edit → Undo circle restores older whole content, erasing title edit. Use one history or scoped inverse commands. | **Live confirmed**. |
| F4 | **HIGH** | Index identity — `lib/ai/antv/elementOverrides.ts:302`; `lib/ai/infographic/edit.ts:105`, `:118`; `lib/ai/antv/mapOutline.ts:633` | Hide/recolour B at index 1; remove A at 0 → override still targets index 1, now C. Unindexed shapes depend on document order. Add stable IDs/roles; meanwhile remap/quarantine incompatible overrides. | **High**, pure removal reproduction + key lookup; not saved/live. |
| F5 | **HIGH** | Template data loss — `lib/ai/antv/elementOverrides.ts:44`, `:154`; `lib/ai/antv/additions.ts:221`; `components/ai/renderers/AntvElementChrome.tsx:142` | Edit A → switch B → add/override on B replaces the single template slot → A's edits gone on return. Store per-template presentation state or explicitly explain destructive conversion. | **High source confidence**. |
| F6 | **HIGH** | Discarded validation — `lib/ai/persistence.ts:61`, `:96`, `:157`; `lib/ai/normalize-ai-content.ts:64`; `lib/ai/validators.ts:219`, `:235`; `components/ai/editors/AIContentEditModal.tsx:727`, `:744` | Schema transforms unknown template to fallback, but save/load return original object. Pure check: validated `antv:list-grid-badge-card`, serialized `antv:obsolete-template`. Sanitizers similarly clean a copy that is discarded. Consume parsed data, with separate model/stored parsers. | **Pure pipeline confirmed**, source traced; no exploit/migration attempted. |
| F7 | **MEDIUM** | Numeric eligibility — `lib/ai/antv/catalog.ts:65`; `components/collabboard/editors/AIComponentEditor.tsx:568`, `:646`; `lib/ai/outline.ts:386` | Zero total yields saveable invisible sectors (live). Two valued items among four also pass non-example checks. Mixed examples `[70,missing,missing]` become `[70,33,67]`, total 170, because existing values are not counted in `assigned`. Define completeness and positive-total pie handling; keep legitimate zero bars. | **Live zero**, pure/source partial cases. |
| F8 | **MEDIUM** | Hover/view lifetime — `components/collabboard/editors/OutlineSuggestionsPanel.tsx:232`, `:254`, `:654`, `:658`; `components/ai/renderers/PictureStage.tsx:323` | Selected bar 73% → hover column → leave → 66%. Hover key resets Fit and replaces editable subtree. Mode also comes from selected, not hovered, template: cross-engine hover gets wrong backend. Separate hover view or restore selected view/editor state. | **Live zoom**, high source confidence for mode/lifetime. |
| F9 | **MEDIUM** | Incomplete AntV edits — `lib/ai/antv/mapOutline.ts:452`, `:521`; `components/ai/renderers/AntvInfographicRenderer.tsx:463` | Child text-style update is ignored; AntV can show it locally, but source/save/redraw cannot preserve it. Item patches also omit numeric value edits. Restrict controls to supported commands or model them fully. | **High source confidence**; child-toolbar flow not live tested. |
| F10 | **MEDIUM** | Native styles — `components/collabboard/editors/AIComponentEditor.tsx:145`, `:160`; `components/ai/renderers/TimelineDiagramRenderer.tsx:9`; `ComparisonDiagramRenderer.tsx:9` | Custom style is stamped on timeline/comparison envelopes, but renderers use only `themeById`, ignoring custom fonts/background. Honour offered controls or hide unsupported ones. | **High source confidence**, not separately live tested. |
| F11 | **MEDIUM** | Work per edit — `components/ai/renderers/AntvInfographicRenderer.tsx:357`, `:503`, `:520`; `PictureStage.tsx:382`; `lib/ai/antv/elementOverrides.ts:422`; `lib/ai/antv/additions.ts:492`; `components/collabboard/editors/SuggestionThumbButton.tsx:56` | Scroll many tiles then edit: once-visible instances remain; envelopes rebuild, DOM is repeatedly scanned/decorated, additions replaced, broad observers run. Style changes recreate engine. Profile, cache static thumbnails, bound live engines, batch geometry/decorations. | High on paths; **medium impact magnitude**, unprofiled. |
| F12 | **LOW** | Maintainability — `components/collabboard/editors/AIComponentEditor.tsx:1`; `components/ai/editors/AIContentEditModal.tsx:1`; `lib/ai/antv/catalog.ts:4` | Oversized stateful components and duplicated derived data make small edits cross many authorities; stale comments say charts are excluded. Extract selector/commands after browser coverage; retain useful diagnostics/legacy readers. | **Confirmed source/counts**. |
| F13 | **HIGH — corrected** | Original missing example pie — `components/collabboard/editors/AIComponentEditor.tsx:616`; `lib/ai/antv/mapOutline.ts:186` | Replacing example envelope with raw source removed values. Current PATCH-267 corrects it. Retain fix and add provenance regression coverage. | **Confirmed mechanism/current live fix**; not currently failing. |

### Architecture and state ownership

The useful core is sound: extract semantic content once, then render designs locally. `app/api/ai/generate-outline/route.ts:217` calls the managed component generator; line 283 parses output; line 286 strips model-supplied overrides; line 294 adds trusted estimate metadata. `lib/ai/infographic/suggest.ts:74` derives native and AntV suggestions. `AIContentRenderer.tsx:82` dispatches subtype; `InfographicRenderer` delegates AntV names. The generator save callback receives the version-1 serialized envelope at `AIComponentEditor.tsx:1013`.

`VisualOutline` now combines semantics, typography, branch-side layout, DOM-keyed overrides, additions, and preview provenance. It remains useful for two to eight points and one child level, but cannot represent arbitrary graphs/series or every AntV edit. Children carry only labels (`outline.ts:15`); relation templates are explicitly excluded (`catalog.ts:63`). “276 designs” means catalog entries, not 276 interchangeable capabilities for every input.

Authorities include `activeOutline`, `outlineOptions[*].envelopeData`, derived examples/suggestions, parent selection and panel effective/hover selection, theme/style/kicker, renderer outline/drawn refs, element-editor local overrides/history, AntV internal options/history, and decorated SVG DOM. Echo suppression fixes symptoms but does not define a document revision or transaction owner. F1–F6 show whole-object replacement crossing those boundaries.

Recommended contract: one canonical document with stable semantic IDs; per-template presentation state; preview-only projections and numeric provenance; ephemeral view/selection; commands targeting IDs and fields. Derive envelopes rather than maintaining mutable semantic copies in suggestions. Preserve old post readers with versioned migration. The semantic outline can remain the shared core without being the entire editing document.

### AntV integration and event ownership

There is deliberate engineering here. `lib/ai/antv/interactions.ts:21` retains only DblClickEditText, ClickSelect, HotkeyHistory and SelectHighlight. Engine zoom/pan, DragElement and BrushSelect are disabled. Element listeners use capture (`AntvElementEditor.tsx:634`); drag completion uses window capture (`useAntvElementDrag.ts:326`). PictureStage excludes element/control presses (`PictureStage.tsx:74`), controls opt out with `data-picture-control`, wheel is non-passive, and modal roots stop wheel propagation.

Escape improved: window-capture element editor consumes it (`AntvElementEditor.tsx:692`), panel checks `defaultPrevented` and text focus (`OutlineSuggestionsPanel.tsx:367`). The installed AntV `editor/utils/hotkey.js` **also checks `defaultPrevented`**. I therefore do not claim every Ctrl+Z runs twice. The proven problem is separate histories restoring overlapping content; deselection also changes which history receives Ctrl+Z.

AntV's toolbar/inline editor, our element editor, and mind-map +/- overlay still share one selection/geometry surface. The 9999/10000 stacking rules (`AntvElementEditor.tsx:387`, `:731`), measured counter-scale (`PictureEditOverlay.tsx:74`), and horizontal clamp (`AntvElementChrome.tsx:204`) are useful corrections but constitute an implicit protocol. Define selection, text editing, dragging, resizing, adding and panning states with one gesture owner. A high z-index cannot escape ancestor overflow/stacking; the horizontal clamp alone does not prove vertical containment.

Upgrade fragility is highest at `data-element-type`/`data-indexes`, ordinal keys, foreignObject/use geometry, change-event paths, toolbar behavior, and the copied mind-map structure (`stableMindmap.tsx:1`, `mapOutline.ts:129`). Font disabling mutates returned registry objects (`setup.ts:55`). Keep the exact pin, local icon loader and catalog parity tests. Upgrades require real package output/events and saved-document replay, not just TypeScript compilation.

The safest direction is AntV as a layout/renderer behind our document/commands, with incremental removal of overlapping editor ownership. An alternative is letting AntV own all editing and persisting its full supported model; that would be a larger migration and would not justify retaining the current incomplete reverse mapping. Do not replace the dependency merely because our integration is fragile.

### Zoom/view reset inventory

Every reset/refit entry found in PictureStage and the inspected callers:

| Trigger | Behavior / evidence |
|---|---|
| Editor/stage mount or remount | Fresh state starts at Fit (`PictureStage.tsx:97`, `:110`). Close/reopen and switching editor presentations that mount another stage lose transient view. |
| Selected design or theme | `resetKey` clears AntV natural/box state or calls CSS Fit (`PictureStage.tsx:323`). Intentional current contract. |
| Hover enter/leave | `previewKey` is in `resetKey` (`OutlineSuggestionsPanel.tsx:654`): **unwanted reset reproduced**. |
| Fit button, percentage button, keyboard 0 | Explicit user fit (`PictureStage.tsx:567`, `:657`, `:677`). |
| Resize at Fit | Re-measure/refit (`PictureStage.tsx:268`). Panel/window changes can change fit scale by design. |
| Resize after user zoom/pan | Keeps scale and center; falls back to Fit if box/previous dimensions are invalid (`PictureStage.tsx:278`, `:292`). Panel switches preserved 73% live. Zero-size/hide/reveal remain untested. |
| First usable AntV SVG / reset redraw | Captures natural viewBox and fits (`PictureStage.tsx:345`). Skips the old stage-applied box while awaiting a new natural box; missing final box can delay recovery. |
| Engine rewrites viewBox | At Fit or missing current box: refit; otherwise restore the stage's last box (`PictureStage.tsx:364`). PATCH-258's intended write-back. |
| Engine recreation | Template/theme/style/editability effect tears down instance (`AntvInfographicRenderer.tsx:503`). Template/theme explicitly reset; style-only changes rely on stage write-back retaining view. Recreation is not automatically evidence of refit. |
| AntV edit echo / external edit | AntV-originated change updates `lastUpdatedOutlineRef` (`AntvInfographicRenderer.tsx:334`); overrides-only path skips engine update (`:520`). External semantic changes still update, entering the viewBox rewrite path above. |

The two modes are defensible: CSS transforms would double-scale AntV's toolbar, while native pictures already use CSS-scaled overlays. Keep them behind one viewport interface (fit, screen/content transforms, scale/center, resize). Derive mode from the picture actually previewed and separate hover/selected state. A blanket switch to CSS transforms would revive known bugs.

### Persistence and compatibility

Infographic envelopes store title/template/outline, theme/style/kicker, subtype/renderer, prompt/time/attribution metadata. Outline includes values, styles/sides, and one template-tagged override map with additions. Native mind maps instead store tree plus Mermaid code; timeline/comparison store their own arrays. Saving those derived types is not a lossless way to retain the whole source outline.

Version handling exists (`persistence.ts:13`, `:105`); legacy HTML and unversioned structured data are accepted. Edit modal can upgrade parseable code-only mind maps (`AIContentEditModal.tsx:702`). There is no independent element-key/renderer schema version, stable item identity or multiple-template override store. Changing a template name or SVG structure can invalidate saved presentation even while envelope version stays 1.

The intended fallback/sanitizers are sensible, but F6 discards their transformed result. Also `parseOutline` drops both example and estimate flags: blindly switching serialization to its output changes trusted metadata. PATCH-250 intended the estimate flag to be session-only; current persistence keeps original flags. Make policy explicit with separate model/stored parsers, preferably retain provenance durably, and test old posts first. Avoid destructive bulk rewrites as a validation cleanup.

### Code health and performance

Measured lines: `AIComponentEditor.tsx` **1726**, `AIContentEditModal.tsx` **1125**, `AntvElementEditor.tsx` **799**, `OutlineSuggestionsPanel.tsx` **775**, `elementOverrides.ts` **752**, `PictureStage.tsx` **687**. First two exceed the 800-line ceiling; several are at its edge. Extract pure preview/envelope selection and document commands/history before rearranging DOM-sensitive JSX.

Duplicated logic includes numeric-chart eligibility/counts, selected/effective-selected rules, conversion field lists, edit/save preparation. Patch comments sometimes describe superseded contracts (`catalog.ts:4` says charts excluded). Legacy code/chart renderers remain needed for old posts and locked regeneration; I found no basis to delete them as dead code.

Retain `data-ai-element-key`, membership and render-state selectors as a documented test/inspection interface. `data-ai-base-*` is functional restoration state, not disposable debug output. `data-ai-last-emit` and override counts may be development/test diagnostics; never add full user content/secrets to them. Removing observability now makes failures harder to diagnose.

Good choices: memoized lazy engine import (`load.ts:14`), one-time local-resource setup, category limits, IntersectionObserver thumbnails, 120 ms hover debounce, override-only no-update. Remaining costs are F11. Example-mode `derivedOutline` is newly allocated every render, defeating `derivedOptions` useMemo stability (`AIComponentEditor.tsx:570`). Envelopes rebuild and theme/style stamping repeats. Override keying performs nested scans; additions are replaced on each paint; the stage observes all descendant attributes/children. Once-seen thumbnails stay mounted. Measure instance count, update counts, frame time and observer activity before optimizing. No measured FPS, bundle regression or memory-leak claim is made here.

## 4. Keep / change / replace verdicts

| Component | Verdict | Reason |
|---|---|---|
| AntV | **KEEP**, pinned; **CHANGE boundary** | It draws useful charts correctly with correct data. Incrementally make our commands/history authoritative, initially translating supported AntV text edits into commands. No evidence supports replacing the engine now. |
| DOM overrides | **KEEP compatibility adapter; REPLACE positional identity/whole-map ownership** | Existing edits must still render. New data needs stable IDs, roles, versioned mapping and per-template state. Do not make DOM ordinals the permanent document API. |
| Three edit layers | **CHANGE to one edit/gesture/history controller** | Preserve working controls while giving selection, Escape, focus and undo explicit ownership. Temporary AntV inline UI can emit our commands. |
| Two zoom modes | **KEEP backends; CHANGE shared viewport contract/lifetimes** | Different transforms are justified. Hover must not destroy selected view; mode must match preview. |
| VisualOutline | **KEEP semantic core; CHANGE document contract** | Useful bounded content shape; insufficient as content, template presentation, editor snapshot and example data simultaneously. Add IDs/provenance and lossless projections. |

## 5. Proposed patch sequence

Containment before migration; every patch should carry a focused regression plus a small real-browser check. These are proposals only.

1. **Keep example values in every chart envelope — PATCH-267, already implemented.** Retain `currentOutline` in `optionEnvelope`. Browser-gate nonempty sectors in main/hover/all pie variants, visible bars, disabled Save and carried overrides. Do not implement a second fix.

2. **Prevent examples becoming saved facts.** Separate editable canonical values from preview fillers, add per-item provenance and completeness checks. Label/icon/colour/addition/drag edits must preserve missing-value status; test first-value-only editing. Define zero-total pie behavior and sensible mixed examples without requiring arbitrary real data to sum to 100.

3. **Make native mind-map edits lossless.** Apply field-specific edits to identified source items. An interim correction must preserve every current field in projections, including value/textStyle, and account for structural edits rather than index-merging. Test numeric values through rename/add/remove and return to charts.

4. **Stop undo erasing unrelated content.** Replace whole-content restoration for override/addition undo with scoped inverse operations. Route icon and AntV text edits into a documented history. Add→rename→Undo must preserve rename; text→move→Undo/Redo must remain correct across selection changes.

5. **Use validated stored-document data.** Introduce a parsed result used by loading/rendering/saving, distinct from model parsing. Preserve legitimate trusted fields, apply actual fallback/sanitization, replay legacy fixtures, and report compatibility changes before any storage migration.

6. **Keep selected view/editor alive during hover.** Use a separate temporary preview or suspend/restore selected state. Derive mode from hovered template. Test AntV/native hover transitions, zoom restoration and ability to undo earlier edits after returning.

7. **Protect presentation across structural/template changes.** Add stable item IDs, versioned role mapping and per-template presentation state. Migrate old positional keys conservatively; until safe, retain incompatible edits as recoverable data instead of silently retargeting them. Test B's colour through A insertion/removal and A→B→edit→A.

8. **Define renderer capabilities and a shared edit controller.** Own gestures/selection/history centrally; restrict unsupported AntV edits or fully represent them. Make native timeline/comparison obey offered style controls. Isolate DOM decoration and installed-package assumptions inside the adapter, keeping legacy readers.

9. **Bound thumbnails/observers and split oversized components.** Profile first; cache read-only previews, limit live engines, batch decoration and geometry reads. Extract selector/command logic before JSX. Preserve DOM geometry/selectors and add an engine-upgrade replay gate before moving the dependency pin.

## 6. Proposed Playwright E2E harness

### Independent authentication and environment

Reuse `playwright.config.ts:9`: production server on :3100 or `PW_BASE_URL` for an existing server, auth setup dependency, authenticated characterization project (`:43`). `e2e/auth.setup.ts` already logs in through `/auth` and writes storage state; `e2e/helpers/env.ts` defines credential variables/path. I read this code, not its credential files or auth state.

Use a **dedicated test account and disposable board in an isolated test environment**. Supply credentials securely through the runner; launch a fresh browser/context, never CDP-attach to port 9333 or copy the owner's session. Authenticate the test account once per worker/run through the setup project. Store its auth state/profile/artifacts in OS temp outside the watched repo, restrict access, never print them, clean up afterward. Required visual CI should fail visibly for missing credentials, not report all-skipped tests as success. A no-auth renderer harness can run separately but does not prove persistence.

CI builds/starts in its own workspace with no concurrent dev process sharing `.next`. Local tests may use `PW_BASE_URL` against an existing server without a build. Keep profiles outside the project to avoid the documented watcher/hydration failure. No accounts were provisioned and this proposed harness was not run during this review.

### Two lanes

1. **Fast deterministic browser integration:** intercept only the outline AI response with captured, validated fixtures at the network boundary. Keep actual modal, installed AntV, CSS, selection, events and save/reload path. Use the two actual 200-response shapes captured here and dedicated test data. Add a lightweight renderer gallery for breadth without provider latency.
2. **Small live contract lane:** periodically call `generate-outline` through the test user's UI, cap spend, record attribution/latency, assert schema/provenance and rendered geometry without demanding identical wording. This validates the model boundary that fixture tests bypass.

### Coverage

| Scenario | Required assertions |
|---|---|
| Number-free text → Pie/Bar | Nonzero sector geometry / visible bars; main, hover, all six pie variants; example warning and disabled Save. Scroll lazy tiles into view before asserting render. |
| Example provenance | Label/title edits, colour/move/add/icon edits, and entering only one number never promote untouched examples. Gate Save on real/accepted values, inspect eventual payload. No extra AI call. |
| Numeric integrity | 40/30/20/10 → native mind-map edits → chart; surviving IDs retain values/styles. Include zero total, partial values, invalid strings and two-of-four numeric items. |
| History | Add→side-panel rename→Undo; AntV text→move→Undo/Redo; keyboard ownership selected/unselected; delete/restore; same content after save/reload. |
| Identity | Hide/recolour B, insert/remove A before it: B keeps edit, C does not inherit it. A→B→customise→A retains each template's work. |
| Geometry | Real mouse down/move/up, capture/cancel, small text, zero-box use icons, nested text, long labels, wide/tall layouts. Narrow selection, double-click, resize fixed corner, screen displacement within ~1–2 px at fit/zoom. |
| View | Zoom/pan→text edit→next click; panels/resize/Escape; hover/return; theme/style; Fit. Assert screen anchors and viewBox/transform, not percent text alone. |
| Overlays | Escape closes popover, then selection, then panel; input Escape consumes only its edit. Buttons clickable, sizes stable, popovers contained, no raw style text or nested-button hydration errors. |
| Compatibility | Representative list/pie/bar/hierarchy/timeline/comparison/native tree/hub/flow; dark/custom styles; empty/custom kicker; read-only tiles/board have no editing controls; old/unknown templates through real normalization. |
| Persistence | Save only a dedicated test post; assert exact target ID and payload; reload/reopen and compare content/presentation. Future test environment should independently read back that test row for storage assurance; no DB read was made here. |
| Network/errors | No AI call for local edits; no remote AntV font/icon requests; bounded live spend; useful outline failure/retry; loading settles; unexpected errors/writes fail the test. |

### Speed and reliability

Start with one Chromium worker (at most two locally, consistent with current contention guidance), a small representative fixture set and one isolated board per worker. Wait for expected response/template, render-state done, nonzero geometry and stable bounds across consecutive frames. Avoid fixed sleeps and realtime-board `networkidle`. Scope locators by post/modal/preview identity; use real pointer events and the unmocked engine.

Combine semantic assertions with targeted screenshots. Path count alone accepts zero-area sectors; enabled Save alone does not prove persisted content. Tolerate antialiasing, not missing sectors or overlays. Keep traces/screenshots on failures without secrets. Record engine instance/update counts and settled observer activity before making performance thresholds hard gates.

Run a full 276-template renderer-only matrix nightly with compatible fixtures and zero AI calls. PR checks cover representative structures plus all pie variants. Engine upgrades require catalog parity, captured change-event compatibility, DOM role/key tests, zero-remote-resource checks and saved-document replay.

### Why jsdom passes

The current `AIComponentEditor.patch257.test.tsx:14` mocks `AIContentRenderer`; line 25 mocks the AntV renderer leaf. Those tests usefully establish which envelope reaches a renderer, but do not prove sectors or real interactions that copy a derived outline back to source. Their successful “type every number” scenario misses a label-only commit. **10/10 passed during this review's live failures.**

`PictureStage.test.tsx:51` assigns synthetic dimensions. `AntvElementEditor.test.tsx:231` supplies CTM/bounds; pointer helpers dispatch synthetic events. These tests verify the supplied geometry/protocol, not browser behavior. jsdom does not implement real layout, SVG text/foreignObject/use measurements, getBBox/getScreenCTM, capture retargeting, native selection, stacking/overflow hit testing, or asynchronous resource paint. Class/selector assertions cannot establish visual containment. Loading real AntV under jsdom still does not supply a browser layout engine.

PATCH-245 and PATCH-260–265 document these exact failure classes: zero-height parents, passive wheel, use geometry, swallowed pointerup, hover overlays, broad SVG selectors, stacking and delayed refits. Keep focused unit regressions, but require composed browser flows crossing response → envelope → rendering → edits → history → save/reload. Also check failing test names within baseline-failing files, as `.agent/verification-baselines.md` requires; a matching failed-file set alone can hide new failures.

## 7. What remains unverified / questions

- No saved post was written, newly saved/reopened, or read directly from storage. Persistence claims are source/pure-function findings; durable round-trip checks need the dedicated test environment.
- The pre-267 screenshot state was not re-executed. Current number-free pie is fixed; its former replacement mechanism was demonstrated in pure functions. The existing-post locked generator had no Pie button. **Question:** should locked stored-infographic regeneration expose the new generator's family selectors, and what exact permitted entry path should be tested? No source-post context menu workaround was used.
- Only visible lazy pie thumbnails were visually confirmed, not all 276 designs. Template-switch data loss, positional override retargeting, child toolbar styles and native timeline/comparison styles were not all exercised live; the findings table qualifies their evidence.
- No full resize/recolour/icon-swap persistence tour, production build, touch/pen/cross-browser run, performance profile, outage test, or AntV upgrade was performed. The two UI generations exercised only the managed-default route; no individual provider adapter was directly tested or certified.
- `.fable5/patches/PATCH-246.md` is absent; PATCH-247/248 identify it as reverted. Patch-history claims were treated as leads and checked against code/live behavior where stated, not accepted as proof of stability.
- This is current working-tree evidence after the pie fix, not a frozen historical checkout. No git state was changed.
- The Windows restricted shell could not start; approved elevated shell calls handled reads, temporary scripts, the allowed focused test and this report. Screenshot reading hit the same sandbox limitation; approved shell reads supplied images for visual inspection. No credential files were accessed.
- One oversized report-write command failed to launch due to Windows command-length limits; the report was then written in smaller sections. That failed command changed no file.

The only repository file authored by this review is this report, replacing its obsolete blocked placeholder. Temporary scripts/screenshots remain under `C:/Windows/Temp/codex-review-266/`. No product, test, configuration or lockfile was edited. All generator drafts were cancelled; final inspection tab closed; owner tabs and servers left alone.
