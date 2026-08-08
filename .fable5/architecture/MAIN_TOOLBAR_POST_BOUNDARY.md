# Main Toolbar / Post Architecture Boundary

## Status

PERMANENT ARCHITECTURE RULE  
GLOBAL GOVERNANCE BOUNDARY  
APPLIES TO ALL CURRENT AND FUTURE PATCHES

This file defines the permanent boundary between the Main Toolbar, canvas layouts, shared renderers, and post-specific presentation and editing systems.

This rule is not limited to a single patch.

---

## 1. Main Toolbar Isolation

The Main Toolbar is architecturally isolated from post-specific presentation and editing internals.

A Main Toolbar task does not authorize changes to any post component.

The Main Toolbar may invoke only approved, canonical, high-level actions through a shared action-routing or editor-routing boundary.

The Main Toolbar must never directly:

- add, remove, move, reposition, or duplicate controls inside a post;
- modify post-card JSX;
- modify card chrome;
- modify post-specific toolbar controls;
- modify post-specific editors or modals;
- modify secondary-panel placement inside a post;
- modify post layout or rendering;
- introduce post-specific handlers;
- wire `onEditContent`;
- wire `onOpenToolbar`;
- select between competing editors for a post type;
- import post-specific editors or post-specific modals;
- create layout-specific post editing behaviour.

No AI may infer permission to modify a post from a request concerning:

- the Main Toolbar;
- the canvas;
- a canvas layout;
- a shared layout renderer;
- selection controls;
- zoom controls;
- board-level controls;
- generic toolbar work.

---

## 2. Post Edit Ownership

Each post type must have:

- exactly one canonical Edit-control owner;
- exactly one canonical Edit action;
- exactly one canonical editor or modal;
- exactly one shared editor-routing path across all layouts.

For an editable post:

```text
Maximum visible Edit controls = 1