---
name: Excalidraw White-labeling Integration
description: Guidelines and procedures for maintaining, updating, and understanding the custom-forked, white-labeled Excalidraw component.
---

# Excalidraw White-label Integration

This project uses a custom, locally-forked version of the Excalidraw component rather than the standard NPM package. This fork exists specifically to provide a fully white-labeled experience, completely stripped of Excalidraw branding, external links, and AI-generation features.

## Architecture & Location
The forked codebase is located at:
`components/collabboard/canvas/excalidraw_fork/packages/excalidraw`

The root project (`package.json`) points to this local directory using a `file:` protocol:
```json
"dependencies": {
  "@excalidraw/excalidraw": "file:components/collabboard/canvas/excalidraw_fork/packages/excalidraw"
}
```

## Key White-labeling Modifications
When updating or modifying the Excalidraw component, ensure the following core modifications are preserved:

### 1. Branding Removal
*   **Logo (`components/ExcalidrawLogo.tsx`)**: The SVG content of the Excalidraw logo is stripped out to return an invisible/empty element.
*   **"Made with Excalidraw" (`locales/*.json`)**: The locale keys `madeWithExcalidraw` and `addWatermark` are explicitly set to empty strings `""` across all `>50` translations. All other instances of the word "Excalidraw" are replaced globally with "the Canvas" in the JSON files.

### 2. UI Elements & AI Tools
*   **Action Menu (`components/Actions.tsx`)**: The "Generate" heading, "Mermaid to Excalidraw" tool, and "Magicframe (AI)" are explicitly removed from the extra tools dropdown.
*   **Publish Library (`components/LibraryMenuHeaderContent.tsx`)**: The "Publish to Library" dropdown item is removed to prevent users from interacting with the external `libraries.excalidraw.com` ecosystem.

### 3. External Links & Socials
*   **Social Links (`components/main-menu/DefaultItems.tsx`)**: The `<Socials>` component returns `null` to remove GitHub, X (Twitter), and Discord links.
*   **Help Dialog (`components/HelpDialog.tsx`)**: The `<Header>` component within the Help Dialog is modified to return `null`, removing links to Excalidraw's blog, GitHub issues, and YouTube channel.
*   **Error Messages (`components/BraveMeasureTextError.tsx`)**: Hardcoded links pointing to `docs.excalidraw.com` have been rewritten to generic text instructions.
*   **API Documentation (`components/App.tsx` & `components/PublishLibrary.tsx`)**: Comments and UI links pointing to the public `excalidraw.com` domains are sanitized.

## Development & Dependency Management

### Building the Fork
If you make changes to the Excalidraw fork source code or dependencies, or if you encounter "Module Not Found" errors relating to internal Excalidraw packages (like `@radix-ui/react-tabs` or `@excalidraw/math`), you must rebuild the local package:

1.  Navigate to the fork: `cd components/collabboard/canvas/excalidraw_fork/packages/excalidraw`
2.  Install dependencies and build the internal workspace: `yarn`

### Integrating with the Root Project
Because the root project imports Excalidraw via a local file path, you must ensure that peer dependencies are satisfied at the root level.
*   The root `package.json` must use `npm install --legacy-peer-deps` when updating the project.
*   Certain dependencies required by the Excalidraw UI (e.g., `open-color`, `chevrotain@11`) must be explicitly present in the root `package.json` dependencies if the Next.js compiler cannot resolve them from the local fork.

## Troubleshooting

*   **Next.js Caching Issues**: Re-installing or modifying the massive local Excalidraw package often confuses the Next.js build cache. If you hit strange `ENOENT` errors (e.g., `fallback-build-manifest.json` missing) or phantom module errors, **delete the root `.next` directory** and restart `npm run dev`.
*   **Dependency Hoisting**: If the React app throws parser errors (e.g., `chevrotain-allstar` export errors), verify that an older version of the dependency hasn't been hoisted by another library (like `react-spreadsheet`). Force the correct version (e.g., `chevrotain@^11`) in the root `package.json`.
