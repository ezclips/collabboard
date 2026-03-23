'use client';

import type { Row } from '@/types/kanban-canvas';
import { ContextMenuItem, MenuIcons } from './ContextMenu';
import { useKanbanPersistence, useKanbanData, useKanbanReadonly } from './store.tsx';
import { normalizeRowLabel } from './labels';
import type { useKanbanModals } from './useKanbanModals';
import { useKanbanI18n } from './useKanbanI18n';

interface RowMenuProps {
  row: Row;
  modals: ReturnType<typeof useKanbanModals>;
}

export function useRowMenu({ row, modals }: RowMenuProps): ContextMenuItem[] {
  const actions = useKanbanPersistence();
  const data = useKanbanData();
  const readonly = useKanbanReadonly();
  const { t } = useKanbanI18n();

  if (readonly) return [];

  const sortedRows = [...data.rows].sort((a, b) => (a.order || 0) - (b.order || 0));
  const rowIndex = sortedRows.findIndex((r) => r.id === row.id);
  const canMoveUp = rowIndex > 0;
  const canMoveDown = rowIndex >= 0 && rowIndex < sortedRows.length - 1;

  const items: ContextMenuItem[] = [
    {
      id: 'rename',
      label: t('renameRow'),
      icon: <MenuIcons.Edit size={16} />,
      onClick: () => {
        modals.showInputModal({
          title: t('enterNewRowName'),
          initialValue: normalizeRowLabel(row.label),
          onConfirm: (newLabel) => {
            if (newLabel && newLabel.trim()) {
              actions.updateRow(row.id, { label: newLabel.trim() });
            }
          },
        });
      },
    },
    {
      id: 'separator-1',
      label: '',
      separator: true,
      onClick: () => {},
    },
  ];

  // Move options
  if (canMoveUp) {
    items.push({
      id: 'move-up',
      label: t('moveUp'),
      icon: <MenuIcons.ArrowUp size={16} />,
      onClick: () => {
        const newOrder = sortedRows[rowIndex - 1].order || 0;
        actions.moveRow(row.id, newOrder - 0.5);
      },
    });
  }

  if (canMoveDown) {
    items.push({
      id: 'move-down',
      label: t('moveDown'),
      icon: <MenuIcons.ArrowDown size={16} />,
      onClick: () => {
        const newOrder = sortedRows[rowIndex + 1].order || 0;
        actions.moveRow(row.id, newOrder + 0.5);
      },
    });
  }

  if (canMoveUp || canMoveDown) {
    items.push({
      id: 'separator-2',
      label: '',
      separator: true,
      onClick: () => {},
    });
  }

  // Delete option
  const cardCount = data.cards.filter((card) => card.rowId === row.id).length;
  items.push({
    id: 'delete',
    label:
      cardCount > 0
        ? t('deleteRowWithCount', { count: cardCount })
        : t('deleteRow'),
    icon: <MenuIcons.Trash2 size={16} />,
    danger: true,
    onClick: () => {
      const message =
        cardCount > 0
          ? t('deleteRowMessageWithCount', { label: normalizeRowLabel(row.label) })
          : t('deleteRowMessage', { label: normalizeRowLabel(row.label) });
      modals.showConfirmModal({
        title: t('deleteRow'),
        message,
        confirmText: t('delete'),
        confirmClass: 'bg-red-600 hover:bg-red-700',
        onConfirm: () => {
          actions.deleteRow(row.id);
        },
      });
    },
  });

  return items;
}
