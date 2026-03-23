'use client';

import type { Column } from '@/types/kanban-canvas';
import { ContextMenuItem, MenuIcons } from './ContextMenu';
import { useKanbanPersistence, useKanbanData, useKanbanReadonly } from './store';
import { normalizeColumnLabel } from './labels';
import type { useKanbanModals } from './useKanbanModals';
import { useKanbanI18n } from './useKanbanI18n';

interface ColumnMenuProps {
  column: Column;
  onAddCard?: () => void;
  modals: ReturnType<typeof useKanbanModals>;
}

export function useColumnMenu({ column, onAddCard, modals }: ColumnMenuProps): ContextMenuItem[] {
  const actions = useKanbanPersistence();
  const data = useKanbanData();
  const readonly = useKanbanReadonly();
  const { t } = useKanbanI18n();

  if (readonly) return [];

  const sortedColumns = [...data.columns].sort((a, b) => (a.order || 0) - (b.order || 0));
  const columnIndex = sortedColumns.findIndex((col) => col.id === column.id);
  const canMoveLeft = columnIndex > 0;
  const canMoveRight = columnIndex >= 0 && columnIndex < sortedColumns.length - 1;

  const items: ContextMenuItem[] = [
    {
      id: 'add-card',
      label: t('addNewCard'),
      icon: <MenuIcons.Plus size={16} />,
      onClick: () => {
        onAddCard?.();
      },
    },
    {
      id: 'separator-0',
      label: '',
      separator: true,
      onClick: () => { },
    },
    {
      id: 'rename',
      label: t('renameColumn'),
      icon: <MenuIcons.Edit size={16} />,
      onClick: () => {
        modals.showInputModal({
          title: t('enterNewColumnName'),
          initialValue: normalizeColumnLabel(column.label),
          onConfirm: (newLabel) => {
            if (newLabel && newLabel.trim()) {
              actions.updateColumn(column.id, { label: newLabel.trim() });
            }
          },
        });
      },
    },
    {
      id: 'set-limit',
      label: t('setCardLimit'),
      icon: <MenuIcons.Tag size={16} />,
      onClick: () => {
        modals.showInputModal({
          title: t('setCardLimit'),
          message: t('enterCardLimit'),
          initialValue: column.limit?.toString() || '',
          inputType: 'number',
          onConfirm: (newLimit) => {
            const limitValue = newLimit.trim() === '' ? undefined : parseInt(newLimit);
            actions.updateColumn(column.id, { limit: limitValue });
          },
        });
      },
    },
    {
      id: 'separator-1',
      label: '',
      separator: true,
      onClick: () => { },
    },
  ];

  // Move options
  if (canMoveLeft) {
    items.push({
      id: 'move-left',
      label: t('moveLeft'),
      icon: <MenuIcons.ArrowLeft size={16} />,
      onClick: () => {
        const newOrder = sortedColumns[columnIndex - 1].order || 0;
        actions.moveColumn(column.id, newOrder - 0.5);
      },
    });
  }

  if (canMoveRight) {
    items.push({
      id: 'move-right',
      label: t('moveRight'),
      icon: <MenuIcons.ArrowRight size={16} />,
      onClick: () => {
        const newOrder = sortedColumns[columnIndex + 1].order || 0;
        actions.moveColumn(column.id, newOrder + 0.5);
      },
    });
  }

  if (canMoveLeft || canMoveRight) {
    items.push({
      id: 'separator-2',
      label: '',
      separator: true,
      onClick: () => { },
    });
  }

  items.push({
    id: 'move-to-group-label',
    label: t('moveToGroup'),
    icon: <MenuIcons.ArrowRight size={16} />,
    onClick: () => {},
  });

  items.push({
    id: 'move-no-group',
    label: `  → ${t('noGroup')}`,
    onClick: () => {
      actions.assignColumnToGroup(column.id, undefined);
    },
  });

  const sortedGroups = [...data.columnGroups].sort((a, b) => (a.order || 0) - (b.order || 0));
  sortedGroups.forEach((group) => {
    items.push({
      id: `move-group-${group.id}`,
      label: `  → ${group.label || t('group')}`,
      onClick: () => {
        actions.assignColumnToGroup(column.id, group.id);
      },
    });
  });

  items.push({
    id: 'separator-3',
    label: '',
    separator: true,
    onClick: () => { },
  });

  // Delete option
  const cardCount = data.cards.filter((card) => card.columnId === column.id).length;
  items.push({
    id: 'delete',
    label:
      cardCount > 0
        ? t('deleteColumnWithCount', { count: cardCount })
        : t('deleteColumn'),
    icon: <MenuIcons.Trash2 size={16} />,
    danger: true,
    onClick: () => {
      const message =
        cardCount > 0
          ? t('deleteColumnMessageWithCount', {
              label: normalizeColumnLabel(column.label),
              count: cardCount,
            })
          : t('deleteColumnMessage', { label: normalizeColumnLabel(column.label) });
      modals.showConfirmModal({
        title: t('deleteColumn'),
        message,
        confirmText: t('delete'),
        confirmClass: 'bg-red-600 hover:bg-red-700',
        onConfirm: () => {
          actions.deleteColumn(column.id);
        },
      });
    },
  });

  return items;
}
