/**
 * PATCH-283 Addendum 2, fixes 1 and the free-text widen. All texts with the same
 * `in` are STACKED in their element order (gap 0.35 x the larger size), the block
 * is centred vertically in the container, and the container grows to fit the
 * stack. Free text wraps to its own width, widening for a word that cannot fit.
 */

import type { DrawnElement, DrawnTextElement } from './format';
import { lineHeight, measureText, wrapText } from './textMetrics';

/** Gap between two stacked texts, as a fraction of the larger font size. */
export const TEXT_STACK_GAP = 0.35;
const ELLIPSE_GROW = 1.15;
const ELLIPSE_MAX_STEPS = 3;

interface TextBlock {
  text: DrawnTextElement;
  lines: string[];
  height: number;
  maxLineWidth: number;
}

function blockFor(text: DrawnTextElement, innerWidth: number): TextBlock {
  const lines = wrapText(text.text, text.size, innerWidth, !!text.bold);
  return {
    text,
    lines,
    height: lines.length * lineHeight(text.size),
    maxLineWidth: lines.reduce((max, line) => Math.max(max, measureText(line, text.size, !!text.bold)), 0),
  };
}

function gapBetween(a: TextBlock, b: TextBlock): number {
  return TEXT_STACK_GAP * Math.max(a.text.size, b.text.size);
}

function totalHeight(blocks: TextBlock[]): number {
  return blocks.reduce((sum, block, index) => {
    return sum + block.height + (index > 0 ? gapBetween(blocks[index - 1], block) : 0);
  }, 0);
}

function containerPad(texts: DrawnTextElement[]): number {
  return Math.max(10, 0.6 * Math.max(...texts.map((text) => text.size)));
}

/** Stacks one container's texts and grows the container when the stack does not fit. */
function stackInContainer(
  container: Extract<DrawnElement, { type: 'rect' | 'ellipse' }>,
  texts: DrawnTextElement[],
  fixes: string[],
): void {
  const pad = containerPad(texts);
  const innerWidth = () => Math.max(1, container.w - 2 * pad);

  let blocks = texts.map((text) => blockFor(text, innerWidth()));
  let total = totalHeight(blocks);

  if (total > container.h - 2 * pad) {
    if (container.type === 'rect') {
      container.h = total + 2 * pad;
    } else {
      let steps = 0;
      while (total > container.h - 2 * pad && steps < ELLIPSE_MAX_STEPS) {
        container.w *= ELLIPSE_GROW;
        container.h *= ELLIPSE_GROW;
        blocks = texts.map((text) => blockFor(text, innerWidth()));
        total = totalHeight(blocks);
        steps += 1;
      }
    }
    fixes.push(`grew container ${container.id} to fit its text stack`);
  }

  let cursor = container.y + (container.h - total) / 2;
  blocks.forEach((block, index) => {
    if (index > 0) cursor += gapBetween(blocks[index - 1], block);
    const { text } = block;
    const boxWidth = Math.min(innerWidth(), block.maxLineWidth);
    if (boxWidth > 0) text.w = boxWidth;
    text.x = container.x + (container.w - text.w) / 2;
    text.y = cursor;
    text.lines = block.lines;
    text.boxHeight = block.height;
    cursor += block.height;
  });
}

/** Steps 2 and 3. Container stacks and free-text widening. */
export function fitTexts(elements: DrawnElement[], fixes: string[]): void {
  const byId = new Map<string, DrawnElement>();
  for (const element of elements) byId.set(element.id, element);

  const groups = new Map<string, DrawnTextElement[]>();
  for (const element of elements) {
    if (element.type !== 'text' || !element.in) continue;
    const list = groups.get(element.in) ?? [];
    list.push(element);
    groups.set(element.in, list);
  }

  for (const [containerId, texts] of groups) {
    const container = byId.get(containerId);
    if (!container || (container.type !== 'rect' && container.type !== 'ellipse')) continue;
    stackInContainer(container, texts, fixes);
  }

  for (const element of elements) {
    if (element.type !== 'text' || element.in) continue;
    const words = element.text.split(/\s+/).filter(Boolean);
    const widestWord = words.reduce((max, word) => Math.max(max, measureText(word, element.size, !!element.bold)), 0);
    if (widestWord > element.w) {
      element.w = widestWord;
      fixes.push(`widened text ${element.id} to fit its longest word`);
    }
    const lines = wrapText(element.text, element.size, element.w, !!element.bold);
    element.lines = lines;
    element.boxHeight = lines.length * lineHeight(element.size);
  }
}
