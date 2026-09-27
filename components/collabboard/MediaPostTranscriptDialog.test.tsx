// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MediaPostTranscriptDialog } from './MediaPostTranscriptDialog';

/**
 * PATCH-204. The dialog used to explain only YouTube. It now carries a tab per
 * app, each saying honestly what that app lets a person get, and the format
 * follows the open tab until the person chooses one or starts typing. The paste
 * box below is shared: switching tabs must never clear what was pasted.
 */

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function mount(url: string | null, title = 'A source') {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <MediaPostTranscriptDialog
        boardId="board-1"
        url={url}
        title={title}
        onClose={vi.fn()}
        onImported={vi.fn()}
      />,
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

const SPOTIFY = 'https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk';
const YOUTUBE = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const APPLE = 'https://podcasts.apple.com/us/podcast/the-daily/id1200361736?i=1000634567890';
const PLAIN = 'https://www.example.com/the-daily-episode';

const tab = (id: string) => host!.querySelector<HTMLButtonElement>(`[data-app-tab="${id}"]`);
const tabPanel = (id: string) => host!.querySelector<HTMLElement>(`[data-app-tab-panel="${id}"]`);
const selectedTab = () =>
  host!.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]');
const formatSelect = () => host!.querySelector<HTMLSelectElement>('#transcript-format')!;
const payloadBox = () => host!.querySelector<HTMLTextAreaElement>('#transcript-payload')!;
const openLink = () => host!.querySelector<HTMLAnchorElement>('[role="tabpanel"] a');

async function clickTab(id: string) {
  await act(async () => { tab(id)!.click(); });
  await act(async () => { await Promise.resolve(); });
}

async function typeIntoBox(value: string) {
  const box = payloadBox();
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
    setter.call(box, value);
    box.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('PATCH-204 the dialog has one tab per app', () => {
  it('shows the five tabs in order', async () => {
    await mount(SPOTIFY);
    const labels = [...host!.querySelectorAll('[role="tab"]')].map((element) => element.textContent);
    expect(labels).toEqual([
      'YouTube',
      'Apple Podcasts',
      'Spotify',
      'Pocket Casts',
      'Website or file',
    ]);
  });

  it.each([
    [SPOTIFY, 'spotify'],
    [YOUTUBE, 'youtube'],
    ['https://pca.st/abc123', 'pocketcasts'],
    [APPLE, 'apple'],
    [PLAIN, 'website'],
  ])('opens on the tab the URL implies: %s', async (url, expected) => {
    await mount(url);
    expect(selectedTab()!.getAttribute('data-app-tab')).toBe(expected);
  });

  it('the Spotify tab gives the four signed-in steps and its note', async () => {
    await mount(SPOTIFY);
    const body = tabPanel('spotify')!;
    const badge = host!.querySelector('[data-app-tab-badge="spotify"]')!;
    expect(badge.textContent).toBe('Full text + timestamps');
    // The episode's own "Transcript" tab is named, because that is where the
    // text now comes from -- the old text sent people away from a source that
    // works.
    expect(body.textContent).toContain('Transcript');
    const steps = [...body.querySelectorAll('ol > li')].map((li) => li.textContent ?? '');
    expect(steps).toHaveLength(4);
    expect(steps[0]).toContain('sign in');
    expect(steps[1]).toContain('Transcript');
    expect(body.textContent).toContain('Leave the timestamps and speaker names in');
  });

  it('the Apple tab warns that copying is only in parts', async () => {
    await mount(APPLE);
    const badge = host!.querySelector('[data-app-tab-badge="apple"]')!;
    expect(badge.textContent).toBe('Copy in parts');
    expect(tabPanel('apple')!.textContent).toContain('a few paragraphs at a time');
  });
});

describe('PATCH-204 the open button follows the tab and the card URL', () => {
  it.each([
    [YOUTUBE, 'youtube', 'Open on YouTube ↗', YOUTUBE],
    [SPOTIFY, 'spotify', 'Open in Spotify ↗', SPOTIFY],
    [PLAIN, 'website', 'Open the page ↗', PLAIN],
  ])('%s -> %s', async (url, _id, label, href) => {
    await mount(url);
    expect(openLink()!.textContent).toBe(label);
    expect(openLink()!.getAttribute('href')).toBe(href);
    expect(openLink()!.getAttribute('target')).toBe('_blank');
    expect(openLink()!.getAttribute('rel')).toContain('noopener');
  });
});

describe('PATCH-204 the format follows the tab until the person decides', () => {
  it('Apple opens on plain, and an empty box lets YouTube take it back', async () => {
    await mount(APPLE);
    expect(formatSelect().value).toBe('plain');
    await clickTab('youtube');
    expect(formatSelect().value).toBe('youtube-panel');
  });

  it('Spotify opens with the timestamped format preselected, box empty', async () => {
    // Spotify's own signed-in "Transcript" tab copies with timestamps and
    // speakers, the same line layout the panel parser reads, so the tab must
    // preselect `youtube-panel` -- not `plain`, which would drop the timestamps.
    await mount(SPOTIFY);
    expect(formatSelect().value).toBe('youtube-panel');
    expect(payloadBox().value).toBe('');
  });

  it('typed text survives a tab switch and pins the format', async () => {
    await mount(APPLE);
    expect(formatSelect().value).toBe('plain');

    await typeIntoBox('1. d4 d5');

    await clickTab('youtube');
    // The format does NOT follow the tab once text is in the box...
    expect(formatSelect().value).toBe('plain');
    // ...and the pasted text is still there.
    expect(payloadBox().value).toBe('1. d4 d5');
  });

  it('Website or file opens with no preselected format', async () => {
    await mount(PLAIN);
    expect(formatSelect().value).toBe('');
    // The primary action is dead until a format is chosen, with the reason said.
    expect(payloadBox()).not.toBeNull();
  });
});
