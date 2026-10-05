import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Copies the vendored Excalidraw fork's built fonts into the app's own
 * `public/` tree.
 *
 * WHY THIS EXISTS
 *
 * The drawing editor used to fetch its fonts from unpkg.com. That host serves
 * the LATEST npm release, while we run a vendored fork whose font files carry
 * content hashes; a hash the latest release no longer ships 404s and the editor
 * silently falls back to a system font. Serving the fork's own fonts from our
 * origin removes the availability, privacy and correctness dependency.
 *
 * The fork appends `fonts/<Family>/<file>` to `window.EXCALIDRAW_ASSET_PATH`, so
 * the target is `public/excalidraw-assets/fonts/<Family>/<file>` and the wrapper
 * points that global at `<origin>/excalidraw-assets/`. See
 * `packages/excalidraw/fonts/ExcalidrawFontFace.ts` (`createUrls`).
 *
 * Only `.woff2` files are copied, stale files in the target are removed first,
 * and the script is idempotent. Override the source/target with
 * `EXCALIDRAW_FONTS_SOURCE` / `EXCALIDRAW_ASSETS_TARGET` (tests point them at
 * throwaway directories).
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const sourceDir = path.resolve(
  process.env.EXCALIDRAW_FONTS_SOURCE ??
    path.join(
      root,
      "components/collabboard/canvas/excalidraw_fork/packages/excalidraw/dist/prod/fonts",
    ),
);
const targetDir = path.resolve(
  process.env.EXCALIDRAW_ASSETS_TARGET ?? path.join(root, "public/excalidraw-assets/fonts"),
);

const log = (message) => console.log(`[excalidraw-assets] ${message}`);

if (!existsSync(sourceDir)) {
  console.error(`[excalidraw-assets] FAILED: the fork's fonts are not built: ${sourceDir}`);
  console.error("[excalidraw-assets] run `npm run build:fork` first.");
  process.exit(1);
}

// Remove stale files before copying so a deleted/renamed font never lingers.
if (existsSync(targetDir)) {
  rmSync(targetDir, { recursive: true, force: true });
}

let copied = 0;
const walk = (current) => {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const full = path.join(current, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!entry.name.endsWith(".woff2")) continue;

    const destination = path.join(targetDir, path.relative(sourceDir, full));
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(full, destination);
    copied += 1;
  }
};
walk(sourceDir);

log(`copied ${copied} font file(s) to ${targetDir}`);
