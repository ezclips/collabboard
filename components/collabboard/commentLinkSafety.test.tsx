// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleSafeCommentLinkClick } from './commentLinkSafety';

function makeClickEvent(target: HTMLElement) {
  return {
    target,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as React.MouseEvent<HTMLElement>;
}

describe('handleSafeCommentLinkClick', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('returns false and does nothing when the click target is not inside a link', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const div = document.createElement('div');
    div.innerHTML = '<span>plain text</span>';
    document.body.appendChild(div);
    const span = div.querySelector('span')!;

    const event = makeClickEvent(span);
    const handled = handleSafeCommentLinkClick(event);

    expect(handled).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('opens an http(s) link in a new tab with noopener/noreferrer and prevents same-tab navigation', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const div = document.createElement('div');
    div.innerHTML = '<a href="https://example.com/path">click me</a>';
    document.body.appendChild(div);

    const event = makeClickEvent(div.querySelector('a')!);
    const handled = handleSafeCommentLinkClick(event);

    expect(handled).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(openSpy).toHaveBeenCalledWith('https://example.com/path', '_blank', 'noopener,noreferrer');
  });

  it('adds https when normalizing is already done upstream (protocol-relative treated via base URL)', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const div = document.createElement('div');
    div.innerHTML = '<a href="http://example.com">click</a>';
    document.body.appendChild(div);

    const event = makeClickEvent(div.querySelector('a')!);
    handleSafeCommentLinkClick(event);

    expect(openSpy).toHaveBeenCalledWith('http://example.com/', '_blank', 'noopener,noreferrer');
  });

  it('rejects javascript: URLs -- prevents default but never calls window.open', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const div = document.createElement('div');
    const a = document.createElement('a');
    a.setAttribute('href', 'javascript:alert(1)');
    a.textContent = 'evil';
    div.appendChild(a);
    document.body.appendChild(div);

    const event = makeClickEvent(a);
    const handled = handleSafeCommentLinkClick(event);

    expect(handled).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('rejects data: URLs', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const div = document.createElement('div');
    const a = document.createElement('a');
    a.setAttribute('href', 'data:text/html,<script>alert(1)</script>');
    div.appendChild(a);
    document.body.appendChild(div);

    const event = makeClickEvent(a);
    handleSafeCommentLinkClick(event);

    expect(openSpy).not.toHaveBeenCalled();
  });

  it('finds the anchor when the click target is a nested element inside it', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const div = document.createElement('div');
    div.innerHTML = '<a href="https://example.com"><strong>bold link</strong></a>';
    document.body.appendChild(div);
    const strong = div.querySelector('strong')!;

    const event = makeClickEvent(strong);
    const handled = handleSafeCommentLinkClick(event);

    expect(handled).toBe(true);
    expect(openSpy).toHaveBeenCalledWith('https://example.com/', '_blank', 'noopener,noreferrer');
  });
});
