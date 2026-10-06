// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearBoardTemplateRequest,
  hasBoardTemplateRequest,
  readBoardTemplateRequest,
  writeBoardTemplateRequest,
} from './templateRequest';

beforeEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState({}, '', '/');
});

describe('templateRequest (PATCH-301 Addendum 3)', () => {
  it('round-trips a pending request', () => {
    writeBoardTemplateRequest('b1', 'project-plan');
    expect(readBoardTemplateRequest('b1')).toEqual({ id: 'project-plan', state: 'pending' });
  });

  it('round-trips an applying request', () => {
    writeBoardTemplateRequest('b1', 'project-plan', 'applying');
    expect(readBoardTemplateRequest('b1')).toEqual({ id: 'project-plan', state: 'applying' });
  });

  it('returns null for a missing, malformed or partial key', () => {
    expect(readBoardTemplateRequest('b1')).toBeNull();
    window.sessionStorage.setItem('board-template-request:b1', 'not json');
    expect(readBoardTemplateRequest('b1')).toBeNull();
    window.sessionStorage.setItem('board-template-request:b1', JSON.stringify({ id: 'x' }));
    expect(readBoardTemplateRequest('b1')).toBeNull();
    window.sessionStorage.setItem(
      'board-template-request:b1',
      JSON.stringify({ id: 'x', state: 'nope' }),
    );
    expect(readBoardTemplateRequest('b1')).toBeNull();
  });

  it('clears the request', () => {
    writeBoardTemplateRequest('b1', 'project-plan');
    clearBoardTemplateRequest('b1');
    expect(readBoardTemplateRequest('b1')).toBeNull();
  });

  it('is true for the URL param alone', () => {
    window.history.replaceState({}, '', '/dashboard/canvas/b1?template=project-plan');
    expect(hasBoardTemplateRequest('b1')).toBe(true);
  });

  it('is true for a parked request alone', () => {
    writeBoardTemplateRequest('b1', 'project-plan', 'applying');
    expect(hasBoardTemplateRequest('b1')).toBe(true);
  });

  it('is false with neither a key nor a URL param', () => {
    expect(hasBoardTemplateRequest('b1')).toBe(false);
  });
});
