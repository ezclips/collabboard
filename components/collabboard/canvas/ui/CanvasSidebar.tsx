"use client";

import React, { useRef, useState, useEffect } from 'react';

export interface SidebarToolItem {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  type: string;
  label: string;
  bg: string;
  color: string;
  disabled?: boolean;
  hint?: string;
}

export interface SidebarToolGroup {
  id: string;
  label: string;
  tools: SidebarToolItem[];
  /** Lower number = higher priority. Priority 1 groups are never collapsed. */
  priority: number;
  /** Groups marked alwaysVisible are never collapsed during height fallback. */
  alwaysVisible?: boolean;
}

interface CanvasSidebarProps {
  groups: SidebarToolGroup[];
  isLineMode: boolean;
  isGraphConnectMode: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  handleToolClick: (type: string) => void;
  onBack: () => void;
}

// Approximate heights used to decide whether to collapse groups
const OVERHEAD_H = 105; // py-6 (48) + back button (18) + divider (1) + surrounding gaps (~38)
const GROUP_H = (toolCount: number) => 20 + toolCount * 44; // label row + tools with internal gaps

export default function CanvasSidebar({
  groups,
  isLineMode,
  isGraphConnectMode,
  isCollapsed = false,
  onToggleCollapse,
  handleToolClick,
  onBack,
}: CanvasSidebarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isCollapsed) {
      setCollapsedIds(new Set());
      return;
    }

    const el = containerRef.current;
    if (!el) return;

    const check = () => {
      const avail = el.clientHeight;
      let needed = OVERHEAD_H;
      for (const g of groups) needed += GROUP_H(g.tools.length);

      if (needed <= avail) {
        setCollapsedIds(new Set());
        return;
      }

      const toCollapse = new Set<string>();
      let canSave = needed - avail;
      // Collapse lowest-priority (highest priority number) non-always-visible groups first
      const byPriority = [...groups]
        .filter(g => !g.alwaysVisible && g.priority > 1)
        .sort((a, b) => b.priority - a.priority);

      for (const g of byPriority) {
        if (canSave <= 0) break;
        toCollapse.add(g.id);
        canSave -= GROUP_H(g.tools.length);
      }

      setCollapsedIds(toCollapse);
    };

    const ro = new ResizeObserver(check);
    ro.observe(el);
    check();
    return () => ro.disconnect();
  }, [groups, isCollapsed]);

  return (
    <div
      ref={containerRef}
      className={`${isCollapsed ? 'w-12' : 'w-14'} h-full bg-white border-r flex flex-col items-center py-6 gap-3 shadow-sm z-20 relative overflow-visible transition-[width] duration-150`}
    >
      {/* Back button */}
      <button
        type="button"
        className="relative cursor-pointer hover:bg-gray-100 rounded p-0.5"
        onClick={onBack}
        title="Back to Dashboard"
      >
        <div className="group relative">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
            <path fill="#5F6672" fillRule="evenodd" d="m6.646 4.646.708.708-2.147 2.145L13 7.5v1H5.207l2.147 2.146-.708.708L3.293 8z" />
          </svg>
          <span className="absolute left-full ml-2 px-2 py-1 rounded bg-gray-700 text-white text-xs opacity-0 group-hover:opacity-100 whitespace-nowrap z-50 pointer-events-none">
            Dashboard
          </span>
        </div>
      </button>

      <div className="w-6 h-px bg-gray-200" />

      {/* Tool groups */}
      {groups.map((group) => {
        if (collapsedIds.has(group.id)) return null;
        return (
          <div key={group.id} className="flex flex-col items-center w-full gap-1">
            {!isCollapsed ? (
              <span className="text-[9px] font-medium text-gray-400 uppercase tracking-wider leading-none select-none px-1">
                {group.label}
              </span>
            ) : null}
            {group.tools.map((tool) => {
              const IconComponent = tool.icon;
              const isLineActive = tool.type === 'line' && isLineMode;
              const isGraphLineActive = tool.type === 'graph-line' && isGraphConnectMode;
              const isDisabled = !!tool.disabled;

              return (
                <div
                  key={tool.type}
                  className={`relative flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-150 ${
                    isLineActive
                      ? 'bg-blue-100 ring-2 ring-blue-400'
                      : isGraphLineActive
                        ? 'bg-indigo-100 ring-2 ring-indigo-400'
                        : tool.bg
                  } ${isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:scale-105'}`}
                  onClick={() => {
                    if (isDisabled) return;
                    handleToolClick(tool.type);
                  }}
                >
                  <div
                    className={`group relative flex items-center justify-center transition-transform duration-150 ${
                      isLineActive ? 'text-blue-600' : isGraphLineActive ? 'text-indigo-700' : tool.color
                    }`}
                  >
                    <IconComponent size={18} strokeWidth={1.5} />
                    <span className="absolute left-full ml-2 px-2 py-1 rounded bg-gray-700 text-white text-xs opacity-0 group-hover:opacity-100 whitespace-nowrap z-[100] pointer-events-none">
                      {isDisabled && tool.hint ? tool.hint : tool.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {onToggleCollapse ? (
        <button
          type="button"
          className="group relative mt-auto flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 transition hover:bg-gray-100"
          onClick={onToggleCollapse}
          aria-label={isCollapsed ? 'Expand toolbar' : 'Collapse toolbar'}
        >
          <span className="text-sm leading-none" aria-hidden="true">{isCollapsed ? '>' : '<'}</span>
          <span className="absolute left-full ml-2 px-2 py-1 rounded bg-gray-700 text-white text-xs opacity-0 group-hover:opacity-100 whitespace-nowrap z-[100] pointer-events-none">
            {isCollapsed ? 'Expand' : 'Collapse'}
          </span>
        </button>
      ) : null}
    </div>
  );
}
