'use client';

import React, { useMemo, useState } from 'react';
import type { Padlet } from '@/types/collabboard';
import CardPreview from '@/components/collabboard/CardPreview';
import CardEditor from '@/components/collabboard/CardEditor';
import CardActionsToolbar from '@/components/collabboard/editors/CardActionsToolbar';
import { CardColorPanel } from '@/components/collabboard/editors/CardColorPanel';

interface ClipartCardDraftModalProps {
  isOpen: boolean;
  padlet: Padlet | null;
  onClose: () => void;
  onDiscard: () => void;
  onChange: (nextPadlet: Padlet) => void;
  onReplaceIcon: () => void;
}

export default function ClipartCardDraftModal({
  isOpen,
  padlet,
  onClose,
  onDiscard,
  onChange,
  onReplaceIcon,
}: ClipartCardDraftModalProps) {
  const [isColorPanelOpen, setIsColorPanelOpen] = useState(false);
  const [isCardViewOpen, setIsCardViewOpen] = useState(false);

  const previewPadlet = useMemo(() => {
    if (!padlet) return null;
    return {
      ...padlet,
      metadata: {
        ...(padlet.metadata || {}),
        counterType: padlet.metadata?.counterType || 'words',
      },
    };
  }, [padlet]);

  if (!isOpen || !previewPadlet) return null;

  const updateMetadata = (updates: Record<string, unknown>) => {
    onChange({
      ...previewPadlet,
      metadata: {
        ...(previewPadlet.metadata || {}),
        ...updates,
      },
    });
  };

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Save clipart card"
      />

      <div className="relative flex max-w-5xl items-start gap-4">
        <div className="pt-6">
          <CardActionsToolbar
            padlet={previewPadlet}
            isColorPickerOpen={isColorPanelOpen}
            isCardView={!!previewPadlet.metadata?.showCardView}
            onColorClick={(e) => {
              e.stopPropagation();
              setIsColorPanelOpen((prev) => !prev);
            }}
            onReplaceIcon={onReplaceIcon}
            onToggleCardView={() => {
              setIsCardViewOpen(true);
            }}
            onAddReaction={() => {}}
            onComment={() => {}}
            onDelete={onDiscard}
          />
        </div>

        <div className="relative w-[320px] rounded-[28px] bg-white p-5 shadow-2xl">
          <div>
            <div className="text-sm font-semibold text-gray-900">Clipart Card</div>
            <div className="mt-1 text-xs text-gray-500">
              Adjust the icon styling here, then place it on the canvas.
            </div>
          </div>

          <div className="mt-5">
            <div className="mx-auto w-[160px]">
              <CardPreview padlet={previewPadlet} isSelected={true} />
            </div>
          </div>

          <div className="mt-5">
            <label className="mb-2 block text-xs font-medium uppercase tracking-[0.14em] text-gray-500">
              Caption
            </label>
            <input
              value={previewPadlet.title || ''}
              onChange={(e) => onChange({ ...previewPadlet, title: e.target.value })}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500"
              placeholder="Optional caption"
            />
          </div>
        </div>

        {isColorPanelOpen ? (
          <div className="pt-6" onClick={(e) => e.stopPropagation()}>
            <CardColorPanel
              iconColor={previewPadlet.metadata?.iconBgColor}
              bgColor={previewPadlet.metadata?.backgroundColor}
              topStrip={previewPadlet.metadata?.topStripColor}
              onChangeTarget={(target, value) => {
                if (target === 'icon') updateMetadata({ iconBgColor: value });
                if (target === 'bg') updateMetadata({ backgroundColor: value });
                if (target === 'ts') updateMetadata({ topStripColor: value });
              }}
            />
          </div>
        ) : null}

        <CardEditor
          isOpen={isCardViewOpen}
          onClose={() => setIsCardViewOpen(false)}
          title={previewPadlet.title || ''}
          initialContent={previewPadlet.content || ''}
          initialMetadata={previewPadlet.metadata || {}}
          onSave={(data) => {
            onChange({
              ...previewPadlet,
              title: data.title,
              content: data.content,
              metadata: data.metadata,
            });
            setIsCardViewOpen(false);
          }}
          readOnly={false}
        />
      </div>
    </div>
  );
}
