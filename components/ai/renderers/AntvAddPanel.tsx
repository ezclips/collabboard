'use client';

import React from 'react';

import { ADDITION_SHAPES, type AdditionKind } from '@/lib/ai/antv/additions';
import type { VisualIconName } from '@/lib/ai/visualIcons';

import { AntvIconSearch } from './AntvIconPicker';

/**
 * PATCH-262. The "Add" side panel: shapes, text and a searchable icon grid that
 * insert a new addition into the picture. Presentational only -- the owner makes
 * the addition at the current view centre and stores it. Every control carries
 * `data-picture-control` so a press over the stage is never pan-captured.
 */

const SHAPE_LABELS: Record<string, string> = {
  rect: 'Rectangle',
  rounded: 'Rounded',
  circle: 'Circle',
  triangle: 'Triangle',
  line: 'Line',
  arrow: 'Arrow',
};

function ShapePreview({ kind }: { kind: AdditionKind }) {
  const common = { fill: '#E3E8FA', stroke: '#6A7FDB', strokeWidth: 1 } as const;
  return (
    <svg width="22" height="16" viewBox="0 0 22 16" aria-hidden="true">
      {kind === 'rect' && <rect x="2" y="2" width="18" height="12" rx="1" {...common} />}
      {kind === 'rounded' && <rect x="2" y="2" width="18" height="12" rx="4" {...common} />}
      {kind === 'circle' && <ellipse cx="11" cy="8" rx="9" ry="6" {...common} />}
      {kind === 'triangle' && <path d="M 11 2 L 20 14 L 2 14 Z" {...common} />}
      {kind === 'line' && <line x1="2" y1="13" x2="20" y2="3" stroke="#6A7FDB" strokeWidth="2" strokeLinecap="round" />}
      {kind === 'arrow' && (
        <>
          <line x1="2" y1="13" x2="17" y2="5" stroke="#6A7FDB" strokeWidth="2" strokeLinecap="round" />
          <path d="M 12 4 L 19 4 L 19 11" fill="none" stroke="#6A7FDB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}

export interface AntvAddPanelProps {
  onAddShape: (kind: AdditionKind) => void;
  onAddText: () => void;
  onAddIcon: (name: VisualIconName) => void;
}

export default function AntvAddPanel({ onAddShape, onAddText, onAddIcon }: AntvAddPanelProps) {
  return (
    <div data-ai-add-panel="true" data-picture-control="true" className="flex flex-col gap-4">
      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Shapes</div>
        <div className="grid grid-cols-3 gap-2">
          {ADDITION_SHAPES.map((kind) => (
            <button
              key={kind}
              type="button"
              data-ai-add-shape={kind}
              data-picture-control="true"
              title={SHAPE_LABELS[kind]}
              aria-label={SHAPE_LABELS[kind]}
              onClick={() => onAddShape(kind)}
              className="flex flex-col items-center gap-1 rounded-lg border border-gray-200 px-2 py-1.5 text-[10px] text-gray-600 hover:border-purple-300 hover:bg-purple-50"
            >
              <ShapePreview kind={kind} />
              <span>{SHAPE_LABELS[kind]}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Text</div>
        <button
          type="button"
          data-ai-add-text="true"
          data-picture-control="true"
          onClick={onAddText}
          className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:border-purple-300 hover:bg-purple-50"
        >
          Add text
        </button>
      </div>

      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Icons</div>
        <AntvIconSearch optionAttribute="data-ai-add-icon" onPick={onAddIcon} />
      </div>
    </div>
  );
}
