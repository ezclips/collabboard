'use client';

import React from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { Clock3, RotateCcw, Scissors, SplitSquareHorizontal, Trash2, Plus } from 'lucide-react';

type SchedulerEventContextMenuProps = {
  children: React.ReactNode;
  onAddPost: () => void;
  onSetDuration: (minutes: number) => void;
  onSplitInHalf: () => void;
  onSplitIntoQuarterHours: () => void;
  onTrimToHalf: () => void;
  onRevertTimeSetting?: () => void;
  onDeleteEvent: () => void;
  onAddContainer: () => void;
  onChangeColor: (color: string) => void;
};

function MenuItem({ label, icon, onClick, className }: { label: string; icon?: React.ReactNode; onClick: () => void; className?: string }) {
  return (
    <ContextMenu.Item
      className={`group text-[13px] leading-none text-slate-700 rounded-[3px] flex items-center h-8 px-2 relative select-none outline-none data-[disabled]:text-slate-300 data-[disabled]:pointer-events-none data-[highlighted]:bg-slate-100 data-[highlighted]:text-slate-900 cursor-pointer ${className || ''}`.trim()}
      onSelect={onClick}
    >
      <span className="flex-1">{label}</span>
      {icon && <span className="ml-2 flex items-center">{icon}</span>}
    </ContextMenu.Item>
  );
}

function DurationSubmenu({ onSetDuration }: { onSetDuration: (minutes: number) => void }) {
  return (
    <ContextMenu.Sub>
      <ContextMenu.SubTrigger className="group text-[13px] leading-none text-slate-700 rounded-[3px] flex items-center h-8 px-2 relative select-none outline-none data-[highlighted]:bg-slate-100 data-[highlighted]:text-slate-900 cursor-pointer">
        <span className="flex-1">Set duration</span>
        <Clock3 size={16} />
      </ContextMenu.SubTrigger>
      <ContextMenu.Portal>
        <ContextMenu.SubContent
          className="min-w-[180px] bg-white rounded-md overflow-hidden p-1 shadow-[0px_10px_38px_-10px_rgba(22,_23,_24,_0.35),_0px_10px_20px_-15px_rgba(22,_23,_24,_0.2)]"
          style={{ zIndex: 10000 }}
        >
          <MenuItem label="15 minutes" onClick={() => onSetDuration(15)} />
          <MenuItem label="30 minutes" onClick={() => onSetDuration(30)} />
          <MenuItem label="45 minutes" onClick={() => onSetDuration(45)} />
          <MenuItem label="60 minutes" onClick={() => onSetDuration(60)} />
        </ContextMenu.SubContent>
      </ContextMenu.Portal>
    </ContextMenu.Sub>
  );
}

function SplitSubmenu({
  onSplitInHalf,
  onSplitIntoQuarterHours,
}: {
  onSplitInHalf: () => void;
  onSplitIntoQuarterHours: () => void;
}) {
  return (
    <ContextMenu.Sub>
      <ContextMenu.SubTrigger className="group text-[13px] leading-none text-slate-700 rounded-[3px] flex items-center h-8 px-2 relative select-none outline-none data-[highlighted]:bg-slate-100 data-[highlighted]:text-slate-900 cursor-pointer">
        <span className="flex-1">Split</span>
        <SplitSquareHorizontal size={16} />
      </ContextMenu.SubTrigger>
      <ContextMenu.Portal>
        <ContextMenu.SubContent
          className="min-w-[220px] bg-white rounded-md overflow-hidden p-1 shadow-[0px_10px_38px_-10px_rgba(22,_23,_24,_0.35),_0px_10px_20px_-15px_rgba(22,_23,_24,_0.2)]"
          style={{ zIndex: 10000 }}
        >
          <MenuItem label="Into 2 blocks" onClick={onSplitInHalf} />
          <MenuItem label="Into 15-minute blocks" onClick={onSplitIntoQuarterHours} />
        </ContextMenu.SubContent>
      </ContextMenu.Portal>
    </ContextMenu.Sub>
  );
}

export default function SchedulerEventContextMenu({
  children,
  onAddPost,
  onSetDuration,
  onSplitInHalf,
  onSplitIntoQuarterHours,
  onTrimToHalf,
  onRevertTimeSetting,
  onDeleteEvent,
  onAddContainer,
  onChangeColor,
}: SchedulerEventContextMenuProps) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          className="min-w-[260px] bg-white rounded-md overflow-hidden p-1 shadow-[0px_10px_38px_-10px_rgba(22,_23,_24,_0.35),_0px_10px_20px_-15px_rgba(22,_23,_24,_0.2)]"
          style={{ zIndex: 9999 }}
        >
          <MenuItem label="Add post" icon={<Plus size={16} />} onClick={onAddPost} />
          <ContextMenu.Separator className="h-[1px] bg-gray-100 m-1" />
          <DurationSubmenu onSetDuration={onSetDuration} />
          <SplitSubmenu onSplitInHalf={onSplitInHalf} onSplitIntoQuarterHours={onSplitIntoQuarterHours} />
          <MenuItem label="Trim to half" icon={<Scissors size={16} />} onClick={onTrimToHalf} />
          {onRevertTimeSetting && (
            <MenuItem label="Revert time setting" icon={<RotateCcw size={16} />} onClick={onRevertTimeSetting} />
          )}
          <MenuItem label="Add container" icon={<Plus size={16} />} onClick={onAddContainer} />
          <ContextMenu.Separator className="h-[1px] bg-gray-100 m-1" />
          <div className="flex items-center gap-1 px-2 py-1">
            {['#fff', '#f87171', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa'].map((color) => (
              <button
                key={color}
                className="w-5 h-5 rounded-full border-2 border-white shadow-sm hover:scale-110 transition-transform"
                style={{ backgroundColor: color }}
                onClick={() => onChangeColor(color)}
                title={color}
              />
            ))}
            <input
              type="color"
              aria-label="Pick color"
              className="h-5 w-6 cursor-pointer rounded border border-slate-300 bg-white p-0"
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => onChangeColor(event.target.value)}
            />
          </div>
          <ContextMenu.Separator className="h-[1px] bg-gray-100 m-1" />
          <MenuItem
            label="Delete event"
            icon={<Trash2 size={16} />}
            onClick={onDeleteEvent}
            className="text-red-600 data-[highlighted]:text-red-600 data-[highlighted]:bg-red-50"
          />
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
