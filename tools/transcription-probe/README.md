# transcription-probe — Stage 4 engine instrument (PATCH-154)

An instrument, not a feature. It measures whether we can generate a trustworthy
timestamped transcript from uploaded media, and it compares two candidates:

| | candidate | licence of the CODE | how it is invoked |
|---|---|---|---|
| baseline | **faster-whisper** | MIT | its own CLI / module |
| challenger | **pyVideoTrans** | GPL-3.0 | `cli.py`, as a **separate process** |

Nothing here is imported by the application. Neither engine becomes a
repository dependency: the Python side lives **outside this repo**, in an
isolated environment, and what lands in the repo is this harness, the corpus
manifest, the raw run and the findings.

---

## Status: Phase A only

PATCH-154 splits execution in two. **Phase A is authorized. Phase B is not** —
it needs a corpus that does not exist yet, whose rights basis is an owner
decision.

- **Phase A (done):** licensing evidence gathered, this harness built, a corpus
  proposed. **Nothing installed, nothing downloaded, nothing measured.**
- **Phase B (not started):** install the environment, download the models, run
  Gate 1 (no-speech) and Gate 2 (comparison), measure cost, write the findings.

`probe.mjs` therefore runs on an **empty** corpus and exits cleanly. That is its
Phase A acceptance test, not a stub:

```
node tools/transcription-probe/probe.mjs
# nothing to measure: corpus.json has no clips.
# ...
# wrote tools/transcription-probe/last-run.json
```

---

## What gets installed — and where (Phase B, for the reader who has not read the patch)

**None of this has been performed.** It is documented here so that Phase B is
reproducible and so its disk cost is known before it is authorized.

The environment is created **outside the repository**, deliberately, so no path
inside the repo can accidentally depend on it. Suggested location:

```
%LOCALAPPDATA%\collabboard-transcription\        (Windows)
~/collabboard-transcription/                      (macOS/Linux)
```

Both candidates need Python 3.10+ and **ffmpeg on PATH**. pyVideoTrans ships a
prepackaged Windows `.exe` with no Python required; the source route uses `uv`.

| what | rough disk | notes |
|---|---|---|
| Python environment (faster-whisper + ctranslate2, or pyVideoTrans + PySide6) | 1–5 GB | grows with optional channels; pyVideoTrans's `--all-extras` is the large end |
| whisper model weights (`large-v3`) | ~3 GB fp16 | **per candidate** if both keep their own copy; multi-GB downloads |
| ffmpeg | ~100 MB | must be on PATH; see the licensing note in the findings |
| media corpus | varies | **never committed**; lives in `media/`, which is gitignored |

> **Disk is a real gate, not a footnote.** The patch requires actual disk used
> and install locations to be reported, and requires stopping to ask before
> consuming unreasonable disk.

### Removing it

Delete the environment directory above. There is nothing inside the repository
to uninstall — the only repo-side artifacts are this harness, the manifest, the
raw run and the findings document, and `git revert` of the patch's commit
removes them.

---

## The corpus manifest

`corpus.json` is the **manifest**. It ships with an EMPTY `clips` array plus a
`proposedSources` section listing the corpora researched in Phase A and a
`notCoveredByOpenCorpora` section naming the categories an open corpus cannot
supply.

**Media files are never committed.** `mediaPath` is resolved inside
`tools/transcription-probe/media/` and is never an absolute path outside it.

Every clip MUST carry a non-empty **`rightsBasis`**. The probe **refuses to run
on any clip that lacks one** — possession of a file is not permission to process
it:

```
! the manifest cannot be run:
    clips[0] (x): REFUSED -- no rightsBasis. Possession of a file is not permission to process it.
```

A clip whose `referenceTranscriptPath` is `null` can be **measured but not
scored**. Scoring compares against human references derived **independently of
both engines**; neither engine's output may be ground truth for the other.

---

## Running it

```
# Phase A acceptance: empty corpus, exits 0
node tools/transcription-probe/probe.mjs

# point at another manifest
node tools/transcription-probe/probe.mjs --corpus=<path>

# write the raw run somewhere else
node tools/transcription-probe/probe.mjs --json=<path>
```

Exit codes: `0` ran (including the honest "nothing to measure" case); `1` the
manifest is unreadable, or a clip is missing a rights basis.

---

## The pinned configuration

Model, decoding settings and VAD are pinned in `CONFIGURATION` at the top of
`probe.mjs` and copied into every result, so a number can never be read without
the settings that produced it. `vad` is set explicitly rather than left at a
library default — the no-speech gate depends on what it does, and a default
nobody wrote down is indistinguishable from a setting nobody chose.

Two gates precede any comparison, both in that file:

1. **Licensing** — assessed before anything is installed; see the findings.
2. **The no-speech gate (BLOCKING)** — a candidate that invents speech over
   silence fails, and no other result redeems it. It carries a **quiet-real-
   speech positive control**, because a gate built only from negatives is passed
   by a pipeline that transcribes nothing.

---

## What this instrument does NOT do

- It does not score accuracy in Phase A, and it will not score against either
  engine's own output in Phase B.
- It does not implement any product storage, retention or sweep. Uploaded media
  is orders of magnitude larger than a transcript, and its lifecycle is recorded
  separately in the patch (and in `.agent/retrieval-followups.md` item 19).
- It does not establish server behaviour. A desktop result is not a deployment
  result.
