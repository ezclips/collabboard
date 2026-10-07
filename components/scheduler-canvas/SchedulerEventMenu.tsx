'use client';

import React, { useLayoutEffect, useRef, useState } from 'react';

const MENU_MARGIN = 8;

type SchedulerEventMenuProps = {
  x: number;
  y: number;
  canRevert: boolean;
  onClose: () => void;
  onSetDuration: (minutes: number) => void;
  onSplitInHalf: () => void;
  onTrimToHalf: () => void;
  onRevertTimeSetting: () => void;
  onDuplicateEvent: () => void;
  onDeleteEvent: () => void;
  onChangeColor: (color: string) => void;
};

function Item({ label, onClick, danger = false }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      className={`scheduler-event-menu-item${danger ? ' scheduler-event-menu-item-danger' : ''}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function SchedulerEventMenu(props: SchedulerEventMenuProps) {
  const {
    x,
    y,
    canRevert,
    onClose,
    onSetDuration,
    onSplitInHalf,
    onTrimToHalf,
    onRevertTimeSetting,
    onDuplicateEvent,
    onDeleteEvent,
    onChangeColor,
  } = props;

  // PATCH-311 Addendum 1. The menu opens at the cursor with no bound, so an
  // event near the bottom of the screen pushes its lower items off screen.
  // Measure after render and clamp it fully inside the window.
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ left: x, top: y });
  const [clampHeight, setClampHeight] = useState(false);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    const element = menuRef.current;
    if (!element) return;
    const { width, height } = element.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const maxLeft = Math.max(MENU_MARGIN, viewportWidth - MENU_MARGIN - width);
    const maxTop = Math.max(MENU_MARGIN, viewportHeight - MENU_MARGIN - height);
    setPosition({
      left: Math.min(Math.max(x, MENU_MARGIN), maxLeft),
      top: Math.min(Math.max(y, MENU_MARGIN), maxTop),
    });
    setClampHeight(height > viewportHeight - MENU_MARGIN * 2);
  }, [x, y]);

  return (
    <>
      <button type="button" className="scheduler-event-menu-backdrop" onClick={onClose} aria-label="Close event menu" />
      <div
        ref={menuRef}
        className="scheduler-event-menu"
        style={{
          left: position.left,
          top: position.top,
          ...(clampHeight ? { maxHeight: 'calc(100vh - 16px)', overflow: 'auto' } : {}),
        }}
        role="menu"
      >
        <Item label="Set 15 minutes" onClick={() => onSetDuration(15)} />
        <Item label="Set 30 minutes" onClick={() => onSetDuration(30)} />
        <Item label="Set 45 minutes" onClick={() => onSetDuration(45)} />
        <Item label="Set 60 minutes" onClick={() => onSetDuration(60)} />
        <div className="scheduler-event-menu-separator" />
        <Item label="Split" onClick={onSplitInHalf} />
        <Item label="Trim to half" onClick={onTrimToHalf} />
        {canRevert ? <Item label="Revert time setting" onClick={onRevertTimeSetting} /> : null}
        <Item label="Duplicate event" onClick={onDuplicateEvent} />
        <div className="scheduler-event-menu-separator" />
        <div className="scheduler-event-menu-colors">
          {['#ffffff', '#f87171', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa'].map((color) => (
            <button
              key={color}
              type="button"
              className="scheduler-event-menu-color"
              style={{ backgroundColor: color }}
              onClick={() => onChangeColor(color)}
              aria-label={`Set color ${color}`}
              title={color}
            />
          ))}
          <input
            type="color"
            className="scheduler-event-menu-color-input"
            aria-label="Pick custom color"
            onChange={(event) => onChangeColor(event.target.value)}
          />
        </div>
        <div className="scheduler-event-menu-separator" />
        <Item label="Delete event" onClick={onDeleteEvent} danger />
      </div>
    </>
  );
}
