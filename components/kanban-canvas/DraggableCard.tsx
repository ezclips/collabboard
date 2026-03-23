'use client';

import { memo } from 'react';
import type { Card as CardType, User } from '@/types/kanban-canvas';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card } from './Card';

interface DraggableCardProps {
  card: CardType;
  users?: User[];
  onClick?: () => void;
  onMenuClick?: (e: React.MouseEvent) => void;
  isSelected?: boolean;
  readonly?: boolean;
  cardRenderer?: (props: {
    card: CardType;
    users: User[];
    onClick?: () => void;
    onMenuClick?: (e: React.MouseEvent) => void;
    isSelected?: boolean;
    readonly?: boolean;
  }) => React.ReactNode;
}

export const DraggableCard = memo(function DraggableCard({
  card,
  users,
  onClick,
  onMenuClick,
  isSelected,
  readonly = false,
  cardRenderer,
}: DraggableCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: card.id,
    disabled: readonly,
    data: {
      type: 'card',
      id: card.id,
      card: card,
      columnId: card.columnId,
      rowId: card.rowId,
      order: card.order,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`kanban-draggable-card ${isDragging ? 'dragging' : ''}`}
      {...(!readonly ? attributes : {})}
      {...(!readonly ? listeners : {})}
    >
      <Card
        card={card}
        users={users}
        onClick={onClick}
        onMenuClick={!readonly ? onMenuClick : undefined}
        isSelected={isSelected}
        readonly={readonly}
        cardRenderer={cardRenderer}
      />
    </div>
  );
});
