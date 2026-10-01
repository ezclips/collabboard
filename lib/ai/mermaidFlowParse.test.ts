import { describe, expect, it } from 'vitest';

import { flowCodeFromGraph } from './outlineToVisuals';
import { parseFlowCode } from './mermaidFlowParse';

describe('PATCH-239 parseFlowCode', () => {
  const graph = {
    direction: 'LR' as const,
    nodes: [
      { id: 'N0', label: 'Start' },
      { id: 'N1', label: 'Next' },
      { id: 'N2', label: 'End' },
    ],
    edges: [
      { from: 'N0', to: 'N1' },
      { from: 'N1', to: 'N2', label: 'yes' },
    ],
  };

  it('round-trips our generated flow code', () => {
    expect(parseFlowCode(flowCodeFromGraph(graph))).toEqual(graph);
  });

  it('parses shapes, chains and edge labels', () => {
    const code = [
      'graph TD',
      '  A[Start] --> B{Decision}',
      '  B -->|yes| C(Go)',
      '  B -.-> D((Stop))',
      '  D ==> A',
    ].join('\n');
    const parsed = parseFlowCode(code)!;
    expect(parsed.direction).toBe('TD');
    expect(parsed.nodes).toEqual([
      { id: 'A', label: 'Start' },
      { id: 'B', label: 'Decision' },
      { id: 'C', label: 'Go' },
      { id: 'D', label: 'Stop' },
    ]);
    expect(parsed.edges).toEqual([
      { from: 'A', to: 'B' },
      { from: 'B', to: 'C', label: 'yes' },
      { from: 'B', to: 'D' },
      { from: 'D', to: 'A' },
    ]);
  });

  it('parses a chain A --> B --> C', () => {
    const parsed = parseFlowCode('flowchart LR\n  A --> B --> C')!;
    expect(parsed.edges).toEqual([
      { from: 'A', to: 'B' },
      { from: 'B', to: 'C' },
    ]);
  });

  it('ignores classDef, class, style and %% lines', () => {
    const code = [
      'flowchart LR',
      '  A[One]',
      '  B[Two]',
      '  classDef c0 fill:#fff,stroke:#000,color:#111',
      '  class A c0',
      '  style B fill:#eee',
      '  %% a comment',
      '  A --> B',
    ].join('\n');
    const parsed = parseFlowCode(code)!;
    expect(parsed.nodes).toEqual([
      { id: 'A', label: 'One' },
      { id: 'B', label: 'Two' },
    ]);
    expect(parsed.edges).toEqual([{ from: 'A', to: 'B' }]);
  });

  it('returns null for unsupported syntax', () => {
    expect(parseFlowCode('flowchart LR\n  subgraph one\n    A --> B\n  end')).toBeNull();
    expect(parseFlowCode('mindmap\n  root((x))')).toBeNull();
    expect(parseFlowCode('')).toBeNull();
  });
});
