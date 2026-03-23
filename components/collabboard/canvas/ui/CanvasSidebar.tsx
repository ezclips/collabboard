"use client";

import React from 'react';

interface CanvasSidebarProps {
  sidebarTools: Array<{
    icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
    type: string;
    label: string;
    bg: string;
    color: string;
    disabled?: boolean;
    hint?: string;
  }>;
  selectedPadletId: string | null;
  selectedLineId: string | null;
  isLineMode: boolean;
  isGraphConnectMode: boolean;
  handleToolClick: (type: string) => void;
  onBack: () => void;
}

export default function CanvasSidebar({
  sidebarTools,
  selectedPadletId,
  selectedLineId,
  isLineMode,
  isGraphConnectMode,
  handleToolClick,
  onBack,
}: CanvasSidebarProps) {
  return (
    <div className="w-14 bg-white border-r flex flex-col items-center py-6 space-y-3 shadow-sm z-20 relative">
      <button
        type="button"
        className="relative cursor-pointer hover:bg-gray-100 rounded p-0.5"
        onClick={onBack}
        title="Back to Dashboard"
      >
        <div className="group relative">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
            <path fill="#5F6672" fillRule="evenodd" d="m6.646 4.646.708.708-2.147 2.145L13 7.5v1H5.207l2.147 2.146-.708.708L3.293 8z"></path>
          </svg>
          <span className="absolute left-full ml-2 px-2 py-1 rounded bg-gray-700 text-white text-xs opacity-0 group-hover:opacity-100 whitespace-nowrap z-50 pointer-events-none">
            Dashboard
          </span>
        </div>
      </button>

      <div className="w-6 h-px bg-gray-200" />

      {sidebarTools.map((tool, index) => {
        const IconComponent = tool.icon;
        const isTrashActive = tool.type === 'trash' && (selectedPadletId || selectedLineId);
        const isLineActive = tool.type === 'line' && isLineMode;
        const isGraphLineActive = tool.type === 'graph-line' && isGraphConnectMode;
        const isDisabled = !!tool.disabled || (tool.type === 'trash' && !selectedPadletId && !selectedLineId);
        return (
          <div
            key={index}
            className={`relative flex flex-col items-center p-2 rounded-lg transition-all duration-200 ${isTrashActive
              ? 'bg-red-100 ring-2 ring-red-400'
              : isLineActive
                ? 'bg-blue-100 ring-2 ring-blue-400'
                : isGraphLineActive
                  ? 'bg-indigo-100 ring-2 ring-indigo-400'
                  : tool.bg
              } ${isDisabled ? 'cursor-not-allowed hover:scale-100' : 'cursor-pointer hover:scale-105'}`}
            onClick={() => {
              if (isDisabled) return;
              handleToolClick(tool.type);
            }}
            title={tool.type === 'trash' && !selectedPadletId && !selectedLineId ? 'Select a post first' : tool.label}
          >
            <div className={`group w-8 h-8 flex items-center justify-center ${isTrashActive ? 'text-red-500' : isLineActive ? 'text-blue-600' : isGraphLineActive ? 'text-indigo-700' : tool.color
              } ${isDisabled ? 'opacity-50' : ''} hover:scale-110 transition-transform duration-200 relative`}>
              <IconComponent size={18} strokeWidth={1.5} />
              <span className="absolute left-full ml-2 px-2 py-1 rounded bg-gray-700 text-white text-xs opacity-0 group-hover:opacity-100 whitespace-nowrap z-50 pointer-events-none">
                {isDisabled && tool.hint ? tool.hint : tool.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
