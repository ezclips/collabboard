'use client';

import React from 'react';

import { OUTLINE_LIMITS } from '@/lib/ai/outline';
import type { FlowGraph } from '@/lib/ai/outlineToVisuals';

/**
 * PATCH-239. Edit a flowchart as steps plus the connections between them,
 * instead of raw Mermaid code. The caller regenerates `code` from the graph.
 */

const inputClass = 'min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-xs';
const selectClass = 'rounded border border-gray-300 px-2 py-1 text-xs';

function nextNodeId(nodes: FlowGraph['nodes']): string {
  let max = -1;
  for (const node of nodes) {
    const match = /^N(\d+)$/.exec(node.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `N${max + 1}`;
}

export default function FlowStepsEditor({
  graph,
  onChange,
}: {
  graph: FlowGraph;
  onChange: (graph: FlowGraph) => void;
}) {
  const setNodes = (nodes: FlowGraph['nodes']) => onChange({ ...graph, nodes });
  const setEdges = (edges: FlowGraph['edges']) => onChange({ ...graph, edges });

  const updateStep = (index: number, label: string) => {
    setNodes(graph.nodes.map((node, i) => (i === index ? { ...node, label } : node)));
  };

  const removeStep = (index: number) => {
    if (graph.nodes.length <= 1) return;
    const removed = graph.nodes[index].id;
    setNodes(graph.nodes.filter((_, i) => i !== index));
    setEdges(graph.edges.filter((edge) => edge.from !== removed && edge.to !== removed));
  };

  const addStep = () => {
    const id = nextNodeId(graph.nodes);
    const last = graph.nodes[graph.nodes.length - 1];
    const nodes = [...graph.nodes, { id, label: 'New step' }];
    const edges = last ? [...graph.edges, { from: last.id, to: id }] : graph.edges;
    onChange({ ...graph, nodes, edges });
  };

  const updateEdge = (index: number, patch: Partial<FlowGraph['edges'][number]>) => {
    setEdges(graph.edges.map((edge, i) => (i === index ? { ...edge, ...patch } : edge)));
  };

  return (
    <div data-ai-flow-editor="true" className="space-y-4">
      <div className="space-y-1">
        <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">Direction</label>
        <select
          data-ai-flow-direction="true"
          value={graph.direction}
          onChange={(e) => onChange({ ...graph, direction: e.target.value as 'LR' | 'TD' })}
          className={selectClass}
        >
          <option value="LR">Left to right</option>
          <option value="TD">Top to bottom</option>
        </select>
      </div>

      <div className="space-y-2">
        <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">Steps</label>
        {graph.nodes.map((node, index) => (
          <div key={node.id} className="flex items-center gap-1">
            <input
              type="text"
              data-ai-flow-step={index}
              value={node.label}
              maxLength={OUTLINE_LIMITS.label}
              onChange={(e) => updateStep(index, e.target.value)}
              placeholder="Step"
              className={inputClass}
            />
            <button
              type="button"
              data-ai-flow-step-remove={index}
              onClick={() => removeStep(index)}
              disabled={graph.nodes.length <= 1}
              className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-30"
              title="Remove step"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          data-ai-flow-add-step="true"
          onClick={addStep}
          className="flex items-center gap-1 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-500 hover:border-indigo-400 hover:text-indigo-600"
        >
          + Add step
        </button>
      </div>

      <div className="space-y-2">
        <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">Connections</label>
        {graph.edges.map((edge, index) => (
          <div key={index} className="flex items-center gap-1">
            <select
              data-ai-flow-edge-from={index}
              value={edge.from}
              onChange={(e) => updateEdge(index, { from: e.target.value })}
              className={selectClass}
            >
              {graph.nodes.map((node) => (
                <option key={node.id} value={node.id}>{node.label || node.id}</option>
              ))}
            </select>
            <span className="text-xs text-gray-400">→</span>
            <select
              data-ai-flow-edge-to={index}
              value={edge.to}
              onChange={(e) => updateEdge(index, { to: e.target.value })}
              className={selectClass}
            >
              {graph.nodes.map((node) => (
                <option key={node.id} value={node.id}>{node.label || node.id}</option>
              ))}
            </select>
            <input
              type="text"
              data-ai-flow-edge-label={index}
              value={edge.label ?? ''}
              maxLength={OUTLINE_LIMITS.label}
              onChange={(e) => updateEdge(index, { label: e.target.value || undefined })}
              placeholder="label"
              className="w-20 rounded border border-gray-300 px-2 py-1 text-xs"
            />
            <button
              type="button"
              data-ai-flow-edge-remove={index}
              onClick={() => setEdges(graph.edges.filter((_, i) => i !== index))}
              className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
              title="Remove connection"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          data-ai-flow-add-edge="true"
          onClick={() => {
            const from = graph.nodes[0]?.id;
            const to = graph.nodes[1]?.id ?? from;
            if (!from || !to) return;
            setEdges([...graph.edges, { from, to }]);
          }}
          disabled={graph.nodes.length < 2}
          className="flex items-center gap-1 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-500 hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-40"
        >
          + Add connection
        </button>
      </div>
    </div>
  );
}
