// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import PlanLimitNotice, { planLimitFromResponse } from './PlanLimitNotice';

/**
 * PATCH-188. The one shared plan-limit refusal.
 */

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mount(ui: React.ReactElement) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => { root!.render(ui); });
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe('planLimitFromResponse', () => {
  it('a plan_limit_credits body is non-null', () => {
    expect(planLimitFromResponse(402, {
      error: "The Free plan's AI credits for this month are used up.",
      code: 'plan_limit_credits',
    })).toEqual({
      message: "The Free plan's AI credits for this month are used up.",
      code: 'plan_limit_credits',
    });
  });

  it('a plan_limit_no_board body is non-null', () => {
    expect(planLimitFromResponse(402, {
      error: "This AI action isn't linked to a board.",
      code: 'plan_limit_no_board',
    })).toEqual({
      message: "This AI action isn't linked to a board.",
      code: 'plan_limit_no_board',
    });
  });

  it('{ error: \'x\' } with no code is null', () => {
    expect(planLimitFromResponse(500, { error: 'x' })).toBeNull();
  });

  it('a code without error is null', () => {
    expect(planLimitFromResponse(402, { code: 'plan_limit_credits' })).toBeNull();
  });

  it('a non-plan code is null', () => {
    expect(planLimitFromResponse(400, { error: 'x', code: 'validation' })).toBeNull();
  });

  it('a non-object body is null', () => {
    expect(planLimitFromResponse(500, 'boom')).toBeNull();
    expect(planLimitFromResponse(500, null)).toBeNull();
  });
});

describe('PlanLimitNotice', () => {
  it('renders the message and the See plans link', () => {
    const container = mount(<PlanLimitNotice message="Out of credits." />);
    const notice = container.querySelector('[data-plan-limit-notice="true"]')!;
    expect(notice.textContent).toContain('Out of credits.');
    expect(notice.querySelector('a')?.getAttribute('href')).toBe('/dashboard/settings/billing');
    expect(notice.querySelector('a')?.textContent).toBe('See plans');
  });
});
