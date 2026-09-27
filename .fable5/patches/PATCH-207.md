# PATCH-207 — The Spotify tab says you only get what is on the screen

Status: AUTHORIZED (owner: "yes, only what is on the screen", 2026-09-27).
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-206 (`97c71ead`)

## Why
Measured by the CTO and confirmed by the owner in Vivaldi: Spotify's transcript keeps only about
20-28 rows (a few minutes) on the page, and swaps them as you scroll. A select-and-copy gets only
the rows on screen. The owner's paste after scrolling to the end started at 3:17:48 of a 3:18:02
episode. The Chrome extensions fail the same way (reviews July–Sept 2026: "only pulled the first
2 minutes"). The Spotify tab's step 3 ("Select the whole transcript…") promises more than it can
deliver.

## Change (`components/collabboard/MediaPostTranscriptDialog.tsx`, Spotify tab only)
- Badge: `Full text + timestamps` → `Timestamps · on-screen part only`.
- Step 3 becomes: `Select the transcript text you can see and copy it (Ctrl+C). Spotify only
  keeps a few minutes on screen at a time, so you get just that part.`
- Add a line under the steps, styled like the other tabs' tip:
  `For long episodes: if the episode is also on YouTube, use the YouTube tab. It gives the full
  transcript with timestamps.`
- Everything else stays: steps 1, 2 and 4, the note about timestamps and speakers, the format
  preselect `youtube-panel`, and the open button.

## Tests
Update the PATCH-206 Spotify-tab test: the new badge, the "on screen" sentence and the YouTube tip
are present, and the format preselect is unchanged. Mutation: drop the "on screen" sentence → the
test fails.

## Allowed files
```
components/collabboard/MediaPostTranscriptDialog.tsx
components/collabboard/MediaPostTranscriptDialog.test.tsx
```
Every test command is `timeout 600 npx vitest run …`; `rg` or `timeout 30` for searches. No
stash/reset/restore/checkout/clean/commit/push, no production build, no database. Real tool calls only.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run components/collabboard/MediaPostTranscriptDialog
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-207.json
```
The failing FILE set must equal the 26-file baseline. Compact report. Do not commit.

## Commit message (verbatim)
```
fix(transcript): the Spotify tab says only the on-screen part copies

Spotify keeps only a few minutes of a transcript on screen and swaps
them as you scroll, so a copy gets just that part -- measured, and
confirmed by the owner in a second browser. The tab now says so and
points long episodes to the YouTube tab for the full transcript.
```
