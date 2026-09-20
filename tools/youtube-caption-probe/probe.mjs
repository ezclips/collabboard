/**
 * Stage 3a -- the caption fetch-path instrument.
 *
 * It exists to answer one question before any ingestion code is written: can
 * captions be acquired reliably enough to build on, and by which path? It is a
 * measurement tool, not a feature. Nothing here is imported by the application.
 *
 * It is built to be able to say NO. If every path is unreliable or
 * illegitimate, that is a successful result -- it sends Stage 3 to
 * paste-a-transcript or STT instead of to a feature that breaks weekly.
 *
 * PATHS MEASURED
 *
 *   A  official YouTube Data API v3   captions.list / captions.download
 *   B  timedtext                      the caption URLs the watch page carries
 *   C  third-party transcript library youtube-transcript (MIT), measured
 *                                     out-of-tree -- see below
 *
 * WHY PATH C IS NOT A DEPENDENCY HERE. The library reaches captions by calling
 * YouTube's private InnerTube endpoint while declaring itself the ANDROID
 * client. Measuring what it achieves is legitimate and is the point of an
 * instrument; shipping that technique inside this repository is a different
 * act, and this probe does not do it. So path C runs only against a copy
 * installed somewhere else, which the probe resolves and otherwise reports as
 * not run:
 *
 *   mkdir /tmp/ytlib && cd /tmp/ytlib && npm init -y && npm i youtube-transcript
 *   node tools/youtube-caption-probe/probe.mjs --lib=/tmp/ytlib/node_modules/youtube-transcript/dist/esm/index.js
 *
 * Usage:
 *   node tools/youtube-caption-probe/probe.mjs [--lib=<path>] [--json=<out>] [--rate=<n>]
 *   YOUTUBE_API_KEY=... enables path A's live call; without it the probe
 *   records the unauthenticated response, which is itself a measurement.
 */
import fs from 'node:fs';
import { VIDEOS } from './videos.mjs';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...rest] = a.replace(/^--/, '').split('=');
    return [k, rest.length ? rest.join('=') : true];
  }),
);
const RATE_ATTEMPTS = Number(args.rate ?? 25);

const log = (...parts) => process.stdout.write(`${parts.join(' ')}\n`);

/* ------------------------------------------------------------------ path A */

/**
 * The official API.
 *
 * Worth stating up front, because it decides the path on its own: captions.list
 * needs only an API key, but captions.download is documented as requiring an
 * OAuth token for the channel that OWNS the video. There is no documented way
 * for a third party to download someone else's caption track. So even a funded,
 * quota-approved project cannot use this path for arbitrary videos -- the limit
 * is authorisation, not quota.
 *
 * The probe measures what it can reach and records the rest as documented
 * rather than pretending to have tested it.
 */
async function pathDataApi(video) {
  const key = process.env.YOUTUBE_API_KEY;
  const url = 'https://www.googleapis.com/youtube/v3/captions'
    + `?part=snippet&videoId=${video.id}${key ? `&key=${key}` : ''}`;
  const started = Date.now();
  try {
    const res = await fetch(url);
    const body = await res.text();
    let parsed;
    try { parsed = JSON.parse(body); } catch { parsed = null; }
    const ms = Date.now() - started;
    if (!res.ok) {
      return {
        ok: false, ms, http: res.status,
        failure: parsed?.error?.status ?? 'http-error',
        message: (parsed?.error?.message ?? body).slice(0, 200),
        keyPresent: Boolean(key),
      };
    }
    const items = parsed?.items ?? [];
    return {
      ok: true, ms, http: res.status, keyPresent: Boolean(key),
      // Note what this DOES return: track metadata only. The bytes still
      // require owner OAuth, so listing success is not acquisition success.
      tracks: items.length,
      languages: items.map((i) => i.snippet?.language).filter(Boolean),
      trackKinds: [...new Set(items.map((i) => i.snippet?.trackKind).filter(Boolean))],
      contentAvailable: false,
      contentNote: 'captions.download requires OAuth as the video owner',
    };
  } catch (cause) {
    return { ok: false, ms: Date.now() - started, failure: 'network', message: String(cause.message).slice(0, 200) };
  }
}

/* ------------------------------------------------------------------ path B */

/** Pulls playability, duration and the caption track list off the watch page. */
async function watchPageFacts(id) {
  const res = await fetch(`https://www.youtube.com/watch?v=${id}`, {
    headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' },
  });
  const html = await res.text();
  const playability = (html.match(/"playabilityStatus":\{"status":"([A-Z_]+)"/) || [])[1] ?? null;
  const durationSec = Number((html.match(/"lengthSeconds":"(\d+)"/) || [])[1]) || null;
  // Often absent. Reported as null rather than guessed -- an absent field is
  // not the same as a video with no language, and the track-selection finding
  // below does not depend on it.
  const audioLanguage = (html.match(/"defaultAudioLanguage":"([\w-]+)"/) || [])[1] ?? null;
  let tracks = [];
  const match = html.match(/"captionTracks":(\[.*?\])/s);
  if (match) { try { tracks = JSON.parse(match[1]); } catch { tracks = []; } }
  return { http: res.status, playability, durationSec, audioLanguage, tracks, htmlBytes: html.length };
}

/**
 * The timedtext path: discover the caption URLs the page itself carries, then
 * fetch one.
 *
 * The two halves are reported separately on purpose. Discovery and acquisition
 * are different capabilities, and this path currently has one without the
 * other -- which a single ok/fail flag would hide.
 */
async function pathTimedtext(video, facts) {
  const started = Date.now();
  if (!facts.tracks.length) {
    return {
      ok: false, ms: Date.now() - started,
      discovery: 'no-tracks',
      failure: facts.playability === 'OK' ? 'captions-unavailable' : `playability:${facts.playability}`,
    };
  }
  const track = facts.tracks.find((t) => !t.kind) ?? facts.tracks[0];
  const attempts = [];
  for (const fmt of ['', 'json3', 'srv3', 'vtt']) {
    const url = track.baseUrl + (fmt ? `&fmt=${fmt}` : '');
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA } });
      const body = await res.text();
      attempts.push({ fmt: fmt || 'default', http: res.status, bytes: body.length });
    } catch (cause) {
      attempts.push({ fmt: fmt || 'default', error: String(cause.message).slice(0, 80) });
    }
  }
  const got = attempts.find((a) => (a.bytes ?? 0) > 0);
  return {
    ok: Boolean(got),
    ms: Date.now() - started,
    discovery: 'tracks-listed',
    tracksDiscovered: facts.tracks.length,
    languages: [...new Set(facts.tracks.map((t) => t.languageCode))],
    attempts,
    // The characteristic failure of this path: HTTP 200 and an empty body.
    // It is not an error anywhere a caller would look for one.
    failure: got ? null : 'empty-200',
  };
}

/* ------------------------------------------------------------------ path C */

async function loadTranscriptLib() {
  if (!args.lib) return null;
  try {
    const mod = await import(args.lib.startsWith('file:') ? args.lib : `file:///${String(args.lib).replace(/\\/g, '/')}`);
    return mod.YoutubeTranscript ?? mod.default?.YoutubeTranscript ?? null;
  } catch (cause) {
    log(`  ! could not load --lib: ${cause.message}`);
    return null;
  }
}

async function pathTranscriptLib(video, lib, facts) {
  if (!lib) return { ok: false, notRun: true, failure: 'library-not-provided' };
  const started = Date.now();
  try {
    const segments = await lib.fetchTranscript(video.id);
    return {
      ok: true, ms: Date.now() - started,
      language: segments[0]?.lang ?? null,
      // Does it CHOOSE a track, or just take the first one it was handed?
      // Compared here rather than assumed, because the answer decides whether
      // an English video can silently be stored in another language.
      firstTrackLanguage: facts?.tracks?.[0]?.languageCode ?? null,
      tookFirstTrack: (segments[0]?.lang ?? null) === (facts?.tracks?.[0]?.languageCode ?? null),
      quality: segmentQuality(segments),
      sample: segments.slice(0, 2).map((s) => s.text),
    };
  } catch (cause) {
    return {
      ok: false, ms: Date.now() - started,
      failure: cause.constructor?.name ?? 'Error',
      message: String(cause.message).replace(/\s+/g, ' ').slice(0, 160),
    };
  }
}

/* ------------------------------------------------------- segment quality */

/**
 * The properties the plan's chunking actually depends on.
 *
 * `spanVsDuration` is here because of something the measurement turned up:
 * segment spans SUM to roughly twice the video length on auto-generated
 * tracks, because consecutive segments overlap. Any windowing built by adding
 * durations up would therefore be wrong; windows have to be cut on offsets.
 */
function segmentQuality(segments) {
  if (!segments.length) return null;
  const secs = segments.map((s) => s.duration / 1000).sort((a, b) => a - b);
  const at = (p) => secs[Math.min(secs.length - 1, Math.floor(secs.length * p))];
  const text = segments.map((s) => s.text).join(' ');
  const letters = text.replace(/[^A-Za-z]/g, '');
  const uppers = (text.match(/[A-Z]/g) || []).length;

  const first = segments[0];
  const last = segments[segments.length - 1];
  const covered = (last.offset + last.duration - first.offset) / 1000;
  const summed = segments.reduce((total, s) => total + s.duration / 1000, 0);

  // Windows cut on OFFSETS, which is the way that survives overlap.
  let windows = 0;
  let windowStart = first.offset;
  for (const s of segments) {
    if ((s.offset - windowStart) / 1000 >= 45) { windows += 1; windowStart = s.offset; }
  }

  return {
    segments: segments.length,
    textUnits: text.length,
    coveredSec: Math.round(covered),
    summedSec: Math.round(summed),
    spanVsDuration: covered > 0 ? +(summed / covered).toFixed(2) : null,
    segSec: { min: +secs[0].toFixed(2), p50: +at(0.5).toFixed(2), p95: +at(0.95).toFixed(2), max: +secs[secs.length - 1].toFixed(2) },
    groupableInto45sWindows: windows,
    hasSentencePunctuation: /[.!?]/.test(text),
    hasCommas: /,/.test(text),
    upperCaseRatio: letters.length ? +(uppers / letters.length).toFixed(3) : null,
  };
}

/* ------------------------------------------------------------------- main */

async function main() {
  const lib = await loadTranscriptLib();
  log(`# youtube caption fetch-path probe -- ${new Date().toISOString()}`);
  log(`path A key present : ${Boolean(process.env.YOUTUBE_API_KEY)}`);
  log(`path C library     : ${lib ? args.lib : 'NOT PROVIDED (path C reported as not run)'}`);
  log('');

  const results = [];
  for (const video of VIDEOS) {
    log(`- ${video.id}  ${video.covers}`);
    const facts = await watchPageFacts(video.id);

    // Does the set still describe reality? Drift is reported, never hidden.
    const drift = [];
    if (video.expect.playability && facts.playability !== video.expect.playability) {
      drift.push(`playability ${video.expect.playability} -> ${facts.playability}`);
    }
    if (video.expect.durationSec && facts.durationSec !== video.expect.durationSec) {
      drift.push(`duration ${video.expect.durationSec} -> ${facts.durationSec}`);
    }
    if (typeof video.expect.manualTracks === 'number') {
      const manual = facts.tracks.filter((t) => !t.kind).length;
      if (manual !== video.expect.manualTracks) drift.push(`manual tracks ${video.expect.manualTracks} -> ${manual}`);
    }
    if (drift.length) log(`    ! set drift: ${drift.join('; ')}`);

    const entry = {
      id: video.id,
      covers: video.covers,
      observed: {
        playability: facts.playability,
        durationSec: facts.durationSec,
        audioLanguage: facts.audioLanguage,
        manualTracks: facts.tracks.filter((t) => !t.kind).length,
        asrTracks: facts.tracks.filter((t) => t.kind === 'asr').length,
        firstTrackLanguage: facts.tracks[0]?.languageCode ?? null,
      },
      drift,
      paths: {
        dataApi: await pathDataApi(video),
        timedtext: await pathTimedtext(video, facts),
        transcriptLib: await pathTranscriptLib(video, lib, facts),
      },
    };
    results.push(entry);
    for (const [name, r] of Object.entries(entry.paths)) {
      log(`    ${name.padEnd(14)} ${r.ok ? 'OK ' : r.notRun ? '-- ' : 'NO '} ${r.failure ?? ''} ${r.quality ? `${r.quality.segments} segs, ${r.quality.textUnits} units` : ''}`);
    }
  }

  // Rate limiting is part of the measurement, not a footnote: a path that
  // works once and is throttled at twenty is not a path.
  log('');
  log(`rate probe: ${RATE_ATTEMPTS} consecutive requests, shortest video`);
  const rate = { attempts: 0, ok: 0, failures: {}, statuses: {}, ms: 0 };
  const rateStarted = Date.now();
  for (let i = 0; i < RATE_ATTEMPTS; i += 1) {
    rate.attempts += 1;
    const facts = await watchPageFacts('jNQXAC9IVRw').catch(() => null);
    if (!facts) { rate.failures.network = (rate.failures.network ?? 0) + 1; continue; }
    rate.statuses[facts.http] = (rate.statuses[facts.http] ?? 0) + 1;
    if (facts.playability === 'OK') rate.ok += 1;
    else rate.failures[facts.playability ?? 'unknown'] = (rate.failures[facts.playability ?? 'unknown'] ?? 0) + 1;
  }
  rate.ms = Date.now() - rateStarted;
  log(`  ${rate.ok}/${rate.attempts} ok in ${rate.ms} ms; statuses ${JSON.stringify(rate.statuses)}; failures ${JSON.stringify(rate.failures)}`);

  const report = { generatedAt: new Date().toISOString(), node: process.version, results, rate };
  const out = typeof args.json === 'string' ? args.json : 'tools/youtube-caption-probe/last-run.json';
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  log(`\nwrote ${out}`);
}

await main();
