// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { findConnectTargetId } from './connectTarget';

function postEl(id: string): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('data-padlet-id', id);
  return el;
}

describe('PATCH-227 findConnectTargetId', () => {
  it('returns the nearest post ancestor of the first hit element', () => {
    const post = postEl('target');
    const inner = document.createElement('span');
    post.appendChild(inner);
    const other = postEl('source');
    expect(findConnectTargetId([inner, other], 'source', () => true)).toBe('target');
  });

  it('skips the source post', () => {
    const source = postEl('source');
    expect(findConnectTargetId([source], 'source', () => true)).toBeNull();
  });

  it('skips elements that are not (inside) a post', () => {
    const plain = document.createElement('div');
    const target = postEl('target');
    expect(findConnectTargetId([plain, target], 'source', () => true)).toBe('target');
  });

  it('rejects a child post (parentId) and keeps looking', () => {
    const child = postEl('child');
    const top = postEl('top');
    const isTopLevel = (id: string) => id !== 'child';
    expect(findConnectTargetId([child, top], 'source', isTopLevel)).toBe('top');
  });

  it('returns null when nothing matches', () => {
    expect(findConnectTargetId([], 'source', () => true)).toBeNull();
    const child = postEl('child');
    expect(findConnectTargetId([child], 'source', () => false)).toBeNull();
  });
});
