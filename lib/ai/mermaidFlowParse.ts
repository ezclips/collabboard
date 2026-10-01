/**
 * PATCH-239. Parses the Mermaid `flowchart`/`graph` subset we generate (and
 * simple hand-written ones) into an editable `FlowGraph`. Anything outside that
 * subset (subgraph, click, ...) returns null so the modal falls back to code.
 */

import type { FlowGraph } from './outlineToVisuals';

const HEADER = /^(flowchart|graph)\s+(LR|TD|TB|BT|RL)\b/;
const NODE = /^([A-Za-z0-9_]+)(\(\(.*?\)\)|\(.*?\)|\{\{.*?\}\}|\[.*?\]|\{.*?\})?/;
const EDGE = /^(-\.->|==>|-->|---|--)/;
const IGNORED = /^(classDef|class|style)\b/;
const SHAPE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['((', '))'],
  ['{{', '}}'],
  ['(', ')'],
  ['[', ']'],
  ['{', '}'],
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

function unwrapShape(value: string): string {
  let out = value.trim();
  for (const [open, close] of SHAPE_PAIRS) {
    if (out.startsWith(open) && out.endsWith(close) && out.length >= open.length + close.length) {
      out = out.slice(open.length, out.length - close.length);
      break;
    }
  }
  return stripQuotes(out);
}

export function parseFlowCode(code: string): FlowGraph | null {
  if (typeof code !== 'string') return null;

  const lines = code.split(/\r?\n/);
  let headerIndex = -1;
  let direction: 'LR' | 'TD' = 'LR';

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith('%%')) continue;
    const match = HEADER.exec(trimmed);
    if (!match) return null;
    direction = match[2] === 'LR' || match[2] === 'RL' ? 'LR' : 'TD';
    headerIndex = i;
    break;
  }
  if (headerIndex === -1) return null;

  const labels = new Map<string, string>();
  const edges: FlowGraph['edges'] = [];

  const register = (id: string, label: string | undefined) => {
    if (label) labels.set(id, label);
    else if (!labels.has(id)) labels.set(id, id);
  };

  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    let rest = lines[i].trim().replace(/;$/, '');
    if (!rest) continue;
    if (rest.startsWith('%%') || IGNORED.test(rest)) continue;
    // These carry meaning we would silently drop: refuse rather than corrupt.
    if (/^(subgraph|end|click|linkStyle|direction)\b/.test(rest)) return null;

    const readNode = (): { id: string } | null => {
      rest = rest.replace(/^\s+/, '');
      const match = NODE.exec(rest);
      if (!match) return null;
      rest = rest.slice(match[0].length);
      register(match[1], match[2] ? unwrapShape(match[2]) || undefined : undefined);
      return { id: match[1] };
    };

    const first = readNode();
    if (!first) return null;

    let previous = first;
    rest = rest.replace(/^\s+/, '');
    while (rest.length > 0) {
      const op = EDGE.exec(rest);
      if (!op) return null;
      rest = rest.slice(op[0].length).replace(/^\s+/, '');

      let edgeLabel: string | undefined;
      if (rest.startsWith('|')) {
        const end = rest.indexOf('|', 1);
        if (end === -1) return null;
        edgeLabel = rest.slice(1, end);
        rest = rest.slice(end + 1).replace(/^\s+/, '');
      }

      const next = readNode();
      if (!next) return null;
      edges.push(edgeLabel ? { from: previous.id, to: next.id, label: edgeLabel } : { from: previous.id, to: next.id });
      previous = next;
      rest = rest.replace(/^\s+/, '');
    }
  }

  return {
    direction,
    nodes: [...labels.entries()].map(([id, label]) => ({ id, label })),
    edges,
  };
}
