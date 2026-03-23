"use client";

import React from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDown, LayoutList } from "lucide-react";
import type { ChronoMode } from '@/types/collabboard';

interface TimelineHeaderBarProps {
  currentMode: ChronoMode;
  onModeChange: (mode: ChronoMode) => void;
}

const CHRONO_MODES: { value: ChronoMode; label: string }[] = [
  { value: 'vertical', label: 'Vertical' },
  { value: 'horizontal', label: 'Horizontal' },
  { value: 'alternating', label: 'Alternating' },
  { value: 'horizontal-all', label: 'Horizontal All' },
];

const MODE_LABELS: Partial<Record<ChronoMode, string>> = {
  vertical: 'Vertical',
  horizontal: 'Horizontal',
  alternating: 'Alternating',
  'horizontal-all': 'Horizontal All',
};

export default function TimelineHeaderBar({
  currentMode,
  onModeChange,
}: TimelineHeaderBarProps) {
  return (
    <div className="absolute top-2 right-2 z-30 flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="secondary"
            size="sm"
            className="flex items-center gap-1.5 shadow-sm bg-white/90 hover:bg-white border border-gray-200"
          >
            <LayoutList className="w-4 h-4" />
            Layout: {MODE_LABELS[currentMode]}
            <ChevronDown className="w-3.5 h-3.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52 bg-white border border-gray-200 shadow-lg">
          <DropdownMenuLabel className="text-xs text-gray-500">
            Timeline Layout
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {CHRONO_MODES.map(({ value, label }) => (
            <DropdownMenuItem
              key={value}
              onClick={() => onModeChange(value)}
              className={`cursor-pointer ${
                currentMode === value
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : ''
              }`}
            >
              {label}
              {currentMode === value && (
                <span className="ml-auto text-blue-500 text-xs">Active</span>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
