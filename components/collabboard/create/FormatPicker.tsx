'use client';

import React from 'react';
import { Check, Sparkles } from 'lucide-react';
import type { LayoutType } from '@/types/collabboard';
import { templatesForLayout } from '@/lib/collabboard/templates/registry';
import { BOARD_FORMAT_GROUPS } from './formatCatalog';

/** The mockup's format illustrations (SVG source, colours inlined). */
const MINI: Record<string, string> = {
  freeform:
    '<rect x="10" y="10" width="34" height="22" rx="3" fill="#cbd8f6"/><rect x="58" y="16" width="26" height="30" rx="3" fill="#f3d9a8"/><rect x="92" y="8" width="20" height="16" rx="3" fill="#c9e8d4"/><rect x="20" y="42" width="30" height="20" rx="3" fill="#f2c6c6"/><path d="M48 24 L58 30" stroke="#94a3b8" stroke-width="2" fill="none"/><rect x="88" y="40" width="24" height="22" rx="3" fill="#cbd8f6"/>',
  wall: '<rect x="10" y="8" width="30" height="26" rx="3" fill="#cbd8f6"/><rect x="45" y="8" width="30" height="18" rx="3" fill="#f3d9a8"/><rect x="80" y="8" width="30" height="30" rx="3" fill="#c9e8d4"/><rect x="10" y="38" width="30" height="26" rx="3" fill="#f2c6c6"/><rect x="45" y="30" width="30" height="34" rx="3" fill="#cbd8f6"/><rect x="80" y="42" width="30" height="22" rx="3" fill="#f3d9a8"/>',
  columns:
    '<rect x="10" y="8" width="30" height="6" rx="2" fill="#94a3b8"/><rect x="45" y="8" width="30" height="6" rx="2" fill="#94a3b8"/><rect x="80" y="8" width="30" height="6" rx="2" fill="#94a3b8"/><rect x="10" y="18" width="30" height="16" rx="3" fill="#cbd8f6"/><rect x="10" y="38" width="30" height="14" rx="3" fill="#f3d9a8"/><rect x="45" y="18" width="30" height="22" rx="3" fill="#c9e8d4"/><rect x="80" y="18" width="30" height="12" rx="3" fill="#f2c6c6"/><rect x="80" y="34" width="30" height="18" rx="3" fill="#cbd8f6"/>',
  grid: '<rect x="10" y="8" width="30" height="24" rx="3" fill="#cbd8f6"/><rect x="45" y="8" width="30" height="24" rx="3" fill="#f3d9a8"/><rect x="80" y="8" width="30" height="24" rx="3" fill="#c9e8d4"/><rect x="10" y="38" width="30" height="24" rx="3" fill="#f2c6c6"/><rect x="45" y="38" width="30" height="24" rx="3" fill="#cbd8f6"/><rect x="80" y="38" width="30" height="24" rx="3" fill="#f3d9a8"/>',
  timeline:
    '<path d="M60 6 V66" stroke="#94a3b8" stroke-width="2" fill="none"/><circle cx="60" cy="16" r="3" fill="#94a3b8"/><circle cx="60" cy="36" r="3" fill="#94a3b8"/><circle cx="60" cy="56" r="3" fill="#94a3b8"/><rect x="14" y="9" width="38" height="14" rx="3" fill="#cbd8f6"/><rect x="68" y="29" width="38" height="14" rx="3" fill="#f3d9a8"/><rect x="14" y="49" width="38" height="14" rx="3" fill="#c9e8d4"/>',
  map: '<path d="M10 20 Q30 8 50 18 T90 16 Q110 14 112 30 L112 60 Q90 52 70 60 T30 58 Q14 60 10 50 Z" fill="#c9e8d4"/><circle cx="36" cy="30" r="4" fill="#2563eb"/><circle cx="74" cy="40" r="4" fill="#2563eb"/><circle cx="96" cy="26" r="4" fill="#2563eb"/>',
  kanban:
    '<rect x="10" y="8" width="30" height="56" rx="4" fill="#e2e6ec"/><rect x="45" y="8" width="30" height="56" rx="4" fill="#e2e6ec"/><rect x="80" y="8" width="30" height="56" rx="4" fill="#e2e6ec"/><rect x="14" y="14" width="22" height="10" rx="2" fill="#cbd8f6"/><rect x="14" y="28" width="22" height="10" rx="2" fill="#f3d9a8"/><rect x="49" y="14" width="22" height="10" rx="2" fill="#c9e8d4"/><rect x="84" y="14" width="22" height="10" rx="2" fill="#f2c6c6"/>',
  gantt:
    '<path d="M10 14 H112 M10 30 H112 M10 46 H112 M10 62 H112" stroke="#cfd5de" stroke-width="1" fill="none"/><rect x="14" y="17" width="40" height="9" rx="2" fill="#cbd8f6"/><rect x="44" y="33" width="34" height="9" rx="2" fill="#f3d9a8"/><rect x="70" y="49" width="38" height="9" rx="2" fill="#c9e8d4"/><path d="M54 22 H60 V37" stroke="#94a3b8" stroke-width="2" fill="none"/>',
  scheduler:
    '<rect x="10" y="8" width="102" height="10" rx="2" fill="#94a3b8"/><path d="M10 22 H112 M10 36 H112 M10 50 H112 M10 64 H112 M30 22 V64 M50 22 V64 M70 22 V64 M90 22 V64" stroke="#cfd5de" stroke-width="1" fill="none"/><rect x="32" y="25" width="16" height="9" rx="2" fill="#cbd8f6"/><rect x="72" y="39" width="16" height="9" rx="2" fill="#f2c6c6"/><rect x="52" y="53" width="16" height="9" rx="2" fill="#c9e8d4"/>',
  drawing:
    '<path d="M16 50 C30 14 50 60 64 30 S96 10 106 40" stroke="#2563eb" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="34" cy="22" r="9" fill="none" stroke="#94a3b8" stroke-width="2"/><rect x="74" y="44" width="26" height="16" rx="3" fill="none" stroke="#94a3b8" stroke-width="2"/>',
};

export interface FormatPickerProps {
  format: LayoutType;
  onSelect: (format: LayoutType) => void;
  onHover: (format: LayoutType | null) => void;
}

export default function FormatPicker({ format, onSelect, onHover }: FormatPickerProps) {
  return (
    <div data-format-picker>
      {BOARD_FORMAT_GROUPS.map((group) => (
        <div key={group.label}>
          <div className="mb-2.5 mt-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
            {group.label}
          </div>
          <div className="grid grid-cols-6 gap-2.5 max-[1180px]:grid-cols-3 max-[520px]:grid-cols-2">
            {group.formats.map((item) => {
              const count = templatesForLayout(item.id)?.templates.length ?? 0;
              const selected = format === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-format-tile={item.id}
                  aria-pressed={selected}
                  onClick={() => onSelect(item.id)}
                  onMouseEnter={() => onHover(item.id)}
                  onMouseLeave={() => onHover(null)}
                  className={`relative flex flex-col gap-1.5 rounded-xl border bg-white p-2.5 pb-3 text-left transition hover:-translate-y-px ${
                    selected
                      ? 'border-blue-600 ring-[3px] ring-blue-100'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <svg
                    className="aspect-[5/3] w-full rounded-lg bg-slate-100"
                    viewBox="0 0 122 72"
                    aria-hidden="true"
                    dangerouslySetInnerHTML={{ __html: MINI[item.id] ?? '' }}
                  />
                  {selected ? (
                    <span className="absolute left-[15px] top-[15px] flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white">
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                  ) : null}
                  {count > 0 ? (
                    <span className="absolute right-3.5 top-3.5 rounded-full border border-slate-200 bg-white px-1.5 font-mono text-[10.5px] text-slate-500">
                      {count}
                    </span>
                  ) : null}
                  <span className="mt-0.5 text-sm font-semibold text-slate-900">{item.name}</span>
                  {item.tag ? (
                    <span className="inline-flex items-center gap-1 self-start rounded-full bg-blue-50 px-1.5 py-px text-[10.5px] font-semibold text-blue-600">
                      <Sparkles className="h-3 w-3" />
                      {item.tag}
                    </span>
                  ) : null}
                  <span className="text-xs leading-[1.35] text-slate-500">{item.description}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
