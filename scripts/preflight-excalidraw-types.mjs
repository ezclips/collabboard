import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

// PATCH-144: declaration-count floor. 410 .d.ts files are emitted by the fork today;
// this floor tolerates legitimate upstream shrinkage/growth while still catching
// catastrophic partial emit (a handful of files instead of hundreds).
const DECLARATION_COUNT_FLOOR = 300;
const FRESHNESS_TOLERANCE_MS = 5_000;

const root = process.cwd();
const fork = path.resolve(root, "components/collabboard/canvas/excalidraw_fork");
const pkg = path.join(fork, "packages/excalidraw");
const distTypes = path.join(pkg, "dist/types");
const expected = path.join(distTypes, "excalidraw/index.d.ts");
const command = "corepack yarn --cwd components/collabboard/canvas/excalidraw_fork/packages/excalidraw gen:types";

const fail = (message) => {
  console.error(`[excalidraw-types] ${message}`);
  console.error(`Missing declarations make TypeScript infer JS bundles and report misleading application errors.`);
  console.error(`Attempted generation command: ${command}`);
  console.error("Generated dist output is ignored and must not be committed.");
  process.exit(1);
};

const countDeclarations = () =>
  existsSync(distTypes) ? readdirSync(distTypes, { recursive: true }).filter((f) => f.endsWith(".d.ts")) : [];

if (!existsSync(fork)) fail(`Fork directory is missing: ${fork}`);
if (!existsSync(path.join(pkg, "package.json"))) fail(`Fork package is missing: ${pkg}`);
if (existsSync(expected)) {
  console.log(`[excalidraw-types] declarations present: ${expected}`);
  process.exit(0);
}
console.error(`[excalidraw-types] missing declaration: ${expected}`);

// Safe-path guard: distTypes must resolve directly under `pkg` as `dist/types`, never
// outside it, before we delete anything.
if (!distTypes.startsWith(pkg + path.sep) || path.basename(distTypes) !== "types" || path.basename(path.dirname(distTypes)) !== "dist") {
  fail(`Refusing to clean an unexpected path: ${distTypes}`);
}
// Clean-before-generate (PATCH-144 §5a/§5b): only reached when the entry declaration was
// already absent, so nothing usable is destroyed. A stale/partial tree left by a prior
// failed run (e.g. TS5055-blocked emit) must not survive into this attempt.
rmSync(distTypes, { recursive: true, force: true });
if (existsSync(distTypes)) fail(`Could not remove stale declaration tree: ${distTypes}`);

const genStart = Date.now();
const result = spawnSync("corepack", [
  "yarn", "--cwd", "components/collabboard/canvas/excalidraw_fork/packages/excalidraw", "gen:types",
], { cwd: root, encoding: "utf8", shell: process.platform === "win32" });

if (result.error) fail(`Generation command unavailable: ${result.error.message}`);
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;

if (output.includes("TS5055")) fail("Generator reported TS5055 (emit blocked by pre-existing output) despite clean-before-generate. Declarations are not trustworthy.");
if (!existsSync(expected)) fail(`Generation completed but declaration is still absent: ${expected}`);

const declarations = countDeclarations();
if (declarations.length < DECLARATION_COUNT_FLOOR) {
  fail(`Only ${declarations.length} declaration files emitted (floor: ${DECLARATION_COUNT_FLOOR}). Treating output as incomplete.`);
}
if (statSync(expected).mtimeMs < genStart - FRESHNESS_TOLERANCE_MS) {
  fail(`Entry declaration is not fresh (mtime predates this invocation): ${expected}`);
}

if (result.status !== 0) {
  console.error(`[excalidraw-types] generator exited ${result.status}, but emitted ${declarations.length} fresh declarations (no TS5055).`);
  console.error(`[excalidraw-types] the repository typecheck that runs next is the authoritative usability check.`);
}
console.log(`[excalidraw-types] declarations generated: ${expected} (${declarations.length} files)`);
