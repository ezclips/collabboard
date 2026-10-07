# PATCH-315 — A Napkin-style text toolbar for the text in a Scheduler event

Status: AUTHORIZED (owner, 2026-10-07, screenshot of Napkin's floating text bar — font "Roboto", size "15", Bold,
alignment, colour palette — "for the text font/style add the same function as napkin for it").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on PATCH-314 (Add text / Edit text in an event).

## Facts (CTO)
- PATCH-314 lets you type a short text into an event (stored as the container's `title`). It has no styling.
- The app loads no web fonts (no `next/font`, no Google Fonts), so only system font stacks render reliably.
- The AI-picture editor has a docked text panel (`components/ai/renderers/AntvElementPanel.tsx`) with a font list
  (`TEXT_STYLE_FONT_FAMILIES`, mostly CJK fonts) — not suitable here, and not a floating bar.

## Design
### A reusable floating bar — new `components/collabboard/TextStyleToolbar.tsx`
Props: `value: TextStyle`, `onChange(next: TextStyle)`, `anchorRect: DOMRect` (positions itself 8 px above the text,
centred, clamped inside the window), optional `className`. A dark rounded pill like Napkin's
(`bg-slate-800/95 text-white rounded-full shadow-lg px-2 h-9`, items separated by thin dividers), containing in order:
1. **Font** dropdown (label shows the current font): Sans · Serif · Rounded · Mono · Handwriting, each previewed in
   its own font. Stacks (in a new `lib/domain/canvas/textStyle.ts`):
   Sans `system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
   Serif `Georgia, Cambria, "Times New Roman", serif`;
   Rounded `ui-rounded, "SF Pro Rounded", "Segoe UI", Nunito, system-ui, sans-serif`;
   Mono `ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
   Handwriting `"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive`.
2. **Size** dropdown: 10, 11, 12, 13, 14, 15, 16, 18, 20, 24 (shows the number).
3. **Bold** toggle (`B`, pressed state visible).
4. **Alignment** button cycling left → centre → right (icon shows the current one).
5. **Colour** (palette icon) → small popover: the 8 swatches #0f172a, #ffffff, #ef4444, #f59e0b, #10b981, #3b82f6,
   #8b5cf6, #ec4899 plus a native colour input; the current colour is ringed.
Every control: `type="button"`, `aria-label`, keyboard reachable; the bar stops propagation of pointer/mouse/key
events (PATCH-308 lesson) and uses `onMouseDown={e => e.preventDefault()}` on buttons so the text input keeps focus.
`TextStyle = { fontFamily?: 'sans'|'serif'|'rounded'|'mono'|'handwriting'; fontSize?: number; bold?: boolean;
align?: 'left'|'center'|'right'; color?: string }` with `textStyleToCss(style)` → React CSS and a validator
`parseTextStyle(unknown)` (drops anything not in the lists; colour must be `#rgb`/`#rrggbb`).

### Use it on the event text (`StandaloneSchedulerCanvas.tsx`)
- While an event is in text-edit mode (PATCH-314), show the bar above it. Changes apply live to the input and are
  saved immediately to the container's `metadata.titleStyle` through the existing `onUpdatePadletMetadata` (merge,
  never replace other metadata). Enter/blur still saves the text; Escape cancels the TEXT edit (style changes already
  made stay saved — say so in a code comment).
- Clicking a control must not end edit mode (blur from the input into the bar is not a save-and-close; close only when
  focus leaves both the input and the bar).
- The event always renders its text with `textStyleToCss(parseTextStyle(metadata.titleStyle))`; default (no style) =
  today's look. Colour default stays the readable text colour for the event background.
- Read-only viewers see the styled text, never the bar.

## Tests
- `lib/domain/canvas/textStyle.test.ts`: `parseTextStyle` keeps valid values and drops bad font keys, sizes outside the
  list, non-hex colours; `textStyleToCss` maps each field (bold → 600/700, align → textAlign).
- `components/collabboard/TextStyleToolbar.test.tsx`: each control calls `onChange` with the right merged style; the
  colour popover opens and a swatch sets the colour; a button mousedown is default-prevented (focus stays); pointer
  events do not reach a parent spy.
- Scheduler behaviour test: in edit mode the bar renders; choosing Serif calls `onUpdatePadletMetadata(id, { titleStyle:
  { …, fontFamily: 'serif' } })`; clicking a bar control does not call `onRenameContainer` nor leave edit mode; an
  event with `titleStyle` renders its text with those styles; read-only → no bar.

## Allowed files
New `components/collabboard/TextStyleToolbar.tsx`, new `lib/domain/canvas/textStyle.ts`,
`components/canvas/StandaloneSchedulerCanvas.tsx`, and tests. Same rules. Run the new tests, the scheduler tests and
tsc.

## Commit message (verbatim)
```
feat(scheduler): style the text in an event with a Napkin-style bar

While you type a text into an event, a floating bar above it sets the
font, size, bold, alignment and colour, like Napkin's. The style is saved
with the event and shown to everyone; viewers see it but not the bar. The
bar is a shared component so other texts can use it later.
```

## Addendum 1 (CTO, live 2026-10-07)
Live: the bar shows (Font, Text size, Bold, Text alignment, Text colour); each choice saves immediately
(`titleStyle` serif → 18 → bold → center → #ef4444, merged correctly) and edit mode stays open. **Bug:** the typed
text is lost on the first style change — input value "Standup" → "" after choosing Serif, so Enter saves nothing.
Cause: saving the style updates `padlets`; `CustomEvent` (a `useCallback` with `padlets` in its deps) gets a new
identity, react-big-calendar remounts it and the input restarts from the saved (empty) title.
**Fix (`StandaloneSchedulerCanvas.tsx`):** hold the draft in the canvas component's state next to `editingEventId`
(`editingDraft: string`), set it when edit mode starts (from the current title), make the input CONTROLLED by it
(`value={editingDraft}` / `onChange`), and commit/cancel from that state. Re-focus the input (caret at the end) after a
remount while `editingEventId` is still set. Test: in edit mode, type "Standup", then trigger a style change that
updates `padlets` (re-render with new props) → the input still shows "Standup" and Enter calls
`onRenameContainer(id, 'Standup')`. Same rules.

## Final result (CTO, 2026-10-07, live)
Add text → typed "Standup" → bar (Font, Text size, Bold, Text alignment, Text colour) → Serif, 18, Bold, centre, #ef4444: each saved at once, the typed text kept, Enter saved it. Rendered Georgia/Cambria serif, 18 px, 700, centre, rgb(239,68,68) — identical after a reload. Gate 26 = 26; tsc clean; test boards deleted.
