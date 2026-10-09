// @vitest-environment jsdom
//
// PATCH-331. The shared Scheduler toolbar: centre labels and the week popover.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { View } from 'react-big-calendar';

// Side effect: sets the GLOBAL Monday-first week the toolbar relies on.
import '@/lib/scheduler/schedulerLocalizer';
import { SchedulerToolbar, schedulerToolbarLabel } from '@/components/scheduler-canvas/SchedulerToolbar';

(globalThis as unknown as { React?: typeof React }).React = React;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DATE = new Date(2026, 9, 9); // Friday 9 October 2026

let root: Root | null = null;
let container: HTMLElement;

interface MountProps {
  view?: View;
  views?: View[];
  onNavigate?: (action: 'PREV' | 'NEXT' | 'TODAY' | Date) => void;
  onView?: (view: View) => void;
}

async function mount(props: MountProps = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <SchedulerToolbar
        date={DATE}
        view={props.view ?? 'week'}
        views={props.views ?? ['month', 'week', 'day', 'agenda']}
        onNavigate={props.onNavigate ?? vi.fn()}
        onView={props.onView ?? vi.fn()}
      />,
    );
  });
}

const q = (selector: string) => container.querySelector(selector) as HTMLElement | null;

beforeEach(() => { document.body.innerHTML = ''; });
afterEach(() => {
  if (root) { act(() => root!.unmount()); root = null; }
  container?.remove();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('PATCH-331 toolbar labels', () => {
  it('week: "Week 41"; day/month/agenda are readable, no US numeric dates', () => {
    expect(schedulerToolbarLabel('week', DATE)).toBe('Week 41');
    expect(schedulerToolbarLabel('day', DATE)).toBe('Friday, 9 October 2026');
    expect(schedulerToolbarLabel('month', DATE)).toBe('October 2026');
    expect(schedulerToolbarLabel('agenda', DATE)).toBe('9 October – 8 November 2026');
  });

  it('the week label carries the range as a title and toggles a popover', async () => {
    await mount({ view: 'week' });
    const label = q('[data-scheduler-week-label="true"]') as HTMLButtonElement;
    expect(label.textContent).toBe('Week 41');
    expect(label.getAttribute('title')).toBe('Week 41: 5-11 October 2026');

    await act(async () => { label.click(); });
    expect(q('[data-scheduler-week-range-popover="true"]')?.textContent).toContain('5-11 October 2026');

    await act(async () => { label.click(); });
    expect(q('[data-scheduler-week-range-popover="true"]')).toBeNull();
  });

  it('the day view label is a full readable date', async () => {
    await mount({ view: 'day' });
    expect(q('.rbc-toolbar-label')?.textContent).toBe('Friday, 9 October 2026');
  });
});

describe('PATCH-331 toolbar buttons', () => {
  it('Today/Back/Next call onNavigate and view buttons call onView', async () => {
    const onNavigate = vi.fn();
    const onView = vi.fn();
    await mount({ view: 'week', onNavigate, onView });

    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('.rbc-btn-group button'));
    const byText = (text: string) => buttons.find((button) => button.textContent === text)!;
    await act(async () => { byText('Today').click(); byText('Back').click(); byText('Next').click(); });
    expect(onNavigate.mock.calls.map((call) => call[0])).toEqual(['TODAY', 'PREV', 'NEXT']);

    await act(async () => { q('[data-scheduler-view="month"]')!.click(); });
    expect(onView).toHaveBeenCalledWith('month');
  });

  it('renders exactly the view set it is given', async () => {
    await mount({ view: 'week', views: ['week', 'day', 'month'] });
    const views = Array.from(container.querySelectorAll('[data-scheduler-view]')).map((el) => el.getAttribute('data-scheduler-view'));
    expect(views).toEqual(['week', 'day', 'month']);
  });
});
