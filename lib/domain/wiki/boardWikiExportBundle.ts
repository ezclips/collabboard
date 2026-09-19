// The OKF export bundle as the CLIENT receives it: what one is, whether a
// payload is one, and the name it saves under.
//
// Pure -- no fetch, no archive, no DOM. Zipping and downloading are the
// drawer's business because both are browser APIs; WHAT REACHES THEM is decided
// here, where it can be tested without mounting anything.
//
// ===========================================================================
// THE PARSE IS FAIL-CLOSED AND THE NAMES ARE VALIDATED, THOUGH WE SERVE IT
// ===========================================================================
//
// A bundle entry's name becomes a path inside a zip archive, and an archive
// whose entry names were never checked is the classic zip-slip: `../../x`
// escapes the target directory on extraction in more tools than have been
// fixed. Our route cannot currently emit such a name -- `boardWikiOkfFilename`
// appends `.md` to a slug that is `[a-z0-9-]` by construction. That is the
// argument for keeping the check, not for dropping it: the property lives in a
// different module than the archive does, so nothing here would notice the day
// the slug rule loosens.

/** One bundle entry: its name inside the archive, and its OKF text. */
export interface BoardWikiExportFile {
  readonly name: string;
  readonly content: string;
}

/**
 * The reserved OKF index. Its presence is what separates a bundle from any
 * object that happens to carry a `files` map, so it is REQUIRED rather than
 * merely expected -- a truncated or foreign payload fails here instead of
 * downloading as a plausible-looking archive with pages missing.
 */
const OKF_INDEX = 'index.md';

/** Exactly the shape `boardWikiOkfFilename` can produce, and nothing else. */
const OKF_FILENAME = /^[a-z0-9][a-z0-9-]*\.md$/;

/**
 * The bundle, or null if the payload is not one. Null is the only failure
 * signal: a partial bundle is never returned, because the failure this guards
 * against is a person believing they exported their wiki when they exported
 * some of it.
 */
export function parseBoardWikiExportBundle(
  payload: unknown,
): readonly BoardWikiExportFile[] | null {
  if (typeof payload !== 'object' || payload === null) return null;

  const files = (payload as { files?: unknown }).files;
  if (typeof files !== 'object' || files === null || Array.isArray(files)) return null;

  const entries = Object.entries(files as Record<string, unknown>);
  if (!entries.some(([name]) => name === OKF_INDEX)) return null;

  const parsed: BoardWikiExportFile[] = [];
  for (const [name, content] of entries) {
    if (!OKF_FILENAME.test(name)) return null;
    if (typeof content !== 'string') return null;
    parsed.push({ name, content });
  }

  // Deterministic order however the response enumerated its keys: the index
  // first because it is the entry point a reader opens, then alphabetically.
  // Two responses differing only in key order must produce the same archive.
  return parsed.sort((a, b) => {
    if (a.name === OKF_INDEX) return -1;
    if (b.name === OKF_INDEX) return 1;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
}

/**
 * The archive's name, mirroring the workspace export's
 * `workspace-export-<date>.zip` rather than inventing a second convention.
 *
 * Two boards exported on one day collide, and the browser disambiguates them.
 * That is the chosen trade: the alternative is a board id in the filename,
 * which names the archive after something the person holding it cannot read.
 */
export function boardWikiExportFilename(now: Date): string {
  return `board-wiki-export-${now.toISOString().split('T')[0]}.zip`;
}
