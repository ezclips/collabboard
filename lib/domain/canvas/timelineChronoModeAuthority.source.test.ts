import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PATCH-307. The timeline layout choice is stored on the board row, whose
 * UPDATE policy is owner-only. So the modal that asks for it, the button that
 * changes it, and the write itself must all be gated on the board's ownership
 * authority -- otherwise a viewer or collaborator is asked on every visit and
 * offered a control whose save the server silently refuses.
 */
const canvasClient = fs.readFileSync(
  path.join(process.cwd(), 'app/dashboard/canvas/[id]/CanvasClient.tsx'),
  'utf8',
);

describe('PATCH-307: a timeline asks for its layout once, and only its owner', () => {
  it('the init effect gates the modal on canManageBoardSettings and falls back to horizontal without saving', () => {
    const start = canvasClient.indexOf('// Initialize chrono mode from canvas settings');
    expect(start).toBeGreaterThan(-1);
    const end = canvasClient.indexOf('// Check B', start);
    expect(end).toBeGreaterThan(start);
    const effect = canvasClient.slice(start, end);

    expect(effect).toContain('canManageBoardSettings');
    expect(effect).toContain("setChronoMode('horizontal')");
    expect(effect).toContain('setShowChronoModeModal(true)');
    // The fallback for a non-owner is local only: it never writes.
    expect(effect).not.toContain('createSetChronoModeCommand');
    expect(effect).not.toContain('mergeCanvasSettings');
  });

  it('handleChronoModeChange returns early without authority and merges the saved mode locally', () => {
    const start = canvasClient.indexOf('const handleChronoModeChange = useCallback(');
    expect(start).toBeGreaterThan(-1);
    const end = canvasClient.indexOf('\n  }, [', start);
    expect(end).toBeGreaterThan(start);
    const handler = canvasClient.slice(start, end);

    expect(handler).toContain('if (!canManageBoardSettings) return;');
    expect(handler).toContain('mergeCanvasSettings({ chronoMode: mode })');
  });

  it('renders the layout button and the first-visit modal only for the owner', () => {
    const header = canvasClient.indexOf('<TimelineHeaderBar');
    const modal = canvasClient.indexOf('<ChronoModeSelectionModal');
    expect(header).toBeGreaterThan(-1);
    expect(modal).toBeGreaterThan(-1);
    expect(canvasClient.slice(header - 80, header)).toContain('canManageBoardSettings');
    expect(canvasClient.slice(modal - 120, modal)).toContain('canManageBoardSettings');
  });
});
