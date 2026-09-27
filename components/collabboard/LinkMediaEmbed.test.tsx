// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import LinkMediaEmbed, { getLinkEmbedKind, sharpFavicon } from './LinkMediaEmbed';
import { resetBoardVideoPlayers, seekBoardVideo } from './boardVideoPlayerRegistry';

/**
 * PATCH-208. A media card used to mount the provider's full player the moment
 * it appeared -- at card width that meant YouTube's own chrome filling the card
 * and a player loading on every board open. It now shows a facade (thumbnail,
 * play button, provider badge) and mounts the player only when asked. A
 * transcript citation must still seek the video, so the facade registers under
 * the same identity and opens + seeks on demand.
 */

// The provider player is mocked at the module boundary: under jsdom the real
// react-player never loads its YouTube/embed internals. The stub reports a mock
// instance through onReady so the facade can hand it a pending seek.
const playerInstance = vi.hoisted(() => {
  const internal = { seekTo: vi.fn(), playVideo: vi.fn() };
  return {
    seekTo: vi.fn(),
    getInternalPlayer: vi.fn(() => internal),
    internal,
  };
});
vi.mock('react-player', () => ({
  default: ({ onReady }: { onReady?: (player: unknown) => void }) => {
    React.useEffect(() => {
      onReady?.(playerInstance);
    }, []);
    return React.createElement('div', { 'data-test-react-player': 'true' });
  },
}));

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

async function renderEmbed(
  url: string,
  options: {
    forceKind?: Kind;
    disableInteraction?: boolean;
    previewImage?: string;
    previewImageFallbacks?: readonly string[];
  } = {},
) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <LinkMediaEmbed
        url={url}
        forcedKind={options.forceKind}
        disableInteraction={options.disableInteraction}
        previewImage={options.previewImage}
        previewImageFallbacks={options.previewImageFallbacks}
      />,
    );
  });
  return host;
}

async function clickPlay() {
  await act(async () => {
    host!.querySelector<HTMLButtonElement>('button[aria-label="Play"]')!.click();
  });
  await act(async () => { await Promise.resolve(); });
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  resetBoardVideoPlayers();
  playerInstance.seekTo.mockClear();
  playerInstance.internal.seekTo.mockClear();
  playerInstance.internal.playVideo.mockClear();
});

const YOUTUBE = 'https://www.youtube.com/watch?v=8IlJ3v8I4Z8';
const YOUTUBE_ID = 'yt:8IlJ3v8I4Z8';
const SPOTIFY_EPISODE = 'https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk?si=AbCdEf';
const APPLE_EPISODE = 'https://podcasts.apple.com/us/podcast/the-daily/id1200361736?i=1000634567890';

const playButton = () => host!.querySelector<HTMLButtonElement>('button[aria-label="Play"]');

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

describe('PATCH-208 a YouTube card shows a facade, not a player', () => {
  it('renders the thumbnail, play button and badge, and mounts no player', async () => {
    await renderEmbed(YOUTUBE);
    expect(host!.querySelector('img[src="https://i.ytimg.com/vi_webp/8IlJ3v8I4Z8/maxresdefault.webp"]')).not.toBeNull();
    expect(playButton()).not.toBeNull();
    expect(host!.textContent).toContain('YouTube');
    // THE POINT: no player until asked.
    expect(host!.querySelector('iframe')).toBeNull();
    expect(host!.querySelector('[data-test-react-player]')).toBeNull();
  });

  it('mounts the player only after Play is clicked', async () => {
    await renderEmbed(YOUTUBE);
    await clickPlay();
    expect(host!.querySelector('[data-test-react-player]')).not.toBeNull();
    expect(playButton()).toBeNull();
  });

  it('the preview image falls back through the card chain on error', async () => {
    await renderEmbed(YOUTUBE, {
      previewImage: 'https://example.com/a.jpg',
      previewImageFallbacks: ['https://example.com/b.jpg'],
    });
    const img = host!.querySelector<HTMLImageElement>('img')!;
    await act(async () => {
      img.dispatchEvent(new Event('error'));
    });
    expect(host!.querySelector<HTMLImageElement>('img')!.getAttribute('src')).toBe(
      'https://example.com/b.jpg',
    );
  });
});

describe('PATCH-208 podcast cards show a square cover then the player', () => {
  it('a Spotify card shows a cover + Spotify badge, no iframe until Play', async () => {
    await renderEmbed(SPOTIFY_EPISODE, {
      previewImage: 'https://example.com/cover.jpg',
    });
    const img = host!.querySelector<HTMLImageElement>('img');
    // Square art, capped, not a stretched 16:9 thumbnail.
    expect(img!.className).toContain('object-cover');
    expect(host!.textContent).toContain('Spotify');
    expect(host!.querySelector('iframe')).toBeNull();

    await clickPlay();
    const iframe = host!.querySelector('iframe')!;
    expect(iframe.getAttribute('src')).toBe(
      'https://open.spotify.com/embed/episode/4rOoJ6Egrf8K2IrywzwOMk?autoplay=1',
    );
    expect(iframe.getAttribute('src')).not.toContain('si=');
    expect(iframe.getAttribute('height')).toBe('152');
    expect(iframe.getAttribute('title')).toBe('Spotify episode player');
  });

  it('an Apple episode mounts the embed host with the i= id and autoplay', async () => {
    await renderEmbed(APPLE_EPISODE);
    expect(host!.querySelector('iframe')).toBeNull();
    await clickPlay();
    const iframe = host!.querySelector('iframe')!;
    expect(iframe.getAttribute('src')).toBe(
      'https://embed.podcasts.apple.com/us/podcast/the-daily/id1200361736?i=1000634567890&autoplay=1',
    );
    expect(iframe.getAttribute('height')).toBe('175');
    expect(iframe.getAttribute('sandbox')).toContain('allow-scripts');
  });

  it('an Apple show gets the taller player', async () => {
    await renderEmbed('https://podcasts.apple.com/us/podcast/the-daily/id1200361736');
    await clickPlay();
    expect(host!.querySelector('iframe')!.getAttribute('height')).toBe('450');
  });
});

describe('PATCH-208 a card with no image is a dark tile, never a broken image', () => {
  it('renders the badge and play button with no <img>', async () => {
    // Vimeo has no derivable poster chain, so a card with no linkImage is the
    // genuine no-image case: a dark tile, not a broken-image icon.
    await renderEmbed('https://vimeo.com/123456789', { previewImage: '' });
    expect(host!.querySelector('img')).toBeNull();
    expect(host!.textContent).toContain('Vimeo');
    expect(playButton()).not.toBeNull();
  });

  it('a podcast card with no cover is a dark tile too', async () => {
    await renderEmbed(SPOTIFY_EPISODE, { previewImage: '' });
    expect(host!.querySelector('img')).toBeNull();
    expect(host!.textContent).toContain('Spotify');
    expect(playButton()).not.toBeNull();
  });
});

describe('PATCH-208 disableInteraction makes the facade inert', () => {
  it('disables the play button', async () => {
    await renderEmbed(YOUTUBE, { disableInteraction: true });
    expect(playButton()!.disabled).toBe(true);
    expect(playButton()!.closest('.pointer-events-none')).not.toBeNull();
  });
});

describe('PATCH-208 a transcript citation seeks the facade', () => {
  it('a seek on a YouTube identity opens the player and applies the moment', async () => {
    await renderEmbed(YOUTUBE);
    // The facade is registered under the video's identity before any player
    // exists -- that is what lets a citation find it at all.
    expect(host!.querySelector('[data-test-react-player]')).toBeNull();

    await act(async () => {
      expect(seekBoardVideo(YOUTUBE_ID, 47_000)).toBe(true);
    });
    await act(async () => { await Promise.resolve(); });

    // The seek activated the facade: the player is now mounted...
    expect(host!.querySelector('[data-test-react-player]')).not.toBeNull();
    // ...and the moment was delivered to it, through the same seek-and-play a
    // mounted card uses (YouTube's internal player: seek-ahead, then play).
    expect(playerInstance.internal.seekTo).toHaveBeenCalledWith(47, true);
    expect(playerInstance.internal.playVideo).toHaveBeenCalled();
  });

  it('has no registration for a video the facade does not hold', async () => {
    await renderEmbed(YOUTUBE);
    expect(seekBoardVideo('yt:VzRZG_NEeLk', 1_000)).toBe(false);
  });

  it('THE LIVE DEFECT: a card re-keyed as the citation is clicked still adopts the seek', async () => {
    // Measured live 2026-09-28: the citation returned true (a registration
    // answered) but no player mounted. The canvas re-rendered the card in the
    // same commit the citation was clicked, so `setActivated` landed on the
    // instance React then threw away. The registry records the moment so the
    // instance that IS on screen adopts it as it mounts.
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    function Keyed() {
      const [key, setKey] = React.useState(0);
      (globalThis as Record<string, unknown>).__bumpKey = () => setKey((value) => value + 1);
      return (
        <div key={key}>
          <LinkMediaEmbed url={YOUTUBE} />
        </div>
      );
    }
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => { root!.render(<Keyed />); });

    await act(async () => {
      seekBoardVideo(YOUTUBE_ID, 185_000);
      (globalThis as unknown as { __bumpKey: () => void }).__bumpKey();
    });
    await act(async () => { await Promise.resolve(); });

    expect(host!.querySelector('[data-test-react-player]')).not.toBeNull();
    expect(playerInstance.internal.seekTo).toHaveBeenCalledWith(185, true);
  });
});

describe('sharpFavicon — PATCH-208 a sharper icon', () => {
  it('upgrades a stored sz=32 favicon to sz=64', () => {
    expect(
      sharpFavicon('https://www.google.com/s2/favicons?domain=example.com&sz=32'),
    ).toBe('https://www.google.com/s2/favicons?domain=example.com&sz=64');
  });

  it('appends the parameter when the URL has none', () => {
    expect(sharpFavicon('https://example.com/favicon.ico')).toBe(
      'https://example.com/favicon.ico?sz=64',
    );
  });
});
