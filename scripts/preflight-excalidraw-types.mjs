import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const fork = path.resolve(root, "components/collabboard/canvas/excalidraw_fork");
const pkg = path.join(fork, "packages/excalidraw");
const expected = path.join(pkg, "dist/types/excalidraw/index.d.ts");
const command = "corepack yarn --cwd components/collabboard/canvas/excalidraw_fork/packages/excalidraw gen:types";

const fail = (message) => {
  console.error(`[excalidraw-types] ${message}`);
  console.error(`Missing declarations make TypeScript infer JS bundles and report misleading application errors.`);
  console.error(`Attempted generation command: ${command}`);
  console.error("Generated dist output is ignored and must not be committed.");
  process.exit(1);
};

if (!existsSync(fork)) fail(`Fork directory is missing: ${fork}`);
if (!existsSync(path.join(pkg, "package.json"))) fail(`Fork package is missing: ${pkg}`);
if (existsSync(expected)) {
  console.log(`[excalidraw-types] declarations present: ${expected}`);
  process.exit(0);
}

console.error(`[excalidraw-types] missing declaration: ${expected}`);
const result = spawnSync("corepack", [
  "yarn",
  "--cwd",
  "components/collabboard/canvas/excalidraw_fork/packages/excalidraw",
  "gen:types",
], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });

if (result.status !== 0) fail(`Generation command failed with exit code ${result.status}.`);
if (!existsSync(expected)) fail(`Generation completed but declaration is still absent: ${expected}`);
console.log(`[excalidraw-types] declarations generated: ${expected}`);
