import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PATCH-308. react-big-calendar remounts an event wrapper whenever the
 * `components` prop identity changes, so an inline object literal discarded an
 * open context menu on the very re-render its own click caused. The event's
 * own click must also survive the slot click beneath it, and the "0 posts"
 * tooltip must not sit over the menu.
 */
const src = fs.readFileSync(
  path.join(process.cwd(), 'components/canvas/StandaloneSchedulerCanvas.tsx'),
  'utf8',
);

describe('PATCH-308: the scheduler calendar keeps a stable, non-cancelling surface', () => {
  it('passes a memoised components value, not an inline object literal', () => {
    expect(src).toContain('const calendarComponents = useMemo(');
    expect(src).toContain('components={calendarComponents}');
    expect(src).not.toContain('components={{');
  });

  it('handleSelectSlot lets the event own a click that overlaps an existing event', () => {
    const start = src.indexOf('const handleSelectSlot = useCallback(');
    expect(start).toBeGreaterThan(-1);
    const handler = src.slice(start, src.indexOf('[events, onCreatePadlet, onSelectTimeSlot, readOnly]', start));

    const overlapStart = handler.indexOf('if (overlapsExistingEvent) {');
    expect(overlapStart).toBeGreaterThan(-1);
    const overlapEnd = handler.indexOf('}', overlapStart);
    const overlapBranch = handler.slice(overlapStart, overlapEnd + 1);
    expect(overlapBranch).not.toContain('onSelectTimeSlot');
    expect(overlapBranch).toContain('return;');
  });

  it('the event tab carries an aria-label, not a native title tooltip', () => {
    const tabStart = src.indexOf('data-scheduler-event-tab="true"');
    expect(tabStart).toBeGreaterThan(-1);
    const tab = src.slice(tabStart, tabStart + 400);
    expect(tab).not.toContain('title=');
    expect(tab).toContain('aria-label=');
  });

  it('the event wrapper opens the event from a window mouseup, not its own', () => {
    const wrapperStart = src.indexOf('const CustomEventWrapper = useCallback(');
    expect(wrapperStart).toBeGreaterThan(-1);
    const wrapper = src.slice(wrapperStart, src.indexOf('const CustomEvent = useCallback(', wrapperStart));
    expect(wrapper).toContain("window.addEventListener('mouseup'");
    expect(wrapper).toContain('{ capture: true, once: true }');
    expect(wrapper).not.toContain('onMouseUp=');
  });

  it('both day-span handles ignore every button but the left', () => {
    expect(src).toMatch(
      /if \(e\.button !== 0\) return;\s*e\.stopPropagation\(\);\s*e\.preventDefault\(\);\s*startDaySpanDrag\(event, 'start'\)/,
    );
    expect(src).toMatch(
      /if \(e\.button !== 0\) return;\s*e\.stopPropagation\(\);\s*e\.preventDefault\(\);\s*startDaySpanDrag\(event, 'end'\)/,
    );
  });
});
