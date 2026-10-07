'use client';

import React, { useEffect, useState } from 'react';
import type { LayoutType } from '@/types/collabboard';
import type { BoardTemplate } from '@/lib/domain/canvas/boardTemplates';
import { BOARD_TEMPLATE_GROUPS, templatesForLayout } from '@/lib/collabboard/templates/registry';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { formatById } from './formatCatalog';

const TOTAL_TEMPLATES = BOARD_TEMPLATE_GROUPS.reduce(
  (total, group) => total + group.templates.length,
  0,
);

export interface TemplateGalleryModalProps {
  open: boolean;
  onClose: () => void;
  format: LayoutType;
  onUse: (template: BoardTemplate) => void;
}

export default function TemplateGalleryModal({
  open,
  onClose,
  format,
  onUse,
}: TemplateGalleryModalProps) {
  const [filter, setFilter] = useState<string>('all');
  const [detailId, setDetailId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const group = templatesForLayout(format);
    setFilter(group && group.templates.length > 0 ? format : 'all');
    setDetailId(null);
  }, [open, format]);

  const navItems = [
    { id: 'all', label: 'All templates', count: TOTAL_TEMPLATES },
    ...BOARD_TEMPLATE_GROUPS.filter((group) => group.templates.length > 0).map((group) => ({
      id: group.layout as string,
      label: formatById(group.layout)?.name ?? group.layout,
      count: group.templates.length,
    })),
  ];

  const shown = BOARD_TEMPLATE_GROUPS.filter(
    (group) => filter === 'all' || group.layout === filter,
  ).flatMap((group) => group.templates.map((template) => ({ template, layout: group.layout })));

  const detail = detailId
    ? BOARD_TEMPLATE_GROUPS.flatMap((group) => group.templates).find(
        (template) => template.id === detailId,
      ) ?? null
    : null;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent
        data-template-gallery
        className="z-[4150] flex flex-col gap-0 overflow-hidden p-0"
        style={{ width: 'min(1240px, calc(100vw - 32px))', maxWidth: 'none', height: 'calc(100vh - 32px)' }}
      >
        <DialogHeader className="flex flex-row items-center gap-3 border-b border-slate-200 px-5 py-4 text-left">
          {detail ? (
            <button
              type="button"
              data-back-to-templates
              aria-label="Back to templates"
              onClick={() => setDetailId(null)}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              <ArrowLeft className="h-[18px] w-[18px]" />
            </button>
          ) : null}
          <DialogTitle className="text-[17px] font-semibold text-slate-900">
            {detail ? detail.name : 'Templates'}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {detail
              ? `Details for the ${detail.name} template.`
              : 'Browse and choose a finished board template.'}
          </DialogDescription>
        </DialogHeader>

        {detail ? (
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_320px] max-[860px]:grid-cols-1 max-[860px]:overflow-auto">
            <div className="flex items-start justify-center overflow-auto bg-slate-100 p-5">
              {detail.previewUrl ? (
                <img
                  src={detail.previewUrl}
                  alt={`Preview of ${detail.name}`}
                  className="max-w-full rounded-[10px] border border-slate-200 bg-white shadow"
                />
              ) : null}
            </div>
            <div className="flex flex-col gap-3 overflow-auto border-l border-slate-200 p-5 max-[860px]:border-l-0 max-[860px]:border-t">
              <span className="inline-flex self-start rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-600">
                {formatById(detail.layout)?.name ?? detail.layout} board
              </span>
              <h4 className="text-[22px] font-semibold tracking-[-.01em] text-slate-900">{detail.name}</h4>
              <div className="text-slate-500">{detail.summary}</div>
              <div className="text-[13px] font-semibold text-slate-700">What&apos;s on the board</div>
              <ul className="list-disc pl-5 text-slate-500">
                {(detail.contents ?? []).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <div className="text-xs text-slate-400">
                Photos from Pexels, clipart from Iconify. Everything stays editable.
              </div>
              <div className="mt-auto flex flex-col gap-2">
                <Button
                  variant="outline"
                  data-use-template={detail.id}
                  onClick={() => {
                    onUse(detail);
                    onClose();
                  }}
                >
                  Use this template
                </Button>
                <Button
                  variant="outline"
                  data-back-to-templates
                  onClick={() => setDetailId(null)}
                >
                  Back to templates
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)] max-[760px]:grid-cols-1">
            <nav
              className="overflow-auto border-r border-slate-200 bg-slate-50 p-3.5 max-[760px]:flex max-[760px]:border-r-0 max-[760px]:border-b"
              aria-label="Formats"
            >
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-gallery-filter={item.id}
                  aria-selected={filter === item.id}
                  onClick={() => setFilter(item.id)}
                  className={`flex w-full items-center justify-between gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium ${
                    filter === item.id
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  <span>{item.label}</span>
                  <span className="font-mono text-[11px] text-slate-400">{item.count}</span>
                </button>
              ))}
            </nav>
            <div className="overflow-auto p-5">
              <div
                className="grid gap-[18px]"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}
              >
                {shown.map(({ template, layout }) => (
                  <button
                    key={template.id}
                    type="button"
                    data-gallery-card={template.id}
                    onClick={() => setDetailId(template.id)}
                    className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow"
                  >
                    <div
                      className="aspect-[16/10] w-full border-b border-slate-200 bg-slate-100 bg-cover bg-top"
                      style={template.previewUrl ? { backgroundImage: `url(${template.previewUrl})` } : undefined}
                    />
                    <div className="flex flex-col gap-0.5 p-3.5">
                      <span className="text-[15px] font-semibold text-slate-900">{template.name}</span>
                      <span className="text-[13px] text-slate-500">{template.summary}</span>
                      <span className="mt-1.5 inline-flex self-start rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                        {formatById(layout)?.name ?? layout}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
