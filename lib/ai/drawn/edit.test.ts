import { describe, expect, it } from 'vitest';

import type { VisualOutline } from '@/lib/ai/outline';

import type { DrawnPicture } from './format';
import {
  applyEdit,
  removeElement,
  setBackground,
  setIconColour,
  setPaint,
  setText,
  setTextStyle,
} from './edit';

/**
 * PATCH-285. Pure edit operations: every op returns a NEW picture and never
 * mutates its input; unknown ids and invalid hex are refused (same picture back).
 */

const OUTLINE: VisualOutline = {
  title: 'Flow',
  ordered: true,
  kind: 'steps',
  items: [{ label: 'A' }, { label: 'B' }],
};

function picture(): DrawnPicture {
  return {
    version: 1,
    width: 800,
    height: 600,
    background: '#ffffff',
    elements: [
      { id: 'card', type: 'rect', x: 10, y: 10, w: 200, h: 40, fill: '#dceef5', stroke: '#2c7da0' },
      { id: 'label', type: 'text', text: 'Hello', x: 20, y: 20, w: 180, size: 16, color: '#111111', in: 'card' },
      { id: 'free', type: 'text', text: 'Free', x: 400, y: 20, w: 120, size: 14, color: '#222222' },
      { id: 'slice', type: 'wedge', item: 0, cx: 300, cy: 300, r: 120, fill: '#e11d48' },
      { id: 'bar', type: 'bar', item: 0, x: 10, y: 400, w: 60, h: 100, orient: 'v', fill: '#2563eb' },
      { id: 'arrow', type: 'line', points: [[0, 0], [50, 50]], stroke: '#000000' },
      { id: 'star', type: 'polygon', points: [[0, 0], [10, 0], [5, 10]], fill: '#facc15', stroke: '#111111' },
      { id: 'icon', type: 'icon', name: 'star', x: 500, y: 500, size: 24, color: '#7c3aed' },
    ],
  };
}

describe('PATCH-285 drawn edit operations', () => {
  it('setPaint changes the fill and leaves the input untouched', () => {
    const before = picture();
    const next = setPaint(before, 'card', { fill: '#ff0000' });
    expect(next).not.toBe(before);
    expect(next.elements).not.toBe(before.elements);
    expect(next.elements[0]).toMatchObject({ id: 'card', fill: '#ff0000', stroke: '#2c7da0' });
    expect((before.elements[0] as { fill: string }).fill).toBe('#dceef5');
  });

  it('setPaint changes a stroke and refuses an invalid hex', () => {
    const before = picture();
    const next = setPaint(before, 'card', { stroke: '#00ff00' });
    expect(next.elements[0]).toMatchObject({ stroke: '#00ff00' });
    expect(setPaint(before, 'card', { fill: 'red' })).toBe(before);
    expect(setPaint(before, 'card', { fill: '#12345' })).toBe(before);
  });

  it('setPaint refuses "none" for a wedge/bar fill but allows it for a rect fill', () => {
    const before = picture();
    expect(setPaint(before, 'slice', { fill: 'none' })).toBe(before);
    expect(setPaint(before, 'bar', { fill: 'none' })).toBe(before);
    expect(setPaint(before, 'card', { fill: 'none' }).elements[0]).toMatchObject({ fill: 'none' });
    expect(setPaint(before, 'slice', { fill: '#00ff00' }).elements[3]).toMatchObject({ fill: '#00ff00' });
  });

  it('setPaint refuses a fill on a line and honours stroke only', () => {
    const before = picture();
    expect(setPaint(before, 'arrow', { fill: '#ff0000' })).toBe(before);
    expect(setPaint(before, 'arrow', { stroke: '#ff0000' }).elements[5]).toMatchObject({ stroke: '#ff0000' });
  });

  it('unknown id returns the same picture from every op', () => {
    const before = picture();
    expect(setPaint(before, 'nope', { fill: '#ff0000' })).toBe(before);
    expect(setText(before, 'nope', 'x')).toBe(before);
    expect(setTextStyle(before, 'nope', { size: 20 })).toBe(before);
    expect(setIconColour(before, 'nope', '#ffffff')).toBe(before);
    expect(removeElement(before, 'nope')).toBe(before);
  });

  it('setText trims, refuses empty and over-long text, and returns a new picture', () => {
    const before = picture();
    const next = setText(before, 'label', '  World  ');
    expect(next.elements[1]).toMatchObject({ text: 'World' });
    expect(before.elements[1]).toMatchObject({ text: 'Hello' });
    expect(setText(before, 'label', '   ')).toBe(before);
    expect(setText(before, 'label', 'x'.repeat(301))).toBe(before);
    expect(setText(before, 'card', 'text')).toBe(before);
  });

  it('setTextStyle clamps size to 9..72 and applies colour and bold', () => {
    const before = picture();
    expect(setTextStyle(before, 'label', { size: 200 }).elements[1]).toMatchObject({ size: 72 });
    expect(setTextStyle(before, 'label', { size: 1 }).elements[1]).toMatchObject({ size: 9 });
    expect(setTextStyle(before, 'label', { size: 20, bold: true, color: '#00ff00' }).elements[1]).toMatchObject({
      size: 20,
      bold: true,
      color: '#00ff00',
    });
    expect(setTextStyle(before, 'label', { color: 'nope' })).toBe(before);
    expect(setTextStyle(before, 'card', { size: 20 })).toBe(before);
  });

  it('setIconColour changes only an icon', () => {
    const before = picture();
    expect(setIconColour(before, 'icon', '#123456').elements[7]).toMatchObject({ color: '#123456' });
    expect(setIconColour(before, 'card', '#123456')).toBe(before);
    expect(setIconColour(before, 'icon', 'bad')).toBe(before);
  });

  it('setBackground changes the picture background and refuses "none"', () => {
    const before = picture();
    expect(setBackground(before, '#0f172a').background).toBe('#0f172a');
    expect(before.background).toBe('#ffffff');
    expect(setBackground(before, 'none')).toBe(before);
    expect(setBackground(before, 'not-a-colour')).toBe(before);
  });

  it('removeElement removes a card and the texts whose `in` is that card', () => {
    const before = picture();
    const ids = removeElement(before, 'card').elements.map((element) => element.id);
    expect(ids).not.toContain('card');
    expect(ids).not.toContain('label');
    expect(ids).toContain('free');
    expect(before.elements).toHaveLength(8);
  });

  it('removeElement refuses wedge and bar (data marks)', () => {
    const before = picture();
    expect(removeElement(before, 'slice')).toBe(before);
    expect(removeElement(before, 'bar')).toBe(before);
  });

  it('applyEdit repairs so a longer text grows its card', () => {
    const before = picture();
    const next = applyEdit(before, OUTLINE, 'flowchart', (current) =>
      setText(current, 'label', 'A much longer label that will certainly wrap across several lines in the card'),
    );
    const card = next.elements.find((element) => element.id === 'card') as { h: number };
    expect(card.h).toBeGreaterThan(40);
    expect(before.elements.find((element) => element.id === 'card')).toMatchObject({ h: 40 });
  });

  it('applyEdit with a no-op op returns the same picture', () => {
    const before = picture();
    expect(applyEdit(before, OUTLINE, 'flowchart', (current) => current)).toBe(before);
  });
});
