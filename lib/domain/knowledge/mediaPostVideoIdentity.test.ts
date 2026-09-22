import { describe, expect, it } from 'vitest';

import {
  mediaPostCarriesSpokenContent,
  mediaPostTranscriptIsReusable,
  mediaPostVideoChanged,
  mediaPostVideoIdentity,
} from './mediaPostVideoIdentity';

/**
 * THE TWO FAILURES THIS MODULE EXISTS TO SEPARATE, and they are not equally bad:
 *
 *   - saying "same video" when they differ MIS-ATTRIBUTES a transcript. The
 *     timestamps still land, the citation still renders, and nothing on screen
 *     says the words belong to another video.
 *   - saying "different video" when they match costs one re-paste.
 *
 * So the reuse path demands a provider-canonical id and the detach path
 * accepts any doubt. Most of what follows tests that asymmetry rather than the
 * parsing, which is the part a later reader is most likely to "simplify".
 */
describe('mediaPostVideoIdentity', () => {
  describe('YouTube — one video, many URL shapes', () => {
    // The dedupe requirement in one test: people paste these interchangeably
    // and every one of them is the same video.
    const sameVideo = [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/live/dQw4w9WgXcQ',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
      // Share tracking and a playback offset: a visit, not a different video.
      'https://youtu.be/dQw4w9WgXcQ?si=AbCdEf&t=42',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123&index=2',
      // No scheme, which is what a paste often really looks like.
      'youtu.be/dQw4w9WgXcQ',
      'www.youtube.com/watch?v=dQw4w9WgXcQ',
    ];

    it.each(sameVideo)('%s resolves to the same canonical identity', (url) => {
      expect(mediaPostVideoIdentity(url)).toEqual({
        provider: 'youtube',
        identity: 'yt:dQw4w9WgXcQ',
        canonical: true,
      });
    });

    it('a different video id is a different identity', () => {
      expect(mediaPostVideoIdentity('https://youtu.be/VzRZG_NEeLk')?.identity).toBe(
        'yt:VzRZG_NEeLk',
      );
    });

    it('a YouTube URL with no video is not a transcribable thing', () => {
      // A channel, a playlist and the home page have no video to transcribe,
      // so they get no identity rather than a URL-shaped one that would make
      // the card offer "Add transcript" for a channel.
      expect(mediaPostVideoIdentity('https://www.youtube.com/@someChannel')).toBeNull();
      expect(mediaPostVideoIdentity('https://www.youtube.com/playlist?list=PL123')).toBeNull();
      expect(mediaPostVideoIdentity('https://www.youtube.com/')).toBeNull();
    });
  });

  describe('the other providers', () => {
    it('Vimeo takes the numeric id from anywhere in the path', () => {
      expect(mediaPostVideoIdentity('https://vimeo.com/123456789')).toEqual({
        provider: 'vimeo',
        identity: 'vimeo:123456789',
        canonical: true,
      });
      expect(mediaPostVideoIdentity('https://vimeo.com/channels/staff/123456789')?.identity).toBe(
        'vimeo:123456789',
      );
    });

    it('TikTok takes the status id, and a short link stays uncertain', () => {
      expect(mediaPostVideoIdentity('https://www.tiktok.com/@user/video/7300000000000000000')).toEqual(
        { provider: 'tiktok', identity: 'tiktok:7300000000000000000', canonical: true },
      );
      // vm.tiktok.com only resolves by following a redirect, which this module
      // cannot do -- so it says so rather than inventing an id.
      const short = mediaPostVideoIdentity('https://vm.tiktok.com/ZMabcdefg/');
      expect(short?.canonical).toBe(false);
      expect(short?.provider).toBe('tiktok');
    });

    it('x.com and twitter.com are one post, identified by status id alone', () => {
      const x = mediaPostVideoIdentity('https://x.com/someone/status/1234567890');
      const twitter = mediaPostVideoIdentity('https://twitter.com/someone/status/1234567890');
      expect(x?.identity).toBe('x:1234567890');
      // The handle can change without the post changing, so it is not part of
      // the identity -- and the two hosts must not split one post in two.
      expect(twitter?.identity).toBe(x?.identity);
      expect(
        mediaPostVideoIdentity('https://x.com/adifferenthandle/status/1234567890')?.identity,
      ).toBe('x:1234567890');
    });

    it('Instagram posts, reels and TV carry a shortcode', () => {
      expect(mediaPostVideoIdentity('https://www.instagram.com/reel/AbC-123_x/')?.identity).toBe(
        'ig:AbC-123_x',
      );
      expect(mediaPostVideoIdentity('https://instagram.com/p/AbC-123_x/')?.identity).toBe(
        'ig:AbC-123_x',
      );
    });

    it('Facebook is recognised as media but never claimed as canonical', () => {
      const fb = mediaPostVideoIdentity('https://www.facebook.com/someone/videos/123456/');
      expect(fb?.provider).toBe('facebook');
      expect(fb?.canonical).toBe(false);
    });

    it('a direct video or audio file is identified by location, not by a query', () => {
      const plain = mediaPostVideoIdentity('https://cdn.example.com/talks/keynote.mp4');
      expect(plain).toEqual({
        provider: 'file',
        identity: 'url:https://cdn.example.com/talks/keynote.mp4',
        canonical: false,
      });
      // A REFRESHED SIGNATURE IS NOT A NEW VIDEO. Keeping the query would mint
      // a new identity on every signed-URL rotation and detach the transcript
      // from a file that never changed.
      expect(
        mediaPostVideoIdentity('https://cdn.example.com/talks/keynote.mp4?sig=abc&exp=999')
          ?.identity,
      ).toBe(plain?.identity);
      expect(mediaPostVideoIdentity('https://cdn.example.com/talks/keynote.mp3')?.provider).toBe(
        'file',
      );
    });
  });

  describe('what is NOT media', () => {
    it.each([
      'https://example.com/an-article',
      'https://en.wikipedia.org/wiki/Chess',
      'https://github.com/some/repo',
      '',
      '   ',
    ])('%s has no video identity', (url) => {
      expect(mediaPostVideoIdentity(url)).toBeNull();
    });

    it('refuses a non-http scheme outright', () => {
      // A data: URL has no stable public identity and a javascript: one has no
      // business reaching a canonicaliser at all.
      expect(mediaPostVideoIdentity('data:video/mp4;base64,AAAA')).toBeNull();
      expect(mediaPostVideoIdentity('javascript:alert(1)')).toBeNull();
      expect(mediaPostVideoIdentity('file:///C:/videos/local.mp4')).toBeNull();
    });
  });

  describe('mediaPostCarriesSpokenContent — the affordance gate', () => {
    it('offers on media and stays silent on an article', () => {
      expect(mediaPostCarriesSpokenContent('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
      expect(mediaPostCarriesSpokenContent('https://www.tiktok.com/@u/video/7300000000000000000')).toBe(
        true,
      );
      // The requirement is that only content-related posts sprout the
      // affordance. An article card showing "Add transcript" is the noise this
      // gate exists to prevent.
      expect(mediaPostCarriesSpokenContent('https://example.com/an-article')).toBe(false);
    });
  });

  describe('mediaPostVideoChanged — W7, where any doubt counts as changed', () => {
    it('is false across URL shapes of one video', () => {
      expect(
        mediaPostVideoChanged(
          'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          'https://youtu.be/dQw4w9WgXcQ?t=30',
        ),
      ).toBe(false);
    });

    it('is true when the video really changed', () => {
      expect(
        mediaPostVideoChanged('https://youtu.be/dQw4w9WgXcQ', 'https://youtu.be/VzRZG_NEeLk'),
      ).toBe(true);
    });

    it('is true when media is replaced by a non-media link, and in reverse', () => {
      expect(mediaPostVideoChanged('https://youtu.be/dQw4w9WgXcQ', 'https://example.com/a')).toBe(
        true,
      );
      expect(mediaPostVideoChanged('https://example.com/a', 'https://youtu.be/dQw4w9WgXcQ')).toBe(
        true,
      );
    });

    it('is false when neither side is media at all', () => {
      // Both null: there was no transcript to detach and nothing to do.
      expect(mediaPostVideoChanged('https://example.com/a', 'https://example.com/b')).toBe(false);
    });

    it('detaches on an uncertain identity that moved', () => {
      // A URL-shaped identity is not trusted enough to REUSE a transcript, but
      // a change in it is still enough to act on -- the cost of being wrong
      // here is one re-paste, and the cost of not acting is a transcript
      // describing the wrong file.
      expect(
        mediaPostVideoChanged(
          'https://cdn.example.com/a.mp4',
          'https://cdn.example.com/b.mp4',
        ),
      ).toBe(true);
    });
  });

  describe('mediaPostTranscriptIsReusable — W1, stricter than detaching', () => {
    it('reuses across URL shapes of the same canonical video', () => {
      expect(
        mediaPostTranscriptIsReusable('yt:dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ?si=x'),
      ).toBe(true);
    });

    it('refuses a different video', () => {
      expect(mediaPostTranscriptIsReusable('yt:dQw4w9WgXcQ', 'https://youtu.be/VzRZG_NEeLk')).toBe(
        false,
      );
    });

    it('refuses when the post has no transcript recorded', () => {
      expect(mediaPostTranscriptIsReusable(null, 'https://youtu.be/dQw4w9WgXcQ')).toBe(false);
    });

    it('REFUSES A MATCHING URL-SHAPED IDENTITY, which detaching would have accepted', () => {
      // This is the asymmetry, stated as a test. The identities are equal and
      // `mediaPostVideoChanged` would call them unchanged -- but reuse
      // attributes one person's transcript to another person's post, and a
      // normalised-URL match is a coincidence, not a verified id.
      const url = 'https://cdn.example.com/talks/keynote.mp4';
      const identity = mediaPostVideoIdentity(url);
      expect(identity?.canonical).toBe(false);
      expect(mediaPostVideoChanged(url, url)).toBe(false);
      expect(mediaPostTranscriptIsReusable(identity!.identity, url)).toBe(false);
    });

    it('refuses a stored identity for a URL that is not media', () => {
      expect(mediaPostTranscriptIsReusable('yt:dQw4w9WgXcQ', 'https://example.com/a')).toBe(false);
    });
  });
});
