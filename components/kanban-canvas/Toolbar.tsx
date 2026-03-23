'use client';

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  ArrowUpDown,
  Undo,
  Redo,
  Download,
  Columns,
  Rows,
  Layers,
} from 'lucide-react';
import { useKanbanPersistence, useKanbanUI, useKanbanHistory, useKanbanReadonly } from './store.tsx';
import type { CardGroupBy, Column, Row } from '@/types/kanban-canvas';
import { useKanbanData } from './store.tsx';
import { useKanbanI18n } from './useKanbanI18n';

interface ToolbarProps {
  onExport?: () => void;
  onAddGroup?: () => void;
}

type FilterOption = { value: string; label: string };

export const Toolbar = memo(function Toolbar({ onExport }: ToolbarProps) {
  const actions = useKanbanPersistence();
  const ui = useKanbanUI();
  const history = useKanbanHistory();
  const readonly = useKanbanReadonly();
  const data = useKanbanData();
  const { t } = useKanbanI18n();
  const [showGroupMenu, setShowGroupMenu] = useState(false);
  const groupMenuRef = useRef<HTMLDivElement>(null);

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const groupFilterOptions = useMemo<FilterOption[]>(() => {
    if (ui.groupBy === 'none') return [];

    if (ui.groupBy === 'assignee') {
      const userById = new Map(data.users.map((u) => [u.id, u.label]));
      const ids = Array.from(
        new Set(data.cards.map((card) => card.assigned?.[0]).filter(Boolean))
      ) as string[];
      const options = ids.map((id) => ({ value: id, label: userById.get(id) || id }));
      const hasNone = data.cards.some((card) => !card.assigned?.[0]);
      if (hasNone) options.unshift({ value: '__none__', label: t('unassigned') });
      return options;
    }

    if (ui.groupBy === 'priority') {
      const present = new Set(data.cards.map((card) => card.priority).filter(Boolean));
      const ordered: Array<'high' | 'medium' | 'low'> = ['high', 'medium', 'low'];
      const options = ordered
        .filter((p) => present.has(p))
        .map((p) => ({ value: p, label: t(p) }));
      const hasNone = data.cards.some((card) => !card.priority);
      if (hasNone) options.unshift({ value: '__none__' as any, label: t('noGroup') });
      return options;
    }

    if (ui.groupBy === 'project') {
      const values = Array.from(
        new Set(data.cards.map((card) => card.projectId?.trim()).filter(Boolean))
      ) as string[];
      const options = values.map((value) => ({ value, label: value }));
      const hasNone = data.cards.some((card) => !card.projectId?.trim());
      if (hasNone) options.unshift({ value: '__none__' as any, label: t('noGroup') });
      return options;
    }

    if (ui.groupBy === 'status') {
      const values = Array.from(
        new Set(data.cards.map((card) => card.status?.trim()).filter(Boolean))
      ) as string[];
      const options = values.map((value) => ({ value, label: value }));
      const hasNone = data.cards.some((card) => !card.status?.trim());
      if (hasNone) options.unshift({ value: '__none__' as any, label: t('noGroup') });
      return options;
    }

    return [];
  }, [ui.groupBy, data.cards, data.users, t]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (groupMenuRef.current && !groupMenuRef.current.contains(event.target as Node)) {
        setShowGroupMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAddColumn = () => {
    const id = crypto.randomUUID();
    const newColumn: Column = {
      id,
      label: t('column'),
      order: 100,
    };
    actions.addColumn(newColumn);
  };

  const handleAddRow = () => {
    const id = crypto.randomUUID();
    const newRow: Row = {
      id,
      label: t('row'),
      order: 100,
    };
    actions.addRow(newRow);
  };

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    if (value === 'none') {
      actions.setSort(null, 'asc');
    } else {
      actions.setSort(value, ui.sortOrder);
    }
  };

  const toggleSortOrder = () => {
    actions.setSort(ui.sortBy, ui.sortOrder === 'asc' ? 'desc' : 'asc');
  };

  const handleGroupByChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as CardGroupBy;
    actions.setGroupBy(value);
    actions.setGroupFilter(null);
    actions.setProjectFilter(null);
    actions.setStatusFilter(null);
  };

  return (
    <div className="kanban-toolbar">
      <div className="kanban-toolbar-search">
        <Search size={16} />
        <input
          type="text"
          placeholder={t('searchCards')}
          value={ui.searchQuery}
          onChange={(e) => actions.setSearchQuery(e.target.value)}
          className="kanban-toolbar-search-input"
        />
      </div>

      <div className="kanban-toolbar-spacer" />

      <div className="kanban-toolbar-sort">
        <ArrowUpDown size={16} />
        <select
          value={ui.sortBy || 'none'}
          onChange={handleSortChange}
          className="kanban-toolbar-select"
        >
          <option value="none">{t('defaultOrder')}</option>
          <option value="label">{t('name')}</option>
          <option value="priority">{t('priority')}</option>
          <option value="progress">{t('progress')}</option>
          <option value="start_date">{t('date')}</option>
        </select>
        <button
          onClick={toggleSortOrder}
          className="kanban-toolbar-btn"
          title={ui.sortOrder === 'asc' ? t('sortDescending') : t('sortAscending')}
        >
          {ui.sortOrder === 'asc' ? '↑' : '↓'}
        </button>
      </div>

      <button
        onClick={actions.undo}
        disabled={!canUndo || readonly}
        className="kanban-toolbar-btn"
        title={t('undoShortcut')}
      >
        <Undo size={16} />
      </button>

      <button
        onClick={actions.redo}
        disabled={!canRedo || readonly}
        className="kanban-toolbar-btn"
        title={t('redoShortcut')}
      >
        <Redo size={16} />
      </button>

      <div className="kanban-toolbar-sort">
        <select
          value={ui.locale || 'en'}
          onChange={(e) => actions.setLocale(e.target.value)}
          className="kanban-toolbar-select"
          aria-label={t('language')}
          title={t('language')}
        >
          <option value="en">{t('english')}</option>
          <option value="es">{t('spanish')}</option>
          <option value="fr">{t('french')}</option>
        </select>
      </div>

      {!readonly && (
        <>
          <div className="kanban-toolbar-divider" />

          <button
            onClick={handleAddColumn}
            className="kanban-toolbar-btn"
            title={t('addColumn')}
          >
            <Columns size={16} />
            <span>{t('addColumn')}</span>
          </button>

          <button
            onClick={handleAddRow}
            className="kanban-toolbar-btn"
            title={t('addRow')}
          >
            <Rows size={16} />
            <span>{t('addRow')}</span>
          </button>

          <div className="relative" ref={groupMenuRef}>
            <button
              onClick={() => setShowGroupMenu((prev) => !prev)}
              className="kanban-toolbar-btn"
              title={t('addGroup')}
            >
              <Layers size={16} />
              <span>{t('addGroup')}</span>
            </button>

            {showGroupMenu && (
              <div className="absolute right-0 mt-2 z-50 min-w-[260px] rounded-lg border border-gray-200 bg-white shadow-xl p-2">
                <div className="text-xs text-gray-500 px-1 pb-1">{t('groupByLabel')}</div>
                <select
                  value={ui.groupBy || 'none'}
                  onChange={handleGroupByChange}
                  className="kanban-toolbar-select w-full"
                  aria-label={t('groupByLabel')}
                  title={t('groupByLabel')}
                >
                  <option value="none">{t('noGrouping')}</option>
                  <option value="assignee">{t('groupByAssignee')}</option>
                  <option value="priority">{t('groupByPriority')}</option>
                  <option value="project">{t('groupByProject')}</option>
                  <option value="status">{t('groupByStatus')}</option>
                </select>

                {ui.groupBy !== 'none' && (
                  <>
                    <div className="text-xs text-gray-500 px-1 pb-1 pt-2">{t('filterBy')}</div>
                    <select
                      value={ui.groupFilter || '__all__'}
                      onChange={(e) =>
                        actions.setGroupFilter(e.target.value === '__all__' ? null : e.target.value)
                      }
                      className="kanban-toolbar-select w-full"
                      aria-label={t('filterBy')}
                      title={t('filterBy')}
                    >
                      <option value="__all__">{t('allValues')}</option>
                      {groupFilterOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {onExport && (
        <>
          <div className="kanban-toolbar-divider" />
          <button
            onClick={onExport}
            className="kanban-toolbar-btn"
            title={t('exportJson')}
          >
            <Download size={16} />
            <span>{t('export')}</span>
          </button>
        </>
      )}
    </div>
  );
});
