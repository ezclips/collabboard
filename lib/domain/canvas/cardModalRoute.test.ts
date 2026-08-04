import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { selectCardModalRoute } from './cardModalRoute';

describe('selectCardModalRoute', () => {
  it('returns editor when canEditWorkspace is true', () => {
    expect(selectCardModalRoute(true)).toBe('editor');
  });

  it('returns viewer when canEditWorkspace is false', () => {
    expect(selectCardModalRoute(false)).toBe('viewer');
  });

  it('is deterministic and side-effect free', () => {
    expect(selectCardModalRoute(true)).toBe(selectCardModalRoute(true));
    expect(selectCardModalRoute(false)).toBe(selectCardModalRoute(false));
  });
});

describe('selectCardModalRoute: clipart card branch wiring (PATCH-151)', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'app/dashboard/canvas/[id]/CanvasClient.tsx'),
    'utf8',
  );
  const start = source.indexOf("post.type === 'card' && post.metadata?.svgUrl) {");
  const clipartBranch = source.slice(start, source.indexOf('\n    }', start));

  it('the clipart branch exists and routes through the shared helper', () => {
    expect(start).toBeGreaterThan(-1);
    expect(clipartBranch).toContain('selectCardModalRoute(canUseFreeformEditButton)');
  });

  it('the clipart branch opens both the editor and the viewer, not only the editor', () => {
    expect(clipartBranch).toContain('setIsClipartDraftModalOpen(true)');
    expect(clipartBranch).toContain('setIsCardViewerOpen(true)');
  });

  it('no second route-decision helper is used alongside the shared one', () => {
    expect((source.match(/selectCardModalRoute\(/g) || []).length).toBe(2);
  });
});
