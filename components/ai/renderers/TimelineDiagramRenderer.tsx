'use client';

import React from 'react';
import type { TimelineDiagramData } from '@/lib/ai/contracts';
import { themeById, themeColor } from '@/lib/ai/visualThemes';

function TimelineDiagramRenderer({ data }: { data: TimelineDiagramData }) {
  const theme = themeById(data.theme);
  return (
    <div
      data-ai-theme-background={theme.id}
      className="h-full w-full overflow-auto rounded-2xl border border-black/10 p-5 shadow-sm"
      style={{ backgroundColor: theme.background }}
    >
      <div className="space-y-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: theme.muted }}>timeline</div>
          <h2 className="mt-1 text-lg font-semibold" style={{ color: theme.title }}>{data.title}</h2>
        </div>
        <div className="space-y-4">
          {data.items.map((item, index) => {
            // PATCH-234: the marker/dot and date label carry the item's colour.
            const color = themeColor(theme, index);
            return (
              <div key={`${item.title}-${index}`} className="flex gap-3">
                <div className="mt-1 flex flex-col items-center">
                  <div
                    data-ai-timeline-dot="true"
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: color.stroke }}
                  />
                  {index < data.items.length - 1 && <div className="mt-1 h-full w-px" style={{ backgroundColor: theme.line }} />}
                </div>
                <div
                  data-ai-timeline-body="true"
                  className="mb-3 flex-1 rounded-lg px-3 py-2"
                  style={{ backgroundColor: color.fill }}
                >
                  {item.dateLabel && (
                    <div
                      data-ai-timeline-date="true"
                      className="text-[11px] font-semibold uppercase tracking-wide"
                      style={{ color: color.stroke }}
                    >
                      {item.dateLabel}
                    </div>
                  )}
                  <div data-ai-timeline-title="true" className="text-sm font-semibold" style={{ color: color.text }}>{item.title}</div>
                  {item.description && <div data-ai-timeline-description="true" className="mt-1 text-sm" style={{ color: color.detail }}>{item.description}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default React.memo(TimelineDiagramRenderer);
