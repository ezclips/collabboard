/**
 * The representative set.
 *
 * Chosen by PROBING candidates and keeping what they turned out to be, rather
 * than by assuming from the title. Each entry's `expect` field is what the
 * watch page actually reported when the set was fixed (2026-09-21); the probe
 * re-checks it, so a video that changes character shows up as a mismatch
 * instead of silently weakening the set.
 *
 * Third-party videos change without notice: one can be deleted, made private,
 * or have its captions turned off at any time. That is a property of the
 * measurement, not a flaw in it, and the probe reports drift rather than
 * pretending the set is stable.
 */
export const VIDEOS = [
  {
    id: 'dQw4w9WgXcQ',
    covers: 'public video with human-authored captions, several languages',
    expect: { playability: 'OK', durationSec: 213, manualTracks: 5, asrTracks: 1 },
  },
  {
    id: 'jNQXAC9IVRw',
    covers: 'very short video (19 s) with human-authored captions',
    expect: { playability: 'OK', durationSec: 19, manualTracks: 2, asrTracks: 0 },
  },
  {
    id: '9bZkp7q19f0',
    covers: 'non-English (Korean) with ONLY auto-generated captions',
    expect: { playability: 'OK', durationSec: 252, manualTracks: 0, asrTracks: 1 },
  },
  {
    id: 'aircAruvnKk',
    covers: 'many caption languages (30 manual) -- the track-selection case',
    expect: { playability: 'OK', durationSec: 1120, manualTracks: 30, asrTracks: 1 },
  },
  {
    id: '1La4QzGeaaQ',
    covers: 'playable video with NO captions at all -- the Stage 3d refusal case',
    expect: { playability: 'OK', durationSec: 338, manualTracks: 0, asrTracks: 0 },
  },
  {
    id: '_uQrJ0TkZlc',
    covers: 'long (6.2 h) with human-authored captions',
    expect: { playability: 'OK', durationSec: 22447, manualTracks: 8, asrTracks: 1 },
  },
  {
    id: '8jLOx1hD3_o',
    covers: 'very long (31 h) with ONLY auto-generated captions -- the scale case',
    expect: { playability: 'OK', durationSec: 112049, manualTracks: 0, asrTracks: 1 },
  },
  {
    id: '2lAe1cqCOXo',
    covers: 'gated: the watch page demands a sign-in',
    expect: { playability: 'LOGIN_REQUIRED' },
  },
  {
    id: '5qap5aO4i9A',
    covers: 'unplayable: an ended live stream',
    expect: { playability: 'UNPLAYABLE' },
  },
];
