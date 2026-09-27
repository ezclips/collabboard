// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import LinkMediaEmbed, { getLinkEmbedKind } from './LinkMediaEmbed';

/**
 * PATCH-205. A Spotify or Apple Podcasts link used to be a plain link card.
 * Now it embeds the service's own player -- built ONLY from the parsed episode
 * id/path, so nothing from the pasted URL (tracking parameters included) reaches
 * the iframe, and a lookalike host is not mistaken for the real one.
 */

let root: Root | null = null;
let host: HTMLDivElement | null = null;

type Kind =
  | 'twitter'
  | 'youtube'
  | 'vimeo'
  | 'tiktok'
  | 'instagram'
  | 'facebook'
  | 'spotify'
  | 'apple-podcasts'
  | 'video'
  | 'none';

async function renderEmbed(url: string, forceKind?: Kind, disableInteraction = false) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <LinkMediaEmbed url={url} forcedKind={forceKind} disableInteraction={disableInteraction} />,
    );
  });
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

const SPOTIFY_EPISODE = 'https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk?si=AbCdEf';
const APPLE_EPISODE = 'https://podcasts.apple.com/us/podcast/the-daily/id1200361736?i=1000634567890';

describe('getLinkEmbedKind — PATCH-205 podcast links', () => {
  it('recognises a Spotify episode, with locale and tracking, and a show', () => {
    expect(getLinkEmbedKind('https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk')).toBe('spotify');
    expect(
      getLinkEmbedKind('https://open.spotify.com/intl-de/episode/4rOoJ6Egrf8K2IrywzwOMk?si=x'),
    ).toBe('spotify');
    expect(getLinkEmbedKind('https://open.spotify.com/show/4rOoJ6Egrf8K2IrywzwOMk')).toBe('spotify');
  });

  it('recognises an Apple episode and an Apple show', () => {
    expect(getLinkEmbedKind(APPLE_EPISODE)).toBe('apple-podcasts');
    expect(
      getLinkEmbedKind('https://podcasts.apple.com/us/podcast/the-daily/id1200361736'),
    ).toBe('apple-podcasts');
  });

  it('leaves Pocket Casts a plain link card', () => {
    // No official embed player, so PATCH-204's "Add transcript" is what the
    // card offers -- not a broken iframe.
    expect(getLinkEmbedKind('https://pca.st/abc123')).toBe('none');
  });

  it('leaves a Spotify track alone: this is for podcasts, not music', () => {
    expect(getLinkEmbedKind('https://open.spotify.com/track/4rOoJ6Egrf8K2IrywzwOMk')).toBe('none');
  });

  it('does not accept a lookalike host', () => {
    expect(getLinkEmbedKind('https://open.spotify.com.evil.test/episode/abc')).toBe('none');
    expect(
      getLinkEmbedKind('https://podcasts.apple.com.evil.test/us/podcast/x/id123456?i=999'),
    ).toBe('none');
  });
});

describe('LinkMediaEmbed — PATCH-205 podcast players', () => {
  it('a Spotify episode embeds the official player, built from the id only', async () => {
    await renderEmbed(SPOTIFY_EPISODE);
    const iframe = host!.querySelector('iframe')!;
    expect(iframe.getAttribute('src')).toBe(
      'https://open.spotify.com/embed/episode/4rOoJ6Egrf8K2IrywzwOMk',
    );
    // The tracking parameter is not carried into the iframe.
    expect(iframe.getAttribute('src')).not.toContain('si=');
    expect(iframe.getAttribute('title')).toBe('Spotify episode player');
    expect(iframe.getAttribute('height')).toBe('152');
    expect(iframe.getAttribute('loading')).toBe('lazy');
  });

  it('an Apple episode embeds the embed host, keeping the i= id', async () => {
    await renderEmbed(APPLE_EPISODE);
    const iframe = host!.querySelector('iframe')!;
    expect(iframe.getAttribute('src')).toBe(
      'https://embed.podcasts.apple.com/us/podcast/the-daily/id1200361736?i=1000634567890',
    );
    expect(iframe.getAttribute('height')).toBe('175');
    expect(iframe.getAttribute('title')).toBe('Apple Podcasts player');
    expect(iframe.getAttribute('sandbox')).toContain('allow-scripts');
  });

  it('an Apple show gets the taller player', async () => {
    await renderEmbed('https://podcasts.apple.com/us/podcast/the-daily/id1200361736');
    const iframe = host!.querySelector('iframe')!;
    expect(iframe.getAttribute('height')).toBe('450');
    expect(iframe.getAttribute('src')).toBe(
      'https://embed.podcasts.apple.com/us/podcast/the-daily/id1200361736',
    );
  });

  it('disableInteraction wraps the player in pointer-events-none', async () => {
    await renderEmbed(SPOTIFY_EPISODE, undefined, true);
    const wrapper = host!.querySelector('iframe')!.parentElement!;
    expect(wrapper.className).toContain('pointer-events-none');
  });
});
