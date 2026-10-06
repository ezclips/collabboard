'use client';

import React from 'react';
import type { LayoutType } from '@/types/collabboard';
import type { BoardTemplate } from '@/lib/domain/canvas/boardTemplates';
import { BOARD_TEMPLATE_GROUPS, templatesForLayout } from '@/lib/collabboard/templates/registry';
import { Plus } from 'lucide-react';
import { formatById } from './formatCatalog';

const TOTAL_TEMPLATES = BOARD_TEMPLATE_GROUPS.reduce(
  (total, group) => total + group.templates.length,
  0,
);

const FAN_POSITIONS = [
  { left: '6%', top: '22%', rotate: -5 },
  { left: '27%', top: '12%', rotate: 1 },
  { left: '48%', top: '24%', rotate: 5 },
];

export interface StartWithChooserProps {
  format: LayoutType;
  template: BoardTemplate | null;
  onChooseBlank: () => void;
  onBrowseTemplates: () => void;
}

export default function StartWithChooser({
  format,
  template,
  onChooseBlank,
  onBrowseTemplates,
}: StartWithChooserProps) {
  const formatInfo = formatById(format);
  const list = templatesForLayout(format)?.templates ?? [];
  const fan = (list.length > 0 ? list : BOARD_TEMPLATE_GROUPS.flatMap((group) => group.templates))
    .map((item) => item.previewUrl)
    .filter((url): url is string => Boolean(url))
    .slice(0, 3);

  const cardClass = 'flex flex-col overflow-hidden rounded-2xl border bg-white text-left transition';
  const selectedClass = 'border-blue-600 ring-[3px] ring-blue-100';
  const idleClass = 'border-slate-200 hover:border-slate-300 hover:shadow';

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3.5 max-[720px]:grid-cols-1">
      <button
        type="button"
        data-choose-blank
        aria-pressed={!template}
        onClick={onChooseBlank}
        className={`${cardClass} ${template ? idleClass : selectedClass}`}
      >
        <div
          className="flex h-[170px] items-center justify-center text-slate-400"
          style={{
            backgroundImage:
              'repeating-linear-gradient(0deg,transparent 0 19px,#e2e6ec 19px 20px),repeating-linear-gradient(90deg,transparent 0 19px,#e2e6ec 19px 20px)',
          }}
        >
          <Plus className="h-8 w-8" />
        </div>
        <div className="flex items-center gap-3 p-3.5">
          <div>
            <div className="font-semibold text-slate-900">Blank board</div>
            <div className="text-[12.5px] text-slate-500">Start empty and add your own posts.</div>
          </div>
        </div>
      </button>

      <button
        type="button"
        data-choose-template
        aria-pressed={Boolean(template)}
        onClick={onBrowseTemplates}
        className={`${cardClass} ${template ? selectedClass : idleClass}`}
      >
        {template ? (
          <div
            className="h-[170px] bg-slate-100 bg-cover bg-top"
            style={template.previewUrl ? { backgroundImage: `url(${template.previewUrl})` } : undefined}
          />
        ) : (
          <div className="relative h-[170px] overflow-hidden">
            {fan.map((src, index) => (
              <img
                key={src}
                src={src}
                alt=""
                className="absolute aspect-[16/10] w-[46%] rounded-lg border border-slate-200 bg-white object-cover object-top shadow"
                style={{
                  left: FAN_POSITIONS[index]?.left,
                  top: FAN_POSITIONS[index]?.top,
                  transform: `rotate(${FAN_POSITIONS[index]?.rotate ?? 0}deg)`,
                  zIndex: index === 1 ? 2 : 1,
                }}
              />
            ))}
          </div>
        )}
        <div className="flex items-center gap-3 p-3.5">
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-slate-900">
              {template ? template.name : 'From a template'}
            </div>
            <div className="text-[12.5px] text-slate-500">
              {template
                ? template.summary
                : list.length > 0
                  ? `${list.length} ${formatInfo?.name} templates · ${TOTAL_TEMPLATES} in total`
                  : `No ${formatInfo?.name} templates yet · ${TOTAL_TEMPLATES} for other formats`}
            </div>
          </div>
          <span
            data-browse-templates={template ? undefined : true}
            data-change-template={template ? true : undefined}
            className={`inline-flex h-8 items-center rounded-lg px-3 text-[13px] font-semibold ${
              template ? 'border border-slate-300 text-slate-700' : 'bg-blue-600 text-white'
            }`}
          >
            {template ? 'Change' : 'Browse templates'}
          </span>
        </div>
      </button>
    </div>
  );
}
