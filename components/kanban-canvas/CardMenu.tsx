'use client';

import { Bot } from 'lucide-react';
import type { Card } from '@/types/kanban-canvas';
import { ContextMenuItem, MenuIcons } from './ContextMenu';
import { useKanbanPersistence, useKanbanData, useKanbanReadonly } from './store.tsx';
import { useKanbanBoardAi } from './KanbanBoardAiBridge';
import type { useKanbanModals } from './useKanbanModals';
import { useKanbanI18n } from './useKanbanI18n';
import { normalizeRowLabel } from './labels';

interface CardMenuProps {
  card: Card;
  modals: ReturnType<typeof useKanbanModals>;
}

export function useCardMenu({ card, modals }: CardMenuProps): ContextMenuItem[] {
  const actions = useKanbanPersistence();
  const data = useKanbanData();
  const readonly = useKanbanReadonly();
  const boardAi = useKanbanBoardAi();
  const { t } = useKanbanI18n();

  /**
   * PATCH-323. "Ask Board AI" attaches this card and opens the drawer.
   *
   * It is not an edit: it adds an identity to a private question, which every
   * board reader may do. So it is offered wherever Board AI is reachable, and it
   * is the ONE item a read-only menu still shows.
   */
  const askBoardAiItem: ContextMenuItem | null = boardAi ? {
    id: 'ask-board-ai',
    label: 'Ask Board AI',
    icon: <Bot size={16} />,
    onClick: () => boardAi.askAboutCard({ id: card.id, title: card.label }),
  } : null;

  if (readonly) return askBoardAiItem ? [askBoardAiItem] : [];

  const items: ContextMenuItem[] = [
    {
      id: 'edit',
      label: t('editCard'),
      icon: <MenuIcons.Edit size={16} />,
      onClick: () => actions.setActiveCard(card.id),
    },
    ...(askBoardAiItem ? [askBoardAiItem] : []),
    {
      id: 'duplicate',
      label: t('duplicate'),
      icon: <MenuIcons.Copy size={16} />,
      onClick: () => actions.duplicateCard(card.id),
    },
    {
      id: 'separator-1',
      label: '',
      separator: true,
      onClick: () => {},
    },
  ];

  // Move to column submenu: grouped by row title (Row -> Column)
  if (data.columns.length > 0) {
    const sortedColumns = [...data.columns].sort((a, b) => (a.order || 0) - (b.order || 0));
    const sortedRows = [...data.rows].sort((a, b) => (a.order || 0) - (b.order || 0));
    const includeUnassignedTarget = sortedRows.length > 1;
    const moveColumnChildren: ContextMenuItem[] =
      sortedRows.length > 0
        ? [
            ...sortedRows
              .map((row) => ({
                id: `move-row-group-${row.id}`,
                label: normalizeRowLabel(row.label),
                onClick: () => {},
                children: sortedColumns
                  .filter((col) => !(col.id === card.columnId && row.id === card.rowId))
                  .map((col) => ({
                    id: `move-${row.id}-${col.id}`,
                    label: `-> ${col.label}`,
                    onClick: () => actions.moveCard(card.id, col.id, row.id),
                  })),
              }))
              .filter((entry) => (entry.children?.length || 0) > 0),
            ...(includeUnassignedTarget
              ? [
                  {
                    id: 'move-row-group-unassigned',
                    label: t('unassigned'),
                    onClick: () => {},
                    children: sortedColumns
                      .filter((col) => !(col.id === card.columnId && !card.rowId))
                      .map((col) => ({
                        id: `move-unassigned-${col.id}`,
                        label: `-> ${col.label}`,
                        onClick: () => actions.moveCard(card.id, col.id, undefined),
                      })),
                  } as ContextMenuItem,
                ]
              : []),
          ].filter((entry) => (entry.children?.length || 0) > 0)
        : sortedColumns
            .filter((col) => col.id !== card.columnId)
            .map((col) => ({
              id: `move-${col.id}`,
              label: `-> ${col.label}`,
              onClick: () => actions.moveCard(card.id, col.id, card.rowId),
            }));

    if (moveColumnChildren.length > 0) {
      items.push({
        id: 'move-label',
        label: t('moveToColumn'),
        icon: <MenuIcons.ArrowRight size={16} />,
        onClick: () => {},
        children: moveColumnChildren,
      });

      items.push({
        id: 'separator-2',
        label: '',
        separator: true,
        onClick: () => {},
      });
    }
  }

  // Add move to row options if there is somewhere to move (quick path).
  if (data.rows.length > 0) {
    const otherRows = data.rows.filter((row) => row.id !== card.rowId);
    const rowTargets: ContextMenuItem[] = [];

    if (card.rowId && data.rows.length > 1) {
      rowTargets.push({
        id: 'move-no-row',
        label: `-> ${t('noRow')}`,
        onClick: () => actions.moveCard(card.id, card.columnId, undefined),
      });
    }

    otherRows.forEach((row) => {
      rowTargets.push({
        id: `move-row-${row.id}`,
        label: `-> ${normalizeRowLabel(row.label)}`,
        onClick: () => actions.moveCard(card.id, card.columnId, row.id),
      });
    });

    // Only show the label (and its separator) when at least one target exists.
    if (rowTargets.length > 0) {
      items.push({
        id: 'move-row-label',
        label: t('moveToRow'),
        icon: <MenuIcons.ArrowRight size={16} />,
        onClick: () => {},
      });

      items.push(...rowTargets);

      items.push({
        id: 'separator-3',
        label: '',
        separator: true,
        onClick: () => {},
      });
    }
  }

  items.push({
    id: 'delete',
    label: t('deleteCard'),
    icon: <MenuIcons.Trash2 size={16} />,
    danger: true,
    onClick: () => {
      modals.showConfirmModal({
        title: t('deleteCard'),
        message: t('deleteCardMessage', { label: card.label }),
        confirmText: t('delete'),
        confirmClass: 'bg-red-600 hover:bg-red-700',
        onConfirm: () => {
          actions.deleteCard(card.id);
        },
      });
    },
  });

  return items;
}
