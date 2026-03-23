'use client';

import { memo, useEffect, useMemo } from 'react';
import { useKanbanData, useKanbanUI, useKanbanPersistence, useKanbanReadonly } from './store.tsx';
import { Toolbar } from './Toolbar';
import { Board } from './Board';
import { Editor } from './Editor';
import type { Card, User } from '@/types/kanban-canvas';
import { useKanbanI18n } from './useKanbanI18n';
import { useKanbanModals } from './useKanbanModals';
import { InputModal } from './InputModal';

export const KanbanCanvas = memo(function KanbanCanvas({
  canvasId: _canvasId,
  cardRenderer,
}: {
  canvasId: string;
  cardRenderer?: (props: {
    card: Card;
    users: User[];
    onClick?: () => void;
    onMenuClick?: (e: React.MouseEvent) => void;
    isSelected?: boolean;
    readonly?: boolean;
  }) => React.ReactNode;
}) {
  const data = useKanbanData();
  const actions = useKanbanPersistence();
  const ui = useKanbanUI();
  const readonly = useKanbanReadonly();
  const { t } = useKanbanI18n();
  const modals = useKanbanModals();
  void _canvasId;

  const activeCard = useMemo(
    () => data.cards.find((card) => card.id === ui.activeCardId) || null,
    [data.cards, ui.activeCardId]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Undo/Redo
      if (!readonly && (e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        actions.undo();
      } else if (
        !readonly &&
        (e.ctrlKey || e.metaKey) &&
        (e.key === 'y' || (e.key === 'z' && e.shiftKey))
      ) {
        e.preventDefault();
        actions.redo();
      }
      // Close editor with Escape
      else if (e.key === 'Escape' && ui.activeCardId) {
        actions.setActiveCard(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [actions, readonly, ui.activeCardId]);

  const handleExport = () => {
    const exportData = {
      cards: data.cards,
      columns: data.columns,
      rows: data.rows,
      links: data.links,
      users: data.users,
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kanban-export-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleAddGroup = () => {
    if (readonly) return;
    modals.showInputModal({
      title: t('addGroup'),
      initialValue: '',
      placeholder: t('groupNamePlaceholder'),
      onConfirm: (label) => {
        const trimmed = label.trim();
        if (!trimmed) return;
        actions.addColumnGroup({
          id: crypto.randomUUID(),
          label: trimmed,
          order: (data.columnGroups.length + 1) * 10,
          collapsed: false,
        });
      },
    });
  };

  return (
    <>
      <div className="kanban-page">
        <div className="kanban-toolbar-container">
          <Toolbar onExport={handleExport} onAddGroup={handleAddGroup} />
        </div>

        <div className="kanban-board-container">
          <Board
            cards={data.cards}
            columns={data.columns}
            rows={data.rows}
            users={data.users}
            readonly={readonly}
            cardRenderer={cardRenderer}
          />
        </div>
      </div>

      {/* Editor Modal */}
      {ui.activeCardId && (
        <Editor
          card={activeCard}
          onClose={() => actions.setActiveCard(null)}
          readonly={readonly}
        />
      )}

      <InputModal
        isOpen={modals.inputModal.isOpen}
        onClose={modals.closeInputModal}
        onConfirm={modals.inputModal.onConfirm}
        title={modals.inputModal.title}
        message={modals.inputModal.message}
        initialValue={modals.inputModal.initialValue}
        placeholder={modals.inputModal.placeholder}
        inputType={modals.inputModal.inputType}
      />
    </>
  );
});
