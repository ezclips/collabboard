import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PATCH-308. The scheduler's copy must match its behaviour: a single click on a
 * time slot deliberately does nothing, and an event can be targeted to receive
 * a new post from the toolbar.
 */
const src = fs.readFileSync(
  path.join(process.cwd(), 'app/dashboard/canvas/[id]/CanvasClient.tsx'),
  'utf8',
);

describe('PATCH-308: the scheduler hint bar copy', () => {
  it('tells an empty scheduler to double-click or drag', () => {
    expect(src).toContain(
      '<kbd style={kbdStyle}>Double-click</kbd> a time slot or drag across slots to add an event, or use the <kbd style={kbdStyle}>toolbar</kbd>',
    );
  });

  it('tells the owner an event is selected and can receive a post', () => {
    expect(src).toContain(
      'Event selected — pick a post type in the <kbd style={kbdStyle}>toolbar</kbd> to add it to this event',
    );
  });
});
