'use client';

import React from 'react';
import Image from 'next/image';

import type { PhotoCardData, PhotoCardTextStyle } from '@/lib/ai/contracts';

export type PhotoCardTextField = 'kicker' | 'title' | 'caption';

interface PhotoCardRendererProps {
  data: PhotoCardData;
  // When provided together with onChange, the kicker/title/caption become
  // directly editable in place (highlight and delete, like any other text).
  // Once all three are emptied, the text block collapses on its own --
  // same "just show the image" result the plain Image post gives when it
  // has no caption, with no separate toggle needed.
  editable?: boolean;
  onChange?: (next: PhotoCardData) => void;
  // Lets the caller (the editor's own single Text style button, not a
  // second one in here) know which field to style next.
  onFocusField?: (field: PhotoCardTextField) => void;
}

// Applied directly on each text element (not just their shared wrapper) --
// a Tailwind color/size/weight class set on the element itself always wins
// over an inherited style from an ancestor, so an inline style set only on
// the ancestor is silently overridden by the element's own default classes.
function resolvePhotoCardTextStyle(style?: PhotoCardTextStyle): React.CSSProperties {
  if (!style) return {};
  const decorations: string[] = [];
  if (style.underline) decorations.push('underline');
  if (style.strikethrough) decorations.push('line-through');
  return {
    color: style.color,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    fontStyle: style.fontStyle,
    fontFamily: style.fontFamily,
    lineHeight: style.lineHeight,
    textDecoration: decorations.length ? decorations.join(' ') : undefined,
  };
}

// Background highlight and alignment apply to the whole text block (like a
// callout strip behind kicker+title+caption together), so these stay on
// the shared wrapper -- nothing on the children overrides them.
function resolvePhotoCardBlockStyle(style?: PhotoCardTextStyle): React.CSSProperties {
  if (!style) return {};
  return {
    backgroundColor: style.backgroundColor,
    textAlign: style.textAlign,
  };
}

function PhotoCardRenderer({ data, editable = false, onChange, onFocusField }: PhotoCardRendererProps) {
  const canEdit = editable && !!onChange;
  const textStyle = resolvePhotoCardTextStyle(data.textStyle);
  const blockStyle = resolvePhotoCardBlockStyle(data.textStyle);
  const kickerText = data.kicker ?? 'photo card';
  const showText = !!(kickerText.trim() || data.title.trim() || (data.caption || '').trim());

  const commitKicker = (text: string) => {
    const trimmed = text.trim();
    if (trimmed === kickerText) return;
    onChange?.({ ...data, kicker: trimmed });
  };

  const commitTitle = (text: string) => {
    const trimmed = text.trim();
    if (trimmed === data.title) return;
    onChange?.({ ...data, title: trimmed });
  };

  const commitCaption = (text: string) => {
    const trimmed = text.trim();
    if (trimmed === (data.caption || '')) return;
    onChange?.({ ...data, caption: trimmed || undefined });
  };

  return (
    <div className="group/photo-card relative h-full w-full overflow-hidden border border-black/10 bg-white shadow-sm">
      <div className="flex h-full flex-col">
        <div className="relative flex min-h-[180px] items-center justify-center bg-gray-100 p-6 text-center">
          {data.image.url ? (
            <Image
              src={data.image.url}
              alt={data.title}
              width={1200}
              height={675}
              className="max-h-[320px] w-full object-cover"
            />
          ) : (
            <div>
              <div className="text-sm font-medium text-gray-700">{data.title}</div>
              <div className="mt-1 text-xs text-gray-500">Image query: {data.image.query}</div>
            </div>
          )}
        </div>

        {showText && (
          <div className="relative space-y-2 p-4" style={blockStyle}>
            {canEdit ? (
              <div
                className="min-h-[1em] rounded text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 outline-none focus:ring-2 focus:ring-blue-300"
                style={textStyle}
                contentEditable
                suppressContentEditableWarning
                onFocus={() => onFocusField?.('kicker')}
                onBlur={(e) => commitKicker(e.currentTarget.textContent || '')}
              >
                {kickerText}
              </div>
            ) : (
              kickerText && (
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500" style={textStyle}>{kickerText}</div>
              )
            )}

            {canEdit ? (
              <h2
                className="mt-0.5 rounded text-lg font-semibold text-gray-900 outline-none focus:ring-2 focus:ring-blue-300"
                style={textStyle}
                contentEditable
                suppressContentEditableWarning
                onFocus={() => onFocusField?.('title')}
                onBlur={(e) => commitTitle(e.currentTarget.textContent || '')}
              >
                {data.title}
              </h2>
            ) : (
              <h2 className="mt-0.5 text-lg font-semibold text-gray-900" style={textStyle}>{data.title}</h2>
            )}

            {canEdit ? (
              <p
                className="min-h-[1.2em] rounded text-sm text-gray-700 outline-none focus:ring-2 focus:ring-blue-300"
                style={textStyle}
                contentEditable
                suppressContentEditableWarning
                onFocus={() => onFocusField?.('caption')}
                onBlur={(e) => commitCaption(e.currentTarget.textContent || '')}
              >
                {data.caption}
              </p>
            ) : (
              data.caption && <p className="text-sm text-gray-700" style={textStyle}>{data.caption}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default React.memo(PhotoCardRenderer);
