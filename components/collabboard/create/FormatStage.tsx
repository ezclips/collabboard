'use client';

import React, { useEffect, useState } from 'react';
import type { LayoutType } from '@/types/collabboard';
import { BOARD_FORMATS, formatById } from './formatCatalog';

/** The shuffle stage: six cards that rearrange per format (mockup POS data). */
const ORDER: LayoutType[] = BOARD_FORMATS.map((format) => format.id);
const CARD_COLORS = ['#cbd8f6', '#f3d9a8', '#c9e8d4', '#f2c6c6', '#cbd8f6', '#f3d9a8'];

type Pos = [number, number, number, number, number?, number?];

const POS: Record<string, Pos[]> = {
  freeform: [[7, 10, 27, 30, -5], [40, 6, 22, 28, 3], [70, 14, 23, 34, -2], [12, 54, 30, 32, 2], [47, 48, 21, 36, -3], [74, 60, 20, 28, 4]],
  wall: [[6, 7, 27, 38], [37, 7, 27, 26], [68, 7, 27, 46], [6, 49, 27, 44], [37, 37, 27, 56], [68, 57, 27, 36]],
  columns: [[6, 16, 27, 28], [6, 48, 27, 30], [37, 16, 27, 40], [37, 60, 27, 24], [68, 16, 27, 22], [68, 42, 27, 32]],
  grid: [[6, 8, 27, 40], [37, 8, 27, 40], [68, 8, 27, 40], [6, 52, 27, 40], [37, 52, 27, 40], [68, 52, 27, 40]],
  timeline: [[8, 4, 36, 13], [56, 19, 36, 13], [8, 34, 36, 13], [56, 49, 36, 13], [8, 64, 36, 13], [56, 79, 36, 13]],
  map: [[20, 28, 12, 16], [44, 46, 12, 16], [70, 22, 12, 16], [30, 60, 12, 16], [62, 62, 12, 16], [82, 44, 12, 16]],
  kanban: [[8, 12, 24, 18], [8, 34, 24, 18], [38, 12, 24, 18], [38, 34, 24, 18], [38, 56, 24, 18], [68, 12, 24, 18]],
  gantt: [[6, 6, 30, 9], [22, 26, 34, 9], [40, 46, 28, 9], [52, 66, 36, 9], [30, 86, 30, 9], [64, 16, 30, 9]],
  scheduler: [[8, 6, 14, 12], [30, 26, 14, 12], [52, 46, 14, 12], [74, 26, 14, 12], [30, 66, 14, 12], [74, 66, 14, 12]],
  drawing: [[46, 40, 8, 12, 0, 1], [46, 40, 8, 12, 0, 1], [46, 40, 8, 12, 0, 1], [46, 40, 8, 12, 0, 1], [46, 40, 8, 12, 0, 1], [46, 40, 8, 12, 0, 1]],
};

interface Deco {
  name: string;
  layouts: LayoutType[];
  style: React.CSSProperties;
}

const DECORATIONS: Deco[] = [
  { name: 'map', layouts: ['map'], style: { top: '8%', left: '4%', right: '4%', bottom: '8%', borderRadius: '40% 55% 45% 50%/50% 40% 60% 45%', background: '#c9e8d4' } },
  { name: 'lanes', layouts: ['kanban'], style: { top: '6%', left: '4%', right: '4%', bottom: '6%', borderRadius: 6, background: 'linear-gradient(90deg,#e2e6ec 0 30%,transparent 30% 35%,#e2e6ec 35% 65%,transparent 65% 70%,#e2e6ec 70% 100%)' } },
  { name: 'rows', layouts: ['gantt'], style: { top: 0, left: 0, right: 0, bottom: 0, background: 'repeating-linear-gradient(0deg,transparent 0 13px,#cfd5de 13px 14px)' } },
  { name: 'cal', layouts: ['scheduler'], style: { top: 0, left: 0, right: 0, bottom: 0, background: 'repeating-linear-gradient(0deg,transparent 0 23px,#cfd5de 23px 24px),repeating-linear-gradient(90deg,transparent 0 41px,#cfd5de 41px 42px)' } },
  { name: 'line', layouts: ['timeline'], style: { left: 'calc(50% - 1px)', top: '4%', width: 2, height: '92%', background: '#94a3b8' } },
  { name: 'heads', layouts: ['columns'], style: { left: '6%', right: '6%', top: '6%', height: '6%', borderRadius: 3, background: 'linear-gradient(90deg,#94a3b8 0 28%,transparent 28% 36%,#94a3b8 36% 64%,transparent 64% 72%,#94a3b8 72% 100%)' } },
];

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface FormatStageProps {
  format: LayoutType;
  hovered: LayoutType | null;
  picked: boolean;
  templateName?: string | null;
}

export default function FormatStage({ format, hovered, picked, templateName }: FormatStageProps) {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(media.matches);
    setReduced(media.matches);
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    if (reduced || picked || hovered) return;
    const timer = setInterval(() => setIndex((current) => (current + 1) % ORDER.length), 2200);
    return () => clearInterval(timer);
  }, [reduced, picked, hovered]);

  const display: LayoutType = hovered && !picked ? hovered : picked ? format : ORDER[index];
  const active = formatById(display);
  const positions = POS[display] ?? POS.freeform;
  const cycling = !picked && display !== format;
  const subtitle = cycling
    ? 'Same posts, every format'
    : templateName
      ? `From template: ${templateName}`
      : 'Blank board';

  const cardTransition = reduced
    ? 'none'
    : 'left .75s cubic-bezier(.2,.8,.2,1),top .75s cubic-bezier(.2,.8,.2,1),width .75s cubic-bezier(.2,.8,.2,1),height .75s cubic-bezier(.2,.8,.2,1),transform .75s cubic-bezier(.2,.8,.2,1),border-radius .5s,opacity .4s';

  return (
    <div data-format-stage className="rounded-xl border border-slate-200 bg-white p-3">
      <div
        data-stage-layout={display}
        aria-hidden="true"
        className="relative aspect-[5/3] w-full overflow-hidden rounded-[10px] bg-slate-100"
      >
        {DECORATIONS.map((deco) => (
          <div
            key={deco.name}
            className="absolute"
            style={{
              ...deco.style,
              opacity: deco.layouts.includes(display) ? 1 : 0,
              transition: reduced ? 'none' : 'opacity .5s',
            }}
          />
        ))}
        <div
          className="absolute inset-0"
          style={{ opacity: display === 'drawing' ? 1 : 0, transition: reduced ? 'none' : 'opacity .5s' }}
        >
          <svg viewBox="0 0 100 60" preserveAspectRatio="none" className="h-full w-full">
            <path d="M8 44 C20 10 34 52 48 26 S76 8 92 34" fill="none" stroke="#2563eb" strokeWidth={2.2} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
        {positions.map((p, i) => (
          <div
            key={i}
            className="absolute"
            style={{
              left: `${p[0]}%`,
              top: `${p[1]}%`,
              width: `${p[2]}%`,
              height: `${p[3]}%`,
              background: CARD_COLORS[i],
              transform: `rotate(${p[4] ?? 0}deg)`,
              opacity: p[5] ? 0 : 1,
              borderRadius: display === 'map' ? '50% 50% 50% 4px' : 5,
              boxShadow: '0 1px 2px rgba(15,23,42,.12)',
              transition: cardTransition,
            }}
          />
        ))}
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div data-stage-name className="font-semibold text-slate-900">
            {active?.name ?? display}
          </div>
          <div data-stage-subtitle className="truncate text-xs text-slate-500">
            {subtitle}
          </div>
        </div>
        <div className="flex gap-1">
          {ORDER.map((id) => (
            <i
              key={id}
              className={`h-[5px] w-[5px] rounded-full ${id === display ? 'bg-blue-600' : 'bg-slate-300'}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
