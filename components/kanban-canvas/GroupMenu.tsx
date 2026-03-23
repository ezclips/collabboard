'use client';

import type { ColumnGroup } from '@/types/kanban-canvas';
import { ContextMenuItem, MenuIcons } from './ContextMenu';
import { useKanbanPersistence, useKanbanData, useKanbanReadonly } from './store';
import type { useKanbanModals } from './useKanbanModals';
import { useKanbanI18n } from './useKanbanI18n';

interface GroupMenuProps {
  group: ColumnGroup;
  modals: ReturnType<typeof useKanbanModals>;
}

export function useGroupMenu({ group, modals }: GroupMenuProps): ContextMenuItem[] {
  const actions = useKanbanPersistence();
  const data = useKanbanData();
  const readonly = useKanbanReadonly();
  const { t } = useKanbanI18n();

  if (readonly) return [];

  const sortedGroups = [...data.columnGroups].sort((a, b) => (a.order || 0) - (b.order || 0));
  const groupIndex = sortedGroups.findIndex((g) => g.id === group.id);
  const canMoveLeft = groupIndex > 0;
  const canMoveRight = groupIndex >= 0 && groupIndex < sortedGroups.length - 1;

  const items: ContextMenuItem[] = [
    {
      id: 'rename-group',
      label: t('renameGroup'),
      icon: <MenuIcons.Edit size={16} />,
      onClick: () => {
        modals.showInputModal({
          title: t('enterGroupName'),
          initialValue: group.label || '',
          onConfirm: (newLabel) => {
            if (newLabel && newLabel.trim()) {
              actions.updateColumnGroup(group.id, { label: newLabel.trim() });
            }
          },
        });
      },
    },
    {
      id: 'separator-0',
      label: '',
      separator: true,
      onClick: () => {},
    },
  ];

  if (canMoveLeft) {
    items.push({
      id: 'move-left',
      label: t('moveLeft'),
      icon: <MenuIcons.ArrowLeft size={16} />,
      onClick: () => {
        const newOrder = (sortedGroups[groupIndex - 1].order || 0) - 0.5;
        actions.moveColumnGroup(group.id, newOrder);
      },
    });
  }

  if (canMoveRight) {
    items.push({
      id: 'move-right',
      label: t('moveRight'),
      icon: <MenuIcons.ArrowRight size={16} />,
      onClick: () => {
        const newOrder = (sortedGroups[groupIndex + 1].order || 0) + 0.5;
        actions.moveColumnGroup(group.id, newOrder);
      },
    });
  }

  if (canMoveLeft || canMoveRight) {
    items.push({
      id: 'separator-1',
      label: '',
      separator: true,
      onClick: () => {},
    });
  }

  items.push({
    id: 'delete-group',
    label: t('deleteGroup'),
    icon: <MenuIcons.Trash2 size={16} />,
    danger: true,
    onClick: () => {
      modals.showConfirmModal({
        title: t('deleteGroup'),
        message: t('deleteGroupMessage', { label: group.label || t('group') }),
        confirmText: t('delete'),
        confirmClass: 'bg-red-600 hover:bg-red-700',
        onConfirm: () => {
          actions.deleteColumnGroup(group.id);
        },
      });
    },
  });

  return items;
}
