/**
 * Stage 4 -- the transcription-engine instrument. PATCH-154, PHASE A.
 *
 * AN INSTRUMENT, NOT A FEATURE. Nothing here is imported by the application,
 * and this file ships no product code. It exists to answer one question on
 * evidence rather than preference: can we generate a trustworthy timestamped
 * transcript from uploaded media, and which of two candidates should do it?
 *
 *     baseline    faster-whisper       (MIT code; the engine pyVideoTrans wraps)
 *     challenger  pyVideoTrans CLI     (GPL-3.0 code; runs as a SEPARATE PROCESS)
 *
 * ===========================================================================
 * THIS FILE DOES NOTHING IN PHASE A, AND THAT IS ITS ACCEPTANCE TEST.
 * ===========================================================================
 *
 * Phase A is authorized; Phase B is not. No Python is installed, no model is
 * downloaded, no media is collected, and nothing is benchmarked. `corpus.json`
 * ships with an EMPTY `clips` array, so on a clean checkout this program reads
 * the manifest, finds nothing to measure, says so, writes `last-run.json`, and
 * exits 0. That is the Phase A acceptance test, not a placeholder.
 *
 * ===========================================================================
 * WHAT IT REFUSES TO DO
 * ===========================================================================
 *
 * 1. It refuses to run on a clip with no `rightsBasis`. Possession of a file is
 *    not permission to process it, and this is the one place that boundary can
 *    be enforced mechanically rather than remembered.
 * 2. It does not score accuracy. Scoring compares against INDEPENDENT human
 *    references that do not exist yet. A probe that scored against either
 *    engine's own output would make one engine ground truth for the other,
 *    which the patch forbids. A clip with a null `referenceTranscriptPath` is
 *    measured, never scored.
 * 3. It never selects the whole model on a hunch. Model, decoding settings and
 *    VAD configuration are PINNED in the `configuration` block below and are
 *    written into every result, so a number cannot outlive the settings that
 *    produced it.
 *
 * Usage:
 *   node tools/transcription-probe/probe.mjs [--corpus=<path>] [--json=<out>]
 *   node tools/transcription-probe/probe.mjs --list    # show what would run
 *
 * Exit codes:
 *   0  ran, including the honest "nothing to measure" case
 *   1  the manifest is unreadable or a clip is missing a rights basis
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...rest] = a.replace(/^--/, '').split('=');
    return [k, rest.length ? rest.join('=') : true];
  }),
);

const log = (...parts) => process.stdout.write(`${parts.join(' ')}\n`);

/* ---------------------------------------------------------------- settings */

/**
 * THE PINNED CONFIGURATION. Everything a result depends on lives here, and
 * every result carries a copy of it.
 *
 * WHY THIS IS A CONSTANT AND NOT PER-CLIP. Gate 2 compares two candidates "on
 * equal terms", and a table of numbers produced under settings nobody recorded
 * is the exact failure this patch was written to avoid. Pinning them in one
 * place means the only way to change a setting is to change it visibly.
 *
 * `vad` is deliberately explicit rather than left at a library default: a
 * default nobody wrote down is indistinguishable from a setting nobody chose,
 * and the no-speech gate depends on what it does.
 */
const CONFIGURATION = {
  baseline: {
    id: 'faster-whisper',
    invocation: 'python -m faster_whisper CLI (or the faster-whisper script)',
    model: 'large-v3 (ct2 conversion, Systran/faster-whisper-large-v3)',
    computeType: 'float16',
    beamSize: 5,
    vad: { enabled: true, engine: 'silero', note: 'evaluated explicitly, never left at a library default' },
    language: null,
    note: 'language: null means auto-detect, reported per clip. Translation is never enabled.',
  },
  challenger: {
    id: 'pyvideotrans',
    invocation: 'python cli.py --task stt --name <media> --model_name large-v3 (separate process)',
    model: 'large-v3 (its own local faster-whisper path)',
    translationEnabled: false,
    llmPostCorrectionEnabled: false,
    note: 'Translation and any optional LLM rewrite are DISABLED. An enabled rewriter compared against a raw engine is not a comparison (Gate 2).',
    isolationNote: 'Its recognition modules read shared application configuration; if isolating the transcription task proves impractical that is a FINDING to report, not a problem to fight (patch Risk 3).',
  },
  gates: {
    noSpeech: {
      blocking: true,
      negatives: ['digital-silence', 'room-noise-no-speech', 'instrumental-music-no-vocals'],
      positiveControl: 'quiet-real-speech-must-transcribe',
      rule: 'Any invented speech on any negative input FAILS that configuration and no other result redeems it.',
    },
    comparison: {
      sameMedia: true,
      translationDisabled: true,
      llmPostCorrectionDisabled: true,
      attributionRequired: 'Any pyVideoTrans advantage must be attributed to audio preprocessing, segmentation, or different model settings (patch Gate 2 and criterion 7).',
    },
  },
};

/* ----------------------------------------------------------------- helpers */

function readManifest(corpusPath) {
  if (!fs.existsSync(corpusPath)) {
    throw new Error(`corpus manifest not found: ${corpusPath}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));
  } catch (cause) {
    throw new Error(`corpus manifest is not valid JSON: ${cause.message}`);
  }
  return parsed;
}

/**
 * The gates that run BEFORE any engine is invoked.
 *
 * A clip without a rights basis stops the run. That is deliberate and it is not
 * a warning: a measurement produced from media we may not process is worse than
 * no measurement, because it looks like evidence.
 */
function validateClips(clips) {
  const problems = [];
  const seen = new Set();
  clips.forEach((clip, index) => {
    const where = `clips[${index}]${clip?.id ? ` (${clip.id})` : ''}`;
    if (!clip || typeof clip !== 'object') { problems.push(`${where}: not an object`); return; }
    if (!clip.id) problems.push(`${where}: missing id`);
    if (clip.id && seen.has(clip.id)) problems.push(`${where}: duplicate id ${clip.id}`);
    if (clip.id) seen.add(clip.id);
    if (typeof clip.rightsBasis !== 'string' || clip.rightsBasis.trim().length === 0) {
      problems.push(`${where}: REFUSED -- no rightsBasis. Possession of a file is not permission to process it.`);
    }
    if (typeof clip.licence !== 'string' || clip.licence.trim().length === 0) {
      problems.push(`${where}: no licence recorded`);
    }
    if (clip.mediaPath && path.isAbsolute(clip.mediaPath)) {
      problems.push(`${where}: mediaPath must be relative to the probe's media/ directory, not absolute`);
    }
  });
  return problems;
}

/**
 * Where media would live. Named here so the refusal is concrete rather than
 * "somewhere else": media is never committed, and never addressed by an
 * absolute path outside this directory.
 */
const MEDIA_ROOT = path.join(HERE, 'media');

/* -------------------------------------------------------------------- main */

async function main() {
  const corpusPath = typeof args.corpus === 'string' ? args.corpus : path.join(HERE, 'corpus.json');
  log(`# transcription-engine probe (PATCH-154 Phase A) -- ${new Date().toISOString()}`);
  log(`# node ${process.version}`);
  log('');

  let manifest;
  try {
    manifest = readManifest(corpusPath);
  } catch (cause) {
    log(`! ${cause.message}`);
    process.exitCode = 1;
    return;
  }

  const clips = Array.isArray(manifest.clips) ? manifest.clips : [];
  const problems = validateClips(clips);
  if (problems.length) {
    log('! the manifest cannot be run:');
    for (const problem of problems) log(`    ${problem}`);
    process.exitCode = 1;
    return;
  }

  const report = {
    // =====================================================================
    // READ THIS FIRST. The status is a TOP-LEVEL FIELD, not an inference from
    // an absence, because a reader must not be able to mistake "the harness
    // ran" for "transcription was measured and passed."
    //
    // An empty-corpus run proves the HARNESS EXECUTES. It proves NOTHING
    // about recognition quality, and it CAN NEVER satisfy the recognition-
    // quality gates below. If `status` ever reads as anything other than
    // UNRUN, a human measured real media under an owner-approved corpus.
    // =====================================================================
    status: clips.length === 0
      ? 'UNRUN -- no media processed, no measurements taken'
      : 'NOT-EVALUATED -- recognition gates are run in Phase B, which PATCH-154 does not authorize',
    statusMeaning: {
      recognitionQualityEvaluated: false,
      gate1NoSpeech: 'NOT EVALUATED -- a run with no media cannot test invented speech over silence',
      gate2Comparison: 'NOT EVALUATED -- no engine was invoked, so there is nothing to compare',
      emptyCorpusRunSatisfiesGates: false,
      note: 'An empty-corpus run demonstrates the harness executes and the rights-basis refusal works. It is not a measurement and must never be reported as one.',
    },
    generatedAt: new Date().toISOString(),
    node: process.version,
    phase: 'A',
    // The settings every result below was produced under, carried WITH the
    // results so a number can never be read without them.
    configuration: CONFIGURATION,
    corpus: {
      path: path.relative(process.cwd(), corpusPath).replace(/\\/g, '/'),
      clipCount: clips.length,
      proposedSourceCount: Array.isArray(manifest.proposedSources) ? manifest.proposedSources.length : 0,
    },
    results: [],
    nothingToMeasure: clips.length === 0,
    // Recorded rather than implied, so the next reader can see what Phase A
    // did and did not do without reading the patch.
    phaseANote: clips.length === 0
      ? 'Phase A: no media collected, nothing installed, nothing measured. Fill corpus.json `clips` from an owner-approved corpus to run Phase B.'
      : 'Phase B is NOT authorized by PATCH-154. This run is only valid if the corpus was owner-approved.',
  };

  if (clips.length === 0) {
    log('nothing to measure: corpus.json has no clips.');
    log(`  proposed sources recorded for owner approval: ${report.corpus.proposedSourceCount}`);
    log(`  media directory (never committed): ${path.relative(process.cwd(), MEDIA_ROOT).replace(/\\/g, '/')}`);
    log('');
    log('this is the Phase A acceptance case: the probe is runnable, the corpus is empty,');
    log('and nothing was installed, downloaded or benchmarked.');
  } else {
    log(`corpus: ${clips.length} clip(s)`);
    for (const clip of clips) {
      log(`- ${clip.id}  [${clip.category}/${clip.language}]  ${clip.durationSeconds}s`);
    }
    // PHASE B DOES THE WORK. It is not authorized, so this branch is
    // intentionally empty rather than half-built: the orchestrator shape is
    // here, and the measurement itself arrives with the corpus.
    log('');
    log('! Phase B is not authorized by PATCH-154. No engine is invoked and no');
    log('! result is produced. This probe is the Phase A deliverable only.');
    report.results = clips.map((clip) => ({
      id: clip.id,
      category: clip.category,
      language: clip.language,
      status: 'not-run',
      reason: 'PHASE_B_NOT_AUTHORIZED',
    }));
  }

  const out = typeof args.json === 'string' ? args.json : path.join(HERE, 'last-run.json');
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  log('');
  log(`wrote ${path.relative(process.cwd(), out).replace(/\\/g, '/')}`);
}

await main();
