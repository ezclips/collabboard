# PATCH-204 — Transcripts from podcasts: a tab per app in "Add a transcript", and podcast links recognised

Status: AUTHORIZED (PM decision, 2026-09-27). Owner: "a horizontal menu with YouTube, Spotify, Apple
and so on; the workflow does not change, only the instruction for each app, so we can bring in
more transcripts than just YouTube. I know Spotify is going to be hard."
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-203 (`1878d184`)

## 0. Research (CTO, 2026-09-27): what each app lets a person copy
| App | Share of listening | Transcript visible | Can the person copy it? |
|---|---|---|---|
| YouTube | largest weekly reach | yes ("Show transcript") | **yes, all of it, with timestamps** (works today) |
| Spotify | largest podcast platform | yes, read-along, many shows | **no**: no highlight, copy or export |
| Apple Podcasts | largest dedicated podcast app | yes, most episodes (auto) | **only in parts**: about 200 words per selection |
| Pocket Casts | smaller | yes, when the show publishes one (Podcasting 2.0), plus auto for Plus | **yes, all of it**: Transcript → Share |
| The show's website / feed | — | many shows publish a transcript page or an `.srt`/`.vtt` file (Podcasting 2.0 `<podcast:transcript>`) | **yes, with timestamps** as SRT/VTT, which the importer already reads |

The importer already accepts `youtube-panel`, `srt`, `vtt` and `plain`, so no parser work is needed.
Two real gaps:
1. The dialog only speaks YouTube, including an "Open the video on YouTube" button shown for every
   link.
2. `mediaPostVideoIdentity` (`lib/domain/knowledge/mediaPostVideoIdentity.ts`) does not recognise
   Spotify, Apple Podcasts or Pocket Casts links. A podcast card therefore never offers
   "Add transcript", and the dialog cannot be reached for it.

Read first:
- `components/collabboard/MediaPostTranscriptDialog.tsx` (all of it; `transcriptSourceUrl`,
  `transcriptImportVideoIdentity`, the `initialFormat="youtube-panel"` note);
- `components/collabboard/KnowledgeTranscriptImportPanel.tsx`: how `initialFormat` is applied, and
  whether a later change reaches it;
- `lib/domain/knowledge/mediaPostVideoIdentity.ts` + its tests (`MediaPostProvider`, the
  `canonical` rule, the W1/W7 reuse/change rules);
- every consumer of `MediaPostProvider` / `mediaPostVideoIdentity`, found with `rg`: e.g.
  `seekBoardVideo`, `boardTranscriptIndex.ts`, the card player, `transcriptSourceUrl`.

---

## 1. The dialog: one tab per app
A horizontal tab row under the title, scrolling sideways on narrow screens (`role="tablist"`,
arrow keys move between tabs):

**YouTube · Apple Podcasts · Spotify · Pocket Casts · Website or file**

Each tab shows:
- a small badge saying what you get: `Full text + timestamps` (YouTube, Website or file),
  `Full text` (Pocket Casts), `Copy in parts` (Apple Podcasts), `No copying` (Spotify);
- its steps (texts below, verbatim unless a word is plainly wrong);
- its open button, opening the CARD's own URL in a new tab, labelled for the app: `Open on YouTube ↗`,
  `Open in Apple Podcasts ↗`, `Open in Spotify ↗`, `Open in Pocket Casts ↗`. The Website or file
  tab has no open button unless the card's URL is a plain web page (then `Open the page ↗`).
- "Paste transcript" and the import panel below, unchanged and SHARED by all tabs. Switching tabs
  never clears pasted text.

**Which tab opens first:** the card's provider: youtube → YouTube, spotify → Spotify,
apple-podcasts → Apple Podcasts, pocketcasts → Pocket Casts, anything else → Website or file.

**Format follows the tab** while the transcript box is empty and the person has not picked a
format themselves: YouTube → `youtube-panel`; Apple, Spotify, Pocket Casts → `plain`; Website or
file → no preselection ("Choose the format you pasted…"). Once they pick a format, or text is in
the box, a tab switch never changes it.

### Tab texts
**YouTube** (keep today's steps and the timestamps note), plus a tip line:
`Tip: many podcasts are also on YouTube. That is the easiest way to get the full text with timestamps.`

**Apple Podcasts**
1. Open the episode in the Apple Podcasts app and start playing it.
2. Open the transcript: on a Mac, click the transcript button (speech bubble) in the player; on an
   iPhone, open the player and tap the transcript button.
3. Select a section and copy it. Apple only lets you copy a few paragraphs at a time, so paste,
   then come back for the next section.

Tip: `If the show is on YouTube or Pocket Casts, use that tab: you get the whole text at once.`

**Spotify**
`Spotify shows transcripts for many episodes, but does not let you copy or export them.`
`Find the same episode on YouTube, Pocket Casts or the show's website, and use that tab instead.`
No numbered steps. The open button stays (to find the show's name). "Paste transcript" stays too
(if someone has the text from elsewhere).

**Pocket Casts**
1. Open the episode in Pocket Casts.
2. Open "Transcript" (available when the show publishes one; Plus members also get automatic
   transcripts for some shows).
3. Tap "Share" and copy the transcript, then come back here and press "Paste transcript".

**Website or file**
1. Many shows publish the transcript on the episode's web page, or as a transcript file (`.srt`
   or `.vtt`).
2. Copy the text from the page, or open the file and copy everything in it.
3. Choose SRT or VTT below if you copied a file, so the timestamps are kept; otherwise choose
   Plain text.

## 2. Recognise podcast links (`mediaPostVideoIdentity.ts`)
Add providers `'spotify' | 'apple-podcasts' | 'pocketcasts'`:
- **Spotify:** `open.spotify.com/episode/<id>` (also with `/intl-xx/` before `episode`) →
  identity `spotify:episode:<id>`, canonical true. A `/show/` link is a show, not an episode:
  NOT media (returns null), so the card offers no transcript for a whole show.
- **Apple Podcasts:** `podcasts.apple.com/...id<digits>?i=<digits>` → `apple-podcasts:<i>`,
  canonical true. Without `i=` it is a show: null.
- **Pocket Casts:** `pca.st/...` or `pocketcasts.com/...` episode links → the normalised URL,
  `canonical: false`. Its ids are not reliably extractable, and the W1/W7 rules already handle
  non-canonical identities.
- Every consumer found with `rg` must stay correct. In particular, **seeking**: a podcast card has
  no seekable player here, so `seekBoardVideo` must return false for these providers (the
  citation then opens the transcript in the reader, the documented fallback). If a consumer needs a
  real decision (e.g. how the card embeds a Spotify player), STOP and ask.

## 3. Tests
- `mediaPostVideoIdentity` tests:
  - Spotify episode (with and without `intl-de`, with `?si=` tracking) → `spotify:episode:<id>`;
    a Spotify show link → null;
  - an Apple episode with `?i=` → `apple-podcasts:<i>`; without → null;
  - a Pocket Casts episode → non-canonical;
  - `mediaPostCarriesSpokenContent` is true for all three episode kinds.
- Dialog tests (new `MediaPostTranscriptDialog.test.tsx`, or extend an existing one):
  - the tab row has the 5 tabs, and the initial tab follows the URL (a Spotify URL opens on
    Spotify, a YouTube URL on YouTube, a plain page on Website or file);
  - the Spotify tab shows "does not let you copy" and has no numbered steps;
  - the open button's label and href follow the tab and the card URL;
  - format: Apple → `plain` while empty; after typing into the box, switching to YouTube does NOT
    change the format; pasted text survives a tab switch.
- **Mutations** (report each):
  1. Always open on the YouTube tab → the Spotify-initial-tab test fails.
  2. Clear the text on a tab switch → the "survives" test fails.
  3. Recognise Spotify show links as media → the show test fails.

## 4. Allowed files
```
components/collabboard/MediaPostTranscriptDialog.tsx (+ test)
components/collabboard/KnowledgeTranscriptImportPanel.tsx     (only if initialFormat must follow a prop change; say why)
lib/domain/knowledge/mediaPostVideoIdentity.ts (+ its tests)
the consumers of MediaPostProvider that must change to stay correct (list each, with why)
```
Forbidden: the database, migrations, the import route, the transcript parsers, `package.json`.
No third-party transcription services, and no fetching of RSS feeds or podcast pages (a later,
separate decision). If a census or exhaustive-record test elsewhere pins the provider list, STOP and
ask, with the conflict written out (spec line, code at file:line, proposed resolution).

Use `rg` or `timeout 30` on every search. Every test command is `timeout 600 npx vitest run …`.
Delete temporary diagnostic files. Never use git stash, reset, restore, checkout, clean, commit or
push. Never run a production build. Real tool calls only.

## 5. Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run components/collabboard/MediaPostTranscriptDialog lib/domain/knowledge components/collabboard/freeformTranscriptDialogBlocking components/collabboard/MediaPostTranscriptAffordance
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-204.json
```
The failing FILE set must equal the 26-file baseline. Compact report. Do not commit.

**Live (CTO, own tab):** open "Add a transcript" (the owner's next new video, or a temporary test
card that the CTO deletes afterwards): the 5 tabs, per-tab steps, badges and open buttons; the
format follows the tab; text survives switching.

## 6. Commit message (verbatim)
```
feat(transcript): a tab per app in "Add a transcript", and podcast links

The dialog only explained YouTube. It now has a tab per app -- YouTube,
Apple Podcasts, Spotify, Pocket Casts, and a show's website or file --
each saying honestly what that app allows (Spotify does not allow
copying; Apple only in parts) and how to do it. Spotify, Apple Podcasts
and Pocket Casts episode links are now recognised, so a podcast card
offers "Add transcript". The import itself is unchanged.
```
