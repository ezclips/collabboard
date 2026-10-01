import { describe, expect, it } from 'vitest';

import { layoutMindmap, type MindmapLayoutNode, type MindmapTree } from './mindmapLayout';

function branch(label: string, leafCount = 0): { label: string; children?: Array<{ label: string }> } {
  return {
    label,
    children: Array.from({ length: leafCount }, (_, i) => ({ label: `${label} leaf ${i + 1} with words` })),
  };
}

function tree(branchCount: number, leafCount = 0): MindmapTree {
  return {
    label: 'Root',
    children: Array.from({ length: branchCount }, (_, i) => branch(`Branch ${i + 1}`, leafCount)),
  };
}

function rect(node: MindmapLayoutNode) {
  return {
    left: node.x - node.w / 2,
    right: node.x + node.w / 2,
    top: node.y - node.h / 2,
    bottom: node.y + node.h / 2,
  };
}

function overlaps(a: MindmapLayoutNode, b: MindmapLayoutNode): boolean {
  const ra = rect(a);
  const rb = rect(b);
  return ra.left < rb.right && rb.left < ra.right && ra.top < rb.bottom && rb.top < ra.bottom;
}

describe('PATCH-234 layoutMindmap', () => {
  it('splits 3 branches 2 right / 1 left', () => {
    const layout = layoutMindmap(tree(3));
    const root = layout.nodes.find((n) => n.depth === 0)!;
    const branches = layout.nodes.filter((n) => n.depth === 1);
    expect(branches.filter((n) => n.x > root.x)).toHaveLength(2);
    expect(branches.filter((n) => n.x < root.x)).toHaveLength(1);
  });

  it('splits 8 branches 4 / 4', () => {
    const layout = layoutMindmap(tree(8));
    const root = layout.nodes.find((n) => n.depth === 0)!;
    const branches = layout.nodes.filter((n) => n.depth === 1);
    expect(branches.filter((n) => n.x > root.x)).toHaveLength(4);
    expect(branches.filter((n) => n.x < root.x)).toHaveLength(4);
  });

  it('never overlaps any two node rects (8 branches x 6 long leaves)', () => {
    const layout = layoutMindmap(tree(8, 6));
    for (let i = 0; i < layout.nodes.length; i += 1) {
      for (let j = i + 1; j < layout.nodes.length; j += 1) {
        expect(
          overlaps(layout.nodes[i], layout.nodes[j]),
          `${layout.nodes[i].id} overlaps ${layout.nodes[j].id}`,
        ).toBe(false);
      }
    }
  });

  it('wraps long branch labels to several lines within the max width', () => {
    const layout = layoutMindmap({
      label: 'Root',
      children: [{ label: 'This is a very long branch label that should wrap across several lines cleanly' }],
    });
    const node = layout.nodes.find((n) => n.depth === 1)!;
    expect(node.lines.length).toBeGreaterThan(1);
    for (const line of node.lines) {
      expect(line.length * 7.2).toBeLessThanOrEqual(170);
    }
  });

  it('gives leaves the same colour index as their branch', () => {
    const layout = layoutMindmap(tree(3, 2));
    for (const leaf of layout.nodes.filter((n) => n.depth === 2)) {
      const branchId = leaf.id.split('l')[0];
      const branchNode = layout.nodes.find((n) => n.id === branchId)!;
      expect(leaf.colorIndex).toBe(branchNode.colorIndex);
    }
    expect(layout.nodes.filter((n) => n.depth === 0)[0].colorIndex).toBe(-1);
  });

  it('PATCH-240: every node carries its path (root [], branch [b], leaf [b, l])', () => {
    const layout = layoutMindmap(tree(3, 2));
    expect(layout.nodes.find((n) => n.id === 'root')!.path).toEqual([]);
    expect(layout.nodes.find((n) => n.id === 'b0')!.path).toEqual([0]);
    expect(layout.nodes.find((n) => n.id === 'b1l1')!.path).toEqual([1, 1]);
  });

  it('starts and ends every link on a node edge midpoint', () => {
    const layout = layoutMindmap(tree(3, 2));
    const byId = new Map(layout.nodes.map((n) => [n.id, n]));
    const parse = (d: string) => {
      const m = /^M ([\d.-]+),([\d.-]+) C [\d.-]+,([\d.-]+) [\d.-]+,([\d.-]+) ([\d.-]+),([\d.-]+)$/.exec(d);
      if (!m) throw new Error(`unparsable path: ${d}`);
      return { sx: +m[1], sy: +m[2], ex: +m[5], ey: +m[6] };
    };
    for (const link of layout.links) {
      const from = byId.get(link.fromId)!;
      const to = byId.get(link.toId)!;
      const side: 'left' | 'right' = to.x > from.x ? 'right' : 'left';
      const { sx, sy, ex, ey } = parse(link.d);
      expect(sx).toBeCloseTo(side === 'right' ? from.x + from.w / 2 : from.x - from.w / 2, 5);
      expect(sy).toBeCloseTo(from.y, 5);
      expect(ex).toBeCloseTo(side === 'right' ? to.x - to.w / 2 : to.x + to.w / 2, 5);
      expect(ey).toBeCloseTo(to.y, 5);
    }
  });
});
