
# Implementation Plan: Columns Canvas Post Card & Context Menu

## Goals
- Make post cards in Columns Canvas visually consistent, attractive, and fixed-size
- Implement a context menu (right-click or three-dot) that is unique to Columns Canvas Post
- Ensure menu expansion is clean and unclipped
- Support all required post actions for this canvas type (see below)
- Allow for future menu customization per canvas type

---

## 1. Card Appearance & Sizing
- Set a fixed width (e.g., 280px) and min-height (e.g., 80px) for post cards
- Use padding, rounded corners, and shadow for a modern look
- Ensure text/content is centered and not hugging edges
- Prevent overflow, squishing, or stretching
- Support cardColor/topStrip from metadata for visual cues

## 2. Context Menu (Columns Canvas Post Only)
- Add a three-dot button (top-right) and support right-click on card
- Menu actions (full set for Columns Canvas Post):
  - Open post
  - Open post in new tab
  - Copy link to post
  - Start slideshow from this post
  - Download attachment
  - Copy attachment link
  - Change card color (color picker)
  - Edit post
  - Add post before
  - Add post after
  - Duplicate post
  - Copy to another padlet
  - Transfer to another padlet
  - Set as padlet cover
  - Pin/unpin post
  - Report post
  - Delete post
- Menu should expand fully, not be clipped by card or container
- Use DropdownMenu from UI library, styled for clarity
- Menu logic and actions are only for Columns Canvas Post (not shared)
- Allow for easy future addition/removal of menu items

## 3. Component Structure
- Refactor ColumnsLayout to use a single PostCard component for all posts
- PostCard receives props for content, metadata, and menu actions
- Context menu logic is inside PostCard, not global/shared
- All menu actions are handled via callbacks passed from ColumnsLayout
- Each menu action should be implemented as a callback, allowing for easy extension and per-canvas customization

## 4. Future-Proofing
- Menu actions are defined in ColumnsLayout, so each canvas type can have its own menu
- PostCard is reusable, but menu is injected/configured per layout
- Easy to add/remove menu items for Columns Canvas Post without affecting other canvases

## 5. Testing & Validation
- Test card appearance with various content lengths and colors
- Test menu expansion on click and right-click
- Test all menu actions (open, open in new tab, copy link, slideshow, download/copy attachment, color, edit, add before/after, duplicate, copy/transfer, set as cover, pin, report, delete)
- Confirm no overflow, clipping, or layout bugs
- Get user feedback and iterate

---

## Next Steps
1. Create/Refactor PostCard component for ColumnsLayout
2. Implement context menu logic and styling
3. Wire up menu actions in ColumnsLayout
4. Test and validate with user
5. Document for future customization
