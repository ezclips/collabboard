'use client';

import React from 'react';

import { OUTLINE_LIMITS } from '@/lib/ai/outline';
import { effectiveBranchSides, type MindmapTree } from '@/lib/ai/mindmapLayout';
import { addChild as addTreeChild } from '@/lib/ai/infographic/edit';

/**
 * PATCH-239. Edit a mind map as a tree -- the centre topic, then branches with
 * their sub-points -- instead of raw Mermaid code. Purely a form; the caller
 * regenerates `code` from every changed tree.
 */

const MAX_BRANCHES = OUTLINE_LIMITS.items; // 8
const MAX_CHILDREN = OUTLINE_LIMITS.children; // 6

type Branch = NonNullable<MindmapTree['children']>[number];

const inputClass = 'min-w-0 flex-1 rounded border border-gray-300 px-2 py-1 text-xs';

export default function MindmapTreeEditor({
  tree,
  onChange,
}: {
  tree: MindmapTree;
  onChange: (tree: MindmapTree) => void;
}) {
  const branches: Branch[] = tree.children ?? [];
  const setBranches = (next: Branch[]) => onChange({ ...tree, children: next });

  const updateBranch = (index: number, label: string) => {
    setBranches(branches.map((branch, i) => (i === index ? { ...branch, label } : branch)));
  };

  const moveBranch = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= branches.length) return;
    const next = [...branches];
    [next[index], next[target]] = [next[target], next[index]];
    setBranches(next);
  };

  const removeBranch = (index: number) => {
    if (branches.length <= 1) return;
    setBranches(branches.filter((_, i) => i !== index));
  };

  const addBranch = () => {
    if (branches.length >= MAX_BRANCHES) return;
    // PATCH-242: add on the side with fewer branches (tie -> right), after the
    // helper has frozen every existing branch's current side.
    const sides = effectiveBranchSides(branches);
    const left = sides.filter((side) => side === 'left').length;
    const side = left < sides.length - left ? 'left' : 'right';
    onChange(addTreeChild(tree, [], { side }));
  };

  const updateChild = (branchIndex: number, childIndex: number, label: string) => {
    setBranches(branches.map((branch, i) => {
      if (i !== branchIndex) return branch;
      const children = (branch.children ?? []).map((child, j) => (j === childIndex ? { label } : child));
      return { ...branch, children };
    }));
  };

  const removeChild = (branchIndex: number, childIndex: number) => {
    setBranches(branches.map((branch, i) => {
      if (i !== branchIndex) return branch;
      return { ...branch, children: (branch.children ?? []).filter((_, j) => j !== childIndex) };
    }));
  };

  const addChild = (branchIndex: number) => {
    setBranches(branches.map((branch, i) => {
      if (i !== branchIndex) return branch;
      const children = branch.children ?? [];
      if (children.length >= MAX_CHILDREN) return branch;
      return { ...branch, children: [...children, { label: 'New point' }] };
    }));
  };

  // PATCH-241. The centre topic is no longer edited here: the caller's Title
  // field IS the centre, and the two are kept equal in saved data.
  return (
    <div data-ai-mindmap-editor="true" className="space-y-4">
      <div className="space-y-3">
        <label className="block text-xs font-medium uppercase tracking-wide text-gray-500">Branches</label>
        {branches.map((branch, branchIndex) => (
          <div key={branchIndex} className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
            <div className="flex items-center gap-1">
              <input
                type="text"
                data-ai-mindmap-branch={branchIndex}
                value={branch.label}
                maxLength={OUTLINE_LIMITS.label}
                onChange={(e) => updateBranch(branchIndex, e.target.value)}
                placeholder="Branch"
                className={inputClass}
              />
              <button
                type="button"
                data-ai-mindmap-branch-up={branchIndex}
                onClick={() => moveBranch(branchIndex, -1)}
                disabled={branchIndex === 0}
                className="rounded px-1.5 py-1 text-xs text-gray-500 hover:bg-gray-200 disabled:opacity-30"
                title="Move up"
              >
                ↑
              </button>
              <button
                type="button"
                data-ai-mindmap-branch-down={branchIndex}
                onClick={() => moveBranch(branchIndex, 1)}
                disabled={branchIndex === branches.length - 1}
                className="rounded px-1.5 py-1 text-xs text-gray-500 hover:bg-gray-200 disabled:opacity-30"
                title="Move down"
              >
                ↓
              </button>
              <button
                type="button"
                data-ai-mindmap-branch-remove={branchIndex}
                onClick={() => removeBranch(branchIndex)}
                disabled={branches.length <= 1}
                className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-30"
                title="Remove branch"
              >
                ×
              </button>
            </div>

            <div className="space-y-1 pl-4">
              {(branch.children ?? []).map((child, childIndex) => (
                <div key={childIndex} className="flex items-center gap-1">
                  <input
                    type="text"
                    data-ai-mindmap-child={`${branchIndex}-${childIndex}`}
                    value={child.label}
                    maxLength={OUTLINE_LIMITS.label}
                    onChange={(e) => updateChild(branchIndex, childIndex, e.target.value)}
                    placeholder="Sub-point"
                    className={inputClass}
                  />
                  <button
                    type="button"
                    data-ai-mindmap-child-remove={`${branchIndex}-${childIndex}`}
                    onClick={() => removeChild(branchIndex, childIndex)}
                    className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                    title="Remove sub-point"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                data-ai-mindmap-add-child={branchIndex}
                onClick={() => addChild(branchIndex)}
                disabled={(branch.children ?? []).length >= MAX_CHILDREN}
                className="text-xs text-indigo-500 hover:underline disabled:opacity-40"
              >
                + Add sub-point
              </button>
            </div>
          </div>
        ))}

        <button
          type="button"
          data-ai-mindmap-add-branch="true"
          onClick={addBranch}
          disabled={branches.length >= MAX_BRANCHES}
          className="flex items-center gap-1 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-500 hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-40"
        >
          + Add branch
        </button>
      </div>
    </div>
  );
}
