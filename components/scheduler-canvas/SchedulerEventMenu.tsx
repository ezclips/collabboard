'use client';

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

  return (
    <>
      <button type="button" className="scheduler-event-menu-backdrop" onClick={onClose} aria-label="Close event menu" />
      <div className="scheduler-event-menu" style={{ left: x, top: y }} role="menu">
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
