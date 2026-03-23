// Drag and Drop utilities for Kanban Canvas
// Using @dnd-kit library

import type { Active, Over } from '@dnd-kit/core';

export type DragType = 'card' | 'column' | 'row' | 'group';

export interface DragData {
  type: DragType;
  id: string;
  columnId?: string;
  rowId?: string;
  order?: number;
}

export interface DropData {
  type: DragType;
  id: string;
  columnId?: string;
  rowId?: string;
  order?: number;
  groupKey?: string;
  groupBy?: string;
}

/**
 * Extract drag data from active drag item
 */
export function getDragData(active: Active | null): DragData | null {
  if (!active?.data?.current) return null;
  return active.data.current as DragData;
}

/**
 * Extract drop data from over item
 */
export function getDropData(over: Over | null): DropData | null {
  if (!over?.data?.current) return null;
  return over.data.current as DropData;
}

/**
 * Check if card can be dropped in target column
 */
export function canDropCard(
  dragData: DragData,
  dropData: DropData,
  columnLimit?: number,
  currentCardCount?: number
): boolean {
  // Can only drop cards
  if (dragData.type !== 'card') return false;

  // Can drop on columns or other cards
  if (dropData.type !== 'column' && dropData.type !== 'card' && dropData.type !== 'group') return false;

  // Check column limit
  if (columnLimit && currentCardCount !== undefined) {
    // If moving within same column, limit is not affected
    if (dragData.columnId === dropData.columnId) return true;
    // If moving to different column, check if limit would be exceeded
    if (currentCardCount >= columnLimit) return false;
  }

  return true;
}

/**
 * Calculate new order for card based on drop position
 */
export function calculateNewCardOrder(
  draggedCardId: string,
  targetCardId: string | null,
  cardsInColumn: Array<{ id: string; order: number }>,
  position: 'before' | 'after' = 'after'
): number {
  // If no target card, place at end
  if (!targetCardId) {
    const maxOrder = Math.max(...cardsInColumn.map((c) => c.order || 0), 0);
    return maxOrder + 1;
  }

  const targetCard = cardsInColumn.find((c) => c.id === targetCardId);
  if (!targetCard) return cardsInColumn.length;

  const sortedCards = [...cardsInColumn].sort((a, b) => (a.order || 0) - (b.order || 0));
  const targetIndex = sortedCards.findIndex((c) => c.id === targetCardId);

  if (position === 'before') {
    // Place before target
    if (targetIndex === 0) {
      return (targetCard.order || 0) - 1;
    }
    const prevCard = sortedCards[targetIndex - 1];
    return ((prevCard.order || 0) + (targetCard.order || 0)) / 2;
  } else {
    // Place after target
    if (targetIndex === sortedCards.length - 1) {
      return (targetCard.order || 0) + 1;
    }
    const nextCard = sortedCards[targetIndex + 1];
    return ((targetCard.order || 0) + (nextCard.order || 0)) / 2;
  }
}

/**
 * Calculate new order for column based on drop position
 */
export function calculateNewColumnOrder(
  draggedColumnId: string,
  targetColumnId: string,
  columns: Array<{ id: string; order: number }>,
  position: 'before' | 'after' = 'after'
): number {
  const targetColumn = columns.find((c) => c.id === targetColumnId);
  if (!targetColumn) return columns.length;

  const sortedColumns = [...columns].sort((a, b) => (a.order || 0) - (b.order || 0));
  const targetIndex = sortedColumns.findIndex((c) => c.id === targetColumnId);

  if (position === 'before') {
    if (targetIndex === 0) {
      return (targetColumn.order || 0) - 1;
    }
    const prevColumn = sortedColumns[targetIndex - 1];
    return ((prevColumn.order || 0) + (targetColumn.order || 0)) / 2;
  } else {
    if (targetIndex === sortedColumns.length - 1) {
      return (targetColumn.order || 0) + 1;
    }
    const nextColumn = sortedColumns[targetIndex + 1];
    return ((targetColumn.order || 0) + (nextColumn.order || 0)) / 2;
  }
}

/**
 * Normalize orders to prevent fractional accumulation
 * Call this periodically to reset orders to sequential integers
 */
export function normalizeOrders<T extends { id: string; order?: number }>(
  items: T[]
): T[] {
  const sorted = [...items].sort((a, b) => (a.order || 0) - (b.order || 0));
  return sorted.map((item, index) => ({
    ...item,
    order: index + 1,
  }));
}
