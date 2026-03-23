# Library Icon Card Canvas Design (Freeform)

Purpose
- Defines the visual relationship between the card background, top strip, icon background, and icon.
- Use this to restore the library icon card rendering on the freeform canvas if it becomes corrupted.

Scope
- Canvas preview of card-type padlets (icons) rendered by `components/collabboard/CardPreview.tsx`.
- Applies to freeform canvas display (not editor modals or library list tiles).

Source of Truth
- File: `components/collabboard/CardPreview.tsx`

Expected Structure (DOM Order)
1) Root card container (outer card)
   - Full-size clickable container matching card width/height (usually 180x220).
   - Background uses `metadata.backgroundColor` (fallback #ffffff).
   - Has optional top strip at the top edge.

2) Top strip (optional)
   - Render only if `metadata.topStripColor` exists and not "transparent".
   - Height: 1px, full width, rounded top corners.

3) Center content area
   - Vertical stack centered inside the card.
   - Includes:
     a) Icon background square (colored chip)
     b) Icon SVG image
     c) Optional title
     d) Counter text

Visual Rules
- Card background (full card):
  - `style={{ backgroundColor: metadata.backgroundColor || '#ffffff' }}`
- Top strip:
  - `style={{ backgroundColor: metadata.topStripColor }}`
  - Only visible if color exists and not "transparent".
- Icon background (chip):
  - Size: 128x128 (`h-32 w-32`)
  - Background: `metadata.iconBgColor` (fallback #f8f9fa)
  - Rounded: `rounded-2xl`
  - Shadow: `shadow-inner`
- Icon (SVG):
  - Size: 112x112 (`h-28 w-28`)
  - `object-contain`
  - Centered inside the chip

Layout Intent
- The icon (28x28) must be visually centered inside the colored icon background.
- The icon background should not be smaller than the icon.
- The card background should fill the entire card (no gaps below the icon).

Relevant Code Snippet (current)
- File: `components/collabboard/CardPreview.tsx`
  - Icon background:
    - `className="flex h-32 w-32 items-center justify-center rounded-2xl shadow-inner"`
  - Icon size:
    - `className="h-28 w-28 object-contain"`

Common Failure Modes
- Icon looks detached or overflowing the chip:
  - The icon size is larger than the chip size.
  - Fix: increase chip size or reduce icon size.

- Card only shows a thumbnail-sized area:
  - Card uses `PostPreviewCard` instead of custom card preview.
  - Fix: ensure `CardPreview` renders the full background and centered stack.

- Hook error + blank card:
  - `SafeHtmlContent` has early returns before hooks.
  - Fix: move hooks above any early return.

Restore Checklist
1) Open `components/collabboard/CardPreview.tsx`.
2) Ensure root container has full height and background color.
3) Ensure top strip renders only when a valid color exists.
4) Ensure icon chip is >= icon size.
5) Confirm icon uses `metadata.svgUrl`.

Last Known Good Sizes
- Icon chip: `h-32 w-32`
- Icon SVG: `h-28 w-28`

