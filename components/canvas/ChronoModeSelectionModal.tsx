"use client";

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  ArrowDownUp,
  ArrowLeftRight,
  AlignVerticalJustifyCenter,
  Columns3,
} from "lucide-react";
import type { ChronoMode } from '@/types/collabboard';

interface ChronoModeSelectionModalProps {
  isOpen: boolean;
  onSelect: (mode: ChronoMode) => void;
  onClose?: () => void;
}

const MODES: {
  value: ChronoMode;
  label: string;
  description: string;
  Icon: React.ElementType;
}[] = [
  {
    value: 'vertical',
    label: 'Vertical',
    description: 'Timeline flows top to bottom with cards on the right side.',
    Icon: ArrowDownUp,
  },
  {
    value: 'horizontal',
    label: 'Horizontal',
    description: 'Timeline flows left to right, scrollable horizontally.',
    Icon: ArrowLeftRight,
  },
  {
    value: 'alternating',
    label: 'Alternating',
    description: 'Cards alternate between left and right sides of the timeline.',
    Icon: AlignVerticalJustifyCenter,
  },
  {
    value: 'horizontal-all',
    label: 'Horizontal All',
    description: 'All cards visible at once in a horizontal row.',
    Icon: Columns3,
  },
];

export default function ChronoModeSelectionModal({
  isOpen,
  onSelect,
  onClose,
}: ChronoModeSelectionModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open) onClose?.();
    }}>
      <DialogContent className="!max-w-[680px] bg-white/95 backdrop-blur-md border border-gray-200 shadow-xl">
        <DialogHeader className="p-4">
          <DialogTitle className="text-gray-900 text-xl">
            Choose Timeline Layout
          </DialogTitle>
          <DialogDescription className="text-gray-600">
            Select how your timeline should be arranged. You can change this later from the layout menu.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 p-6 pt-2">
          {MODES.map(({ value, label, description, Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => onSelect(value)}
              className="border rounded-lg p-5 space-y-3 transition-all bg-white border-gray-200 hover:border-blue-400 hover:shadow-md text-left group"
            >
              <div className="flex items-center justify-center mb-3">
                <Icon
                  size={36}
                  className="text-gray-500 group-hover:text-blue-600 transition-colors"
                />
              </div>
              <h3 className="font-semibold text-base text-gray-900 text-center">
                {label}
              </h3>
              <p className="text-sm text-gray-500 text-center leading-snug">
                {description}
              </p>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
