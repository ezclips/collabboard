/**
 * PATCH-239. Parses a Mermaid `mindmap` back into our `MindmapTree`, so an older
 * code-only mind map can be edited as a form. Lenient about shape wrappers, ids,
 * quotes and icon/class decoration; returns null when the input is not a mind map.
 */

import type { MindmapTree } from './mindmapLayout';

const ID_AND_SHAPE = /^([A-Za-z0-9_-]+)\s*([([{)].*)$/;

const SHAPE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['((', '))'],
  ['{{', '}}'],
  ['))', '(('],
  ['{', '}'],
  ['(', ')'],
  ['[', ']'],
  [')', '('],
];

function stripQuotes(value: string): string {
  let out = value.trim();
  while (
    out.length >= 2
    && ((out.startsWith('"') && out.endsWith('"')) || (out.startsWith("'") && out.endsWith("'")))
  ) {
    out = out.slice(1, -1).trim();
  }
  return out;
}

function unwrapShape(value: string): string | null {
  let out = value.trim();
  for (const [open, close] of SHAPE_PAIRS) {
    if (out.startsWith(open) && out.endsWith(close) && out.length >= open.length + close.length) {
      out = out.slice(open.length, out.length - close.length);
      break;
    }
  }
  const text = stripQuotes(out);
  return text || null;
}

/** Node text from one Mermaid line, dropping an optional id prefix. */
export function parseMindmapNodeText(raw: string): string | null {
  let value = raw.trim();
  if (!value) return null;
  const match = ID_AND_SHAPE.exec(value);
  if (match && /^[([{)]/.test(match[2])) value = match[2].trim();
  return unwrapShape(value);
}

export function parseMindmapCode(code: string): MindmapTree | null {
  if (typeof code !== 'string') return null;

  const rawLines = code.split(/\r?\n/);
  const nodes: Array<{ indent: number; label: string }> = [];
  let sawHeader = false;

  for (const raw of rawLines) {
    const line = raw.replace(/\t/g, '  ');
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (!sawHeader) {
      if (trimmed !== 'mindmap') return null;
      sawHeader = true;
      continue;
    }

    // Mermaid decoration lines carry no node text.
    if (trimmed.includes('::icon(') || trimmed.includes(':::')) continue;

    const indent = line.length - line.trimStart().length;
    const label = parseMindmapNodeText(trimmed);
    if (!label) continue;
    nodes.push({ indent, label });
  }

  if (!sawHeader || nodes.length === 0) return null;

  const root: MindmapTree = { label: nodes[0].label };
  const stack: Array<{ indent: number; depth: number; tree: MindmapTree }> = [
    { indent: nodes[0].indent, depth: 0, tree: root },
  ];

  for (let i = 1; i < nodes.length; i += 1) {
    const { indent, label } = nodes[i];
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();

    const node: MindmapTree = { label };
    if (stack.length <= 1) {
      (root.children ??= []).push(node);
      stack.push({ indent, depth: 1, tree: node });
    } else {
      // Depth 3+ is folded into the nearest branch as an extra leaf.
      const branch = [...stack].reverse().find((entry) => entry.depth === 1)!.tree;
      (branch.children ??= []).push(node);
      stack.push({ indent, depth: 2, tree: node });
    }
  }

  return root;
}
