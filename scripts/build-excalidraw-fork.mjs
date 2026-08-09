import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

/**
 * Builds the vendored Excalidraw fork's published packages.
 *
 * WHY THIS EXISTS
 *
 * The app depends on `@excalidraw/excalidraw` through a `file:` specifier, so
 * npm symlinks `node_modules/@excalidraw/*` straight at the vendored fork. Each
 * of those packages publishes ONLY generated output — `main`, `module`,
 * `exports` and `types` all point into `dist/` — and `dist` is gitignored.
 *
 * A fresh checkout therefore has source but no `dist`, and neither `npm ci` nor
 * `next build` generates it: the fork packages declare no `prepare` script, so
 * npm has no lifecycle hook to fire. Before this script, `npm ci && npm run
 * build` failed with "Can't resolve '@excalidraw/excalidraw'".
 *
 * This script is wired to the root `prebuild`, so `npm run build` regenerates
 * the fork first. Generated output stays ignored and is never committed: the
 * repository tracks source plus this generator, not 49 MB of bundles.
 *
 * SUCCESS IS ARTIFACT-BASED, NOT EXIT-CODE-BASED
 *
 * Each package's `build:esm` ends with `gen:types` (`tsc`), and the fork has
 * known pre-existing type errors, so `tsc` exits non-zero *while still emitting
 * complete, usable declarations*. Chaining on exit status would abort the build
 * and leave later sibling packages unbuilt. So a non-zero exit is tolerated —
 * but only ever as a warning, and only when every required artifact below is
 * verified present and non-empty afterwards. Anything missing is a hard failure.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const fork = path.join(root, "components/collabboard/canvas/excalidraw_fork");
const packagesDir = path.join(fork, "packages");

/** The 6A public API. Its absence means the app would silently lose the hook. */
const MARKER = "customContextMenuRenderer";

/**
 * Build order is dependency order, taken from each package.json's own
 * `@excalidraw/*` dependencies:
 *
 *   common     → (none)
 *   math       → common
 *   element    → common, math
 *   excalidraw → common, element, math
 *
 * Required artifacts are the concrete entry points each package.json actually
 * declares in `main` / `types` / `exports`, restricted to what the builders
 * genuinely emit. (`element` declares an `./visualdebug` export that its
 * builder does not produce, so requiring it would fail a healthy build.)
 */
const PACKAGES = [
  {
    name: "@excalidraw/common",
    dir: "common",
    runtime: ["dist/prod/index.js", "dist/dev/index.js"],
    types: ["dist/types/common/src/index.d.ts"],
  },
  {
    name: "@excalidraw/math",
    dir: "math",
    runtime: ["dist/prod/index.js", "dist/dev/index.js"],
    types: ["dist/types/math/src/index.d.ts"],
  },
  {
    name: "@excalidraw/element",
    dir: "element",
    runtime: ["dist/prod/index.js", "dist/dev/index.js"],
    types: ["dist/types/element/src/index.d.ts"],
  },
  {
    name: "@excalidraw/excalidraw",
    dir: "excalidraw",
    // index.css is a real export (`./index.css`) that ExcalidrawWrapper imports.
    runtime: [
      "dist/prod/index.js",
      "dist/dev/index.js",
      "dist/prod/index.css",
      "dist/dev/index.css",
    ],
    types: ["dist/types/excalidraw/index.d.ts", "dist/types/excalidraw/types.d.ts"],
    // Files that must contain MARKER: both runtime bundles and the public types.
    markerFiles: [
      "dist/prod/index.js",
      "dist/dev/index.js",
      "dist/types/excalidraw/types.d.ts",
    ],
  },
];

/**
 * `scripts/buildPackage.js` (the excalidraw bundler) reads these two files
 * unconditionally via `parseEnvVariables`, so a missing file is a hard ENOENT
 * mid-build. They are untracked — the repository's root `.gitignore` ignores
 * `.env*` — so a fresh checkout has neither, and only the excalidraw package
 * needs them (`buildBase.js`, used by the siblings, does not read them).
 *
 * They are empty by design in this repository: the vendored fork carries no
 * Excalidraw-specific environment configuration, and every known-good local
 * build was produced with both files present and zero bytes. Creating them
 * empty when absent therefore reproduces that exact state rather than inventing
 * configuration. Existing files are never touched.
 */
const ensureForkEnvFiles = () => {
  for (const name of [".env.development", ".env.production"]) {
    const file = path.join(fork, name);
    if (existsSync(file)) continue;
    writeFileSync(file, "");
    log(`created empty ${name} (untracked, required by the fork's bundler)`);
  }
};

const log = (message) => console.log(`[excalidraw-fork] ${message}`);
const warn = (message) => console.warn(`[excalidraw-fork] ${message}`);

const fail = (message) => {
  console.error(`[excalidraw-fork] FAILED: ${message}`);
  console.error(
    "[excalidraw-fork] The app resolves @excalidraw/* to generated output in the vendored fork.",
  );
  console.error(
    "[excalidraw-fork] Without it, `next build` cannot resolve '@excalidraw/excalidraw'.",
  );
  console.error("[excalidraw-fork] Generated output is ignored and must not be committed.");
  process.exit(1);
};

const requiredFiles = (pkg) => [...pkg.runtime, ...pkg.types];

/** Present and non-empty. A zero-byte bundle is a failed build, not a build. */
const isUsable = (absolute) => {
  try {
    return statSync(absolute).size > 0;
  } catch {
    return false;
  }
};

/** Newest mtime across a package's tracked source (dist and deps excluded). */
const newestSourceMtime = (dir) => {
  let newest = 0;
  const walk = (current) => {
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === "dist" || entry.name === "node_modules") continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      try {
        const { mtimeMs } = statSync(full);
        if (mtimeMs > newest) newest = mtimeMs;
      } catch {
        /* races on transient files are not interesting here */
      }
    }
  };
  walk(dir);
  return newest;
};

/**
 * Skip a package only when every required artifact already exists and is newer
 * than that package's newest source file. Set FORCE_EXCALIDRAW_FORK_BUILD=1 to
 * always rebuild. Verification below runs either way, so a skip can never let
 * an incomplete artifact set through.
 */
const isUpToDate = (pkg) => {
  if (process.env.FORCE_EXCALIDRAW_FORK_BUILD === "1") return false;
  const dir = path.join(packagesDir, pkg.dir);
  const files = requiredFiles(pkg).map((relative) => path.join(dir, relative));
  if (!files.every(isUsable)) return false;
  const oldestArtifact = Math.min(...files.map((file) => statSync(file).mtimeMs));
  return oldestArtifact >= newestSourceMtime(dir);
};

const buildPackage = (pkg) => {
  const relative = path
    .relative(root, path.join(packagesDir, pkg.dir))
    .split(path.sep)
    .join("/");

  // Run from the repository root with root node_modules/.bin on PATH: the
  // packages' scripts shell out to `rimraf`, which lives only in the root
  // install. npm adds that directory for its own scripts, but this script must
  // also work when invoked directly as `node scripts/build-excalidraw-fork.mjs`.
  const binDir = path.join(root, "node_modules", ".bin");
  const result = spawnSync("corepack", ["yarn", "--cwd", relative, "build:esm"], {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
    env: { ...process.env, PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}` },
  });

  if (result.error) {
    fail(`could not run the generator for ${pkg.name}: ${result.error.message}`);
  }
  return result;
};

const verifyPackage = (pkg, result) => {
  const dir = path.join(packagesDir, pkg.dir);

  const missingRuntime = pkg.runtime.filter((f) => !isUsable(path.join(dir, f)));
  const missingTypes = pkg.types.filter((f) => !isUsable(path.join(dir, f)));

  if (missingRuntime.length || missingTypes.length) {
    if (result) {
      process.stdout.write(result.stdout ?? "");
      process.stderr.write(result.stderr ?? "");
    }
    if (missingRuntime.length) {
      fail(`${pkg.name} is missing required runtime output: ${missingRuntime.join(", ")}`);
    }
    fail(`${pkg.name} is missing required type output: ${missingTypes.join(", ")}`);
  }

  for (const relative of pkg.markerFiles ?? []) {
    const contents = readFileSync(path.join(dir, relative), "utf8");
    if (!contents.includes(MARKER)) {
      fail(
        `${pkg.name}/${relative} does not contain "${MARKER}". The generated output ` +
          `predates the custom context-menu renderer, so the Drawing menu would ` +
          `silently fall back to Excalidraw's native one.`,
      );
    }
  }
};

if (!existsSync(packagesDir)) {
  fail(`vendored fork packages directory is missing: ${packagesDir}`);
}

ensureForkEnvFiles();

let built = 0;
for (const pkg of PACKAGES) {
  if (!existsSync(path.join(packagesDir, pkg.dir, "package.json"))) {
    fail(`vendored package is missing: ${path.join(packagesDir, pkg.dir)}`);
  }

  if (isUpToDate(pkg)) {
    log(`${pkg.name}: artifacts newer than source, skipping build`);
    verifyPackage(pkg, null);
    continue;
  }

  log(`${pkg.name}: building...`);
  const result = buildPackage(pkg);

  if (result.status !== 0) {
    // Expected: the fork has known pre-existing type errors, and `tsc` emits
    // declarations anyway. Tolerated only because verification follows.
    warn(
      `${pkg.name}: generator exited ${result.status} (known pre-existing fork ` +
        `type errors). Verifying emitted artifacts instead.`,
    );
  }

  verifyPackage(pkg, result);
  log(`${pkg.name}: OK`);
  built += 1;
}

log(
  built === 0
    ? `all ${PACKAGES.length} packages already up to date; artifact contract verified`
    : `built ${built}/${PACKAGES.length} package(s); artifact contract verified`,
);
