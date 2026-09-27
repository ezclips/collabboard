// @vitest-environment jsdom
//
// PATCH-208. A general link card's preview image is shown at its own 1.91:1
// shape instead of a cropped 128px strip, and the favicon is fetched large
// enough to be sharp at the size it is drawn. LinkEditor is the editor
// surface's renderer; FreeformPadletCards and PostCardContent are covered by
// the same shared embed component's test and by inspection.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LinkEditor from './LinkEditor';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
function mount(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(ui);
  });
  mounted.push({ root, container });
  return container;
}
afterEach(() => {
  for (const m of mounted) {
    act(() => {
      m.root.unmount();
    });
    m.container.remove();
  }
  mounted = [];
});

const noop = () => {};

describe('PATCH-208 a general link card keeps its 1.91:1 shape', () => {
  it('the preview image is aspect-[1.91/1], not a cropped strip', () => {
    const c = mount(
      <LinkEditor
        isOpen
        onClose={noop}
        onSave={vi.fn()}
        initialData={{
          linkUrl: 'https://example.com/article',
          linkTitle: 'An article',
          linkImage: 'https://example.com/hero.png',
        }}
        currentUserId="u1"
        currentUserName="User"
      />,
    );
    const img = c.querySelector<HTMLImageElement>('img[src="https://example.com/hero.png"]');
    expect(img).not.toBeNull();
    expect(img!.className).toContain('aspect-[1.91/1]');
    expect(img!.className).toContain('object-cover');
  });

  it('the favicon requests sz=64 and is drawn at 14px', () => {
    const c = mount(
      <LinkEditor
        isOpen
        onClose={noop}
        onSave={vi.fn()}
        initialData={{
          linkUrl: 'https://example.com/article',
          linkFavicon: 'https://www.google.com/s2/favicons?domain=example.com&sz=32',
        }}
        currentUserId="u1"
        currentUserName="User"
      />,
    );
    const favicon = [...c.querySelectorAll<HTMLImageElement>('img')].find((i) =>
      (i.getAttribute('src') ?? '').includes('sz=64'),
    );
    expect(favicon).not.toBeNull();
    expect(favicon!.getAttribute('src')).toContain('sz=64');
    expect(favicon!.className).toContain('rounded-sm');
  });
});
