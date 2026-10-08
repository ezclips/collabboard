'use client';

// PATCH-325. The card Editor and its Escape-to-close shortcut, owned by a
// component that can be rendered wherever the active card must be edited.
//
// WHY IT IS SEPARATE FROM KanbanCanvas. A Board AI citation or "Save as card"
// opens a card through `actions.setActiveCard`, but if the Kanban view is hidden
// nothing renders the editor. The host is the one place that draws it, so the
// Kanban view and the split can each mount it exactly once without forking the
// editor or its shortcut.

import { useEffect, useMemo } from 'react';
import { useKanbanData, useKanbanPersistence, useKanbanUI, useKanbanReadonly } from './store';
import { Editor } from './Editor';

export function KanbanCardEditorHost() {
  const data = useKanbanData();
  const actions = useKanbanPersistence();
  const ui = useKanbanUI();
  const readonly = useKanbanReadonly();

  const activeCard = useMemo(
    () => data.cards.find((card) => card.id === ui.activeCardId) || null,
    [data.cards, ui.activeCardId],
  );

  // Escape closes the editor. It lives here rather than in KanbanCanvas so it
  // follows the editor: while the Kanban view is hidden the shortcut must still
  // work.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && ui.activeCardId) {
        actions.setActiveCard(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [actions, ui.activeCardId]);

  if (!ui.activeCardId) return null;

  return (
    <Editor
      card={activeCard}
      onClose={() => actions.setActiveCard(null)}
      readonly={readonly}
    />
  );
}
