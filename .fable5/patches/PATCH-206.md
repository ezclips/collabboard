# PATCH-206 — The Spotify tab tells the truth: signed in on the web, the whole transcript copies, with timestamps

Status: AUTHORIZED (PM decision, 2026-09-27).
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-205 (`b75208aa`)

## 0. Why: the owner disproved PATCH-204's research
PATCH-204 said Spotify "does not let you copy or export" transcripts (third-party articles). The
owner tested it on 2026-09-27. On `open.spotify.com/episode/…`, **signed in**, the episode page has
a **"Transcript" tab next to "Description"**, and the whole transcript can be selected and copied.
Signed out (the CTO's test browser) there is no such tab. The copied text looks like:
```
0:12
Speaker 1
Exactly.
0:13
Speaker 2
Just every morning.
```
**The CTO ran that sample through the existing parser:** `parseKnowledgeTranscript(text, 'youtube-panel')`
gives correct cues (`startMs` 12000, 13000, …), with the speaker kept in the text ("Speaker 1
Exactly."). With `plain`, the timestamps are lost. So no parser work is needed; only the tab is
wrong, and it currently sends people away from a source that works.

Read first: `components/collabboard/MediaPostTranscriptDialog.tsx` (the tab table ~101, the Spotify
tab text, `transcriptFormatForTab`), its test, and `KnowledgeTranscriptImportPanel.tsx` (the format
option labels).

## 1. Design
- **Spotify tab**
  - badge: `Full text + timestamps`;
  - text, as numbered steps like the others:
    1. Press "Open in Spotify" and sign in to Spotify in your browser. The transcript is only shown
       when you are signed in.
    2. On the episode page, click the **"Transcript"** tab next to "Description". Not every episode
       has one.
    3. Select the whole transcript (click at its start, then Shift+click at its end) and copy it
       (Ctrl+C).
    4. Come back to this tab and press "Paste transcript".
  - one note line: `Leave the timestamps and speaker names in. The timestamps let a citation point
    to the moment it was said.`
  - format for this tab: **`youtube-panel`** (the same line layout as Spotify's), not `plain`.
- **The format option label** `youtube-panel` is shown as today's YouTube-only wording. Change the
  visible label to `Transcript panel with timestamps (YouTube, Spotify)`. Keep the stored value
  `youtube-panel`. If a test or census pins the old label, STOP and ask.
- The YouTube tab's tip ("many podcasts are also on YouTube…") stays. The Apple tab's tip currently
  suggests YouTube or Pocket Casts; add Spotify there: `…use the YouTube, Spotify or Pocket Casts tab:
  you get the whole text at once.`

## 2. Tests
- The Spotify tab: badge `Full text + timestamps`, the 4 steps (the "Transcript" step present), and
  the format preselected as `youtube-panel` while the box is empty.
- A parser test pinning Spotify's layout (the sample above, including a multi-line cue) with
  `youtube-panel` → cues with the right `startMs` and the speaker in the text. Put it next to the
  existing youtube-panel parser tests.
- **Mutations:**
  1. The Spotify tab format back to `plain` → the preselect test fails.
  2. Drop the speaker/multi-line handling (e.g. keep only the first text line) → the parser test
     fails. If the parser already has no such branch, say so and skip this mutation.

## 3. Allowed files
```
components/collabboard/MediaPostTranscriptDialog.tsx (+ test)
components/collabboard/KnowledgeTranscriptImportPanel.tsx   (the visible option label only)
lib/domain/knowledge/knowledgeTranscriptCues test file       (the new parser test only; no parser change)
```
Forbidden: parser logic, the database, the route, `package.json`. If a census pins a changed string,
STOP and ask (spec line, code at file:line, proposed resolution).

Use `rg` or `timeout 30` on every search. Every test command is `timeout 600 npx vitest run …`.
Delete temporary diagnostic files. Never use git stash, reset, restore, checkout, clean, commit or
push. Never run a production build. Real tool calls only.

## 4. Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run components/collabboard/MediaPostTranscriptDialog components/collabboard/KnowledgeTranscriptImportPanel lib/domain/knowledge
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-206.json
```
The failing FILE set must equal the 26-file baseline. Compact report. Do not commit.

## 5. Commit message (verbatim)
```
fix(transcript): Spotify transcripts copy in full when signed in

The Spotify tab said transcripts could not be copied. The owner found
the "Transcript" tab on Spotify's web player, which appears once signed
in, and copies whole with timestamps and speakers -- a layout the
existing panel parser already reads. The tab now gives those steps and
preselects the timestamped format.
```
