'use client';

import React, { memo, useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import type { Card as CardType, Column as ColumnType, ColumnGroup as ColumnGroupType, Row as RowType, User } from '@/types/kanban-canvas';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import { Column } from './Column';
import { Card } from './Card';
import { useKanbanPersistence, useKanbanUI, useKanbanData } from './store';
import { ContextMenu } from './ContextMenu';
import { useCardMenu } from './CardMenu';
import { useColumnMenu } from './ColumnMenu';
import { useRowMenu } from './RowMenu';
import { useGroupMenu } from './GroupMenu';
import { getDragData, getDropData, calculateNewCardOrder } from './dnd';
import { normalizeRowLabel } from './labels';
import { useKanbanModals } from './useKanbanModals';
import { InputModal } from './InputModal';
import { ConfirmModal } from './ConfirmModal';
import { useKanbanI18n } from './useKanbanI18n';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface BoardProps {
  cards: CardType[];
  columns: ColumnType[];
  rows: RowType[];
  users?: User[];
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

export const Board = memo(function Board({ cards, columns, rows, users = [], readonly = false, cardRenderer }: BoardProps) {
  const actions = useKanbanPersistence();
  const ui = useKanbanUI();
  const data = useKanbanData();
  const modals = useKanbanModals();
  const { t } = useKanbanI18n();
  const PAGE_SIZE = 50;

  // Auto-create first row when columns exist but rows don't
  useEffect(() => {
    if (readonly) return;
    if (columns.length > 0 && rows.length === 0) {
      const firstRow: RowType = {
        id: crypto.randomUUID(),
        label: t('row'),
        order: 0,
      };
      actions.addRow(firstRow);
    }
  }, [columns.length, rows.length, actions, readonly]);

  // Auto-migrate unassigned cards to the first row
  useEffect(() => {
    if (readonly) return;
    if (rows.length > 0) {
      const unassignedCards = cards.filter((card) => !card.rowId);
      if (unassignedCards.length > 0) {
        const sorted = [...rows].sort((a, b) => (a.order || 0) - (b.order || 0));
        const firstRowId = sorted[0]?.id;
        if (firstRowId) {
          unassignedCards.forEach((card) => {
            actions.updateCard(card.id, { rowId: firstRowId });
          });
        }
      }
    }
  }, [rows, cards, actions, readonly]);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    type: 'card' | 'column' | 'row' | 'group';
    item: CardType | ColumnType | RowType | ColumnGroupType;
    position: { x: number; y: number };
  } | null>(null);

  // Drag and drop state
  const [activeId, setActiveId] = useState<string | null>(null);
  const [visibleCardsByCell, setVisibleCardsByCell] = useState<Record<string, number>>({});
  const [loadedColumns, setLoadedColumns] = useState<Set<string>>(new Set());
  const [loadingColumns, setLoadingColumns] = useState<Set<string>>(new Set());
  const hasRunInitialLoadRef = useRef(false);

  // Configure sensors for drag detection
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 15, // Match other canvases drag threshold
      },
    })
  );

  // Sort columns by order
  const sortedColumns = useMemo(
    () => [...columns].sort((a, b) => (a.order || 0) - (b.order || 0)),
    [columns]
  );

  const sortedColumnGroups = useMemo(
    () => [...(data.columnGroups || [])].sort((a, b) => (a.order || 0) - (b.order || 0)),
    [data.columnGroups]
  );

  const orderedColumns = useMemo(() => {
    if (!sortedColumnGroups.length) return sortedColumns;
    const byGroup = new Map<string, ColumnType[]>();
    const ungrouped: ColumnType[] = [];

    sortedColumns.forEach((column) => {
      if (column.groupId) {
        const current = byGroup.get(column.groupId) || [];
        current.push(column);
        byGroup.set(column.groupId, current);
      } else {
        ungrouped.push(column);
      }
    });

    const flattened: ColumnType[] = [];
    sortedColumnGroups.forEach((group) => {
      const groupColumns = byGroup.get(group.id) || [];
      flattened.push(...groupColumns);
    });
    flattened.push(...ungrouped);
    return flattened;
  }, [sortedColumns, sortedColumnGroups]);

  const collapsedGroupIds = useMemo(
    () => new Set(sortedColumnGroups.filter((group) => group.collapsed).map((group) => group.id)),
    [sortedColumnGroups]
  );

  const visibleColumns = useMemo(
    () => orderedColumns.filter((column) => !column.groupId || !collapsedGroupIds.has(column.groupId)),
    [orderedColumns, collapsedGroupIds]
  );

  // Sort rows by order
  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => (a.order || 0) - (b.order || 0)),
    [rows]
  );

  // Filter and sort cards by search query and sort settings
  const filteredCards = useMemo(() => {
    let filtered = [...cards];

    // Search filter
    if (ui.searchQuery) {
      const query = ui.searchQuery.toLowerCase();
      filtered = filtered.filter(
        (card) =>
          card.label.toLowerCase().includes(query) ||
          card.description?.toLowerCase().includes(query)
      );
    }

    if (ui.groupBy !== 'none' && ui.groupFilter) {
      if (ui.groupBy === 'assignee') {
        filtered = filtered.filter((card) =>
          ui.groupFilter === '__none__'
            ? !(card.assigned?.[0])
            : (card.assigned?.[0] || '') === ui.groupFilter
        );
      } else if (ui.groupBy === 'priority') {
        filtered = filtered.filter((card) =>
          ui.groupFilter === '__none__'
            ? !card.priority
            : (card.priority || '') === ui.groupFilter
        );
      } else if (ui.groupBy === 'project') {
        filtered = filtered.filter((card) =>
          ui.groupFilter === '__none__'
            ? !(card.projectId?.trim())
            : (card.projectId?.trim() || '') === ui.groupFilter
        );
      } else if (ui.groupBy === 'status') {
        filtered = filtered.filter((card) =>
          ui.groupFilter === '__none__'
            ? !(card.status?.trim())
            : (card.status?.trim() || '') === ui.groupFilter
        );
      }
    }

    // Sort
    if (ui.sortBy) {
      filtered.sort((a, b) => {
        const aVal = a[ui.sortBy as keyof CardType];
        const bVal = b[ui.sortBy as keyof CardType];

        if (aVal === undefined || bVal === undefined) return 0;
        if (aVal < bVal) return ui.sortOrder === 'asc' ? -1 : 1;
        if (aVal > bVal) return ui.sortOrder === 'asc' ? 1 : -1;
        return 0;
      });
    } else {
      // Default sort by order
      filtered.sort((a, b) => (a.order || 0) - (b.order || 0));
    }

    return filtered;
  }, [cards, ui.searchQuery, ui.groupBy, ui.groupFilter, ui.sortBy, ui.sortOrder]);

  // Get cards for a specific column (and optionally row)
  const getCardsForCell = (columnId: string, rowId?: string) => {
    return filteredCards.filter((card) => {
      if (card.columnId !== columnId) return false;
      if (rowId && card.rowId !== rowId) return false;
      if (!rowId && rows.length > 0 && card.rowId) return false; // If we have rows, only show cards without rowId in no-row view
      return true;
    });
  };

  const getCardsForColumn = (columnId: string) =>
    filteredCards.filter((card) => card.columnId === columnId);

  const isColumnLoaded = (columnId: string) => loadedColumns.has(columnId);
  const isColumnLoading = (columnId: string) => loadingColumns.has(columnId);

  const ensureColumnLoaded = useCallback(async (columnId: string) => {
    if (loadedColumns.has(columnId) || loadingColumns.has(columnId)) {
      return { ok: true };
    }

    setLoadingColumns((prev) => new Set(prev).add(columnId));
    const result = await actions.loadCardsForColumn(columnId);
    setLoadingColumns((prev) => {
      const next = new Set(prev);
      next.delete(columnId);
      return next;
    });

    if (result?.ok) {
      setLoadedColumns((prev) => new Set(prev).add(columnId));
      return { ok: true };
    }

    return { ok: false, message: result?.message || 'Failed to load cards.' };
  }, [actions, loadedColumns, loadingColumns]);

  // Load all cards for all columns on initial mount
  useEffect(() => {
    if (hasRunInitialLoadRef.current) return; // Only run once
    if (visibleColumns.length === 0) return; // Wait for columns to be loaded

    const loadParallel = async () => {
      hasRunInitialLoadRef.current = true;

      // Load all columns in parallel now that store is race-safe
      await Promise.all(
        visibleColumns.map((column) => ensureColumnLoaded(column.id))
      );
    };

    void loadParallel();
  }, [visibleColumns, ensureColumnLoaded]); // Trigger when columns become available

  const groupStats = useMemo(() => {
    const byGroup = new Map<string, number>();
    sortedColumns.forEach((column) => {
      if (!column.groupId) return;
      byGroup.set(column.groupId, (byGroup.get(column.groupId) || 0) + 1);
    });
    const ungroupedCount = sortedColumns.filter((column) => !column.groupId).length;
    return { byGroup, ungroupedCount };
  }, [sortedColumns]);

  const getCellKey = (columnId: string, rowId?: string) =>
    rowId ? `${columnId}::${rowId}` : columnId;

  const getVisibleCountForCell = (columnId: string, rowId?: string) => {
    const key = getCellKey(columnId, rowId);
    return visibleCardsByCell[key] ?? PAGE_SIZE;
  };

  const handleShowMore = (columnId: string, rowId?: string) => {
    const key = getCellKey(columnId, rowId);
    setVisibleCardsByCell((prev) => ({
      ...prev,
      [key]: (prev[key] ?? PAGE_SIZE) + PAGE_SIZE,
    }));
  };

  const handleToggleColumnCollapsed = async (columnId: string) => {
    const wasCollapsed = ui.collapsedColumns.has(columnId);
    actions.toggleColumnCollapsed(columnId);
    if (wasCollapsed) {
      await ensureColumnLoaded(columnId);
    }
  };

  const handleAddCard = async (columnId: string, rowId?: string) => {
    if (readonly) return;
    // Use provided rowId, or default to first row if rows exist
    const defaultRowId = rowId ?? (rows.length > 0 ? sortedRows[0]?.id : undefined);

    const newCard: CardType = {
      id: crypto.randomUUID(),
      label: t('newCard'),
      columnId,
      rowId: defaultRowId,
      order: getCardsForCell(columnId, defaultRowId).length,
    };
    await actions.addCard(newCard);
    actions.setActiveCard(newCard.id);
  };

  const handleCardClick = (card: CardType) => {
    actions.setActiveCard(card.id);
  };

  const handleCardMenuClick = (card: CardType, e: React.MouseEvent) => {
    if (readonly) return;
    e.preventDefault();
    setContextMenu({
      type: 'card',
      item: card,
      position: { x: e.clientX, y: e.clientY },
    });
  };

  const handleColumnMenuClick = (column: ColumnType, e: React.MouseEvent) => {
    if (readonly) return;
    e.preventDefault();
    setContextMenu({
      type: 'column',
      item: column,
      position: { x: e.clientX, y: e.clientY },
    });
  };

  const handleGroupMenuClick = (group: ColumnGroupType, e: React.MouseEvent) => {
    if (readonly) return;
    e.preventDefault();
    setContextMenu({
      type: 'group',
      item: group,
      position: { x: e.clientX, y: e.clientY },
    });
  };

  const columnSections = useMemo(() => {
    if (!sortedColumnGroups.length) return [{ groupId: undefined as string | undefined, columns: visibleColumns }];
    const sections: { groupId: string | undefined; columns: ColumnType[] }[] = [];
    let currentGroupId: string | undefined = undefined;
    let currentColumns: ColumnType[] = [];

    visibleColumns.forEach((column) => {
      const gid = column.groupId || undefined;
      if (gid !== currentGroupId) {
        if (currentColumns.length > 0) {
          sections.push({ groupId: currentGroupId, columns: currentColumns });
        }
        currentGroupId = gid;
        currentColumns = [column];
      } else {
        currentColumns.push(column);
      }
    });

    if (currentColumns.length > 0) {
      sections.push({ groupId: currentGroupId, columns: currentColumns });
    }

    return sections;
  }, [visibleColumns, sortedColumnGroups]);

  const handleRowMenuClick = (row: RowType, e: React.MouseEvent) => {
    if (readonly) return;
    e.preventDefault();
    setContextMenu({
      type: 'row',
      item: row,
      position: { x: e.clientX, y: e.clientY },
    });
  };

  // Get context menu items based on type
  const cardMenuItems = useCardMenu(
    contextMenu?.type === 'card'
      ? { card: contextMenu.item as CardType, modals }
      : { card: {} as CardType, modals }
  );
  const columnMenuItems = useColumnMenu(
    contextMenu?.type === 'column'
      ? {
        column: contextMenu.item as ColumnType,
        onAddCard: () => handleAddCard((contextMenu.item as ColumnType).id),
        modals,
      }
      : {
        column: {} as ColumnType,
        modals,
      }
  );
  const rowMenuItems = useRowMenu(
    contextMenu?.type === 'row'
      ? { row: contextMenu.item as RowType, modals }
      : { row: {} as RowType, modals }
  );
  const groupMenuItems = useGroupMenu(
    contextMenu?.type === 'group'
      ? { group: contextMenu.item as ColumnGroupType, modals }
      : { group: {} as ColumnGroupType, modals }
  );

  // Drag handlers
  const handleDragStart = (event: DragStartEvent) => {
    if (readonly) return;
    setActiveId(event.active.id as string);
  };

  const handleDragOver = async (event: DragOverEvent) => {
    const dropData = getDropData(event?.over || null);
    if (!dropData) return;

    let targetColumnId: string | undefined;
    if (dropData.type === 'column') {
      targetColumnId = dropData.columnId;
    } else if (dropData.type === 'group') {
      targetColumnId = dropData.columnId;
    } else if (dropData.type === 'card') {
      targetColumnId = data.cards.find((card) => card.id === dropData.id)?.columnId;
    }

    if (targetColumnId) {
      await ensureColumnLoaded(targetColumnId);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    if (readonly) {
      setActiveId(null);
      return;
    }
    const { active, over } = event;

    if (!over || active.id === over.id) {
      setActiveId(null);
      return;
    }

    const dragData = getDragData(active);
    const dropData = getDropData(over);

    if (!dragData || !dropData) {
      setActiveId(null);
      return;
    }

    // Handle card drag
    if (dragData.type === 'card') {
      const sourceCard = data.cards.find((c) => c.id === dragData.id);
      let targetColumnId = dropData.columnId || dragData.columnId;
      let targetRowId = dropData.rowId ?? dragData.rowId;
      let groupUpdates: Partial<CardType> = {};

      // If dropped on another card, use that card's column and row
      if (dropData.type === 'card') {
        const targetCard = data.cards.find((c) => c.id === dropData.id);
        if (targetCard) {
          targetColumnId = targetCard.columnId;
          targetRowId = targetCard.rowId;
          if (ui.groupBy === 'assignee') {
            groupUpdates = { assigned: targetCard.assigned || [] };
          } else if (ui.groupBy === 'priority') {
            groupUpdates = { priority: targetCard.priority };
          } else if (ui.groupBy === 'project') {
            groupUpdates = { projectId: targetCard.projectId };
          } else if (ui.groupBy === 'status') {
            groupUpdates = { status: targetCard.status };
          }
        }
      } else if (dropData.type === 'group' && ui.groupBy !== 'none') {
        const groupKey = dropData.groupKey || '';
        if (ui.groupBy === 'assignee') {
          const assigneeId = groupKey.startsWith('assignee:') ? groupKey.slice('assignee:'.length) : '';
          groupUpdates = { assigned: assigneeId && assigneeId !== 'none' ? [assigneeId] : [] };
        } else if (ui.groupBy === 'priority') {
          const priority = groupKey.startsWith('priority:') ? groupKey.slice('priority:'.length) : '';
          groupUpdates = {
            priority: priority === 'low' || priority === 'medium' || priority === 'high'
              ? priority
              : undefined
          };
        } else if (ui.groupBy === 'project') {
          const project = groupKey.startsWith('project:') ? groupKey.slice('project:'.length) : '';
          groupUpdates = { projectId: project && project !== 'none' ? project : undefined };
        } else if (ui.groupBy === 'status') {
          const status = groupKey.startsWith('status:') ? groupKey.slice('status:'.length) : '';
          groupUpdates = { status: status && status !== 'none' ? status : undefined };
        }
      }

      // Calculate new order
      const cardsInTargetColumn = data.cards.filter(
        (c) => c.columnId === targetColumnId && c.rowId === targetRowId
      );
      const targetVisibleCount = targetColumnId
        ? getVisibleCountForCell(targetColumnId, targetRowId)
        : PAGE_SIZE;

      const newOrder =
        dropData.type === 'card'
          ? calculateNewCardOrder(
            dragData.id,
            dropData.id,
            cardsInTargetColumn.map((c) => ({ id: c.id, order: c.order || 0 }))
          )
          : cardsInTargetColumn.length > targetVisibleCount
            ? 0
            : cardsInTargetColumn.length;

      // Move card
      if (targetColumnId) {
        await actions.moveCard(dragData.id, targetColumnId, targetRowId, newOrder);
        if (Object.keys(groupUpdates).length > 0) {
          await actions.updateCard(dragData.id, groupUpdates);
        }

        if (!isColumnLoaded(targetColumnId)) {
          const loadResult = await ensureColumnLoaded(targetColumnId);
          if (!loadResult.ok && sourceCard) {
            actions.moveCard(
              dragData.id,
              sourceCard.columnId,
              sourceCard.rowId,
              sourceCard.order
            );
            toast.error(loadResult.message || 'Move reverted: failed to load target column.');
          }
        }
      }
    }

    // Handle column drag
    if (dragData.type === 'column' && dropData.type === 'column') {
      const draggedColumn = data.columns.find((c) => c.id === dragData.id);
      const targetColumn = data.columns.find((c) => c.id === dropData.id);

      if (draggedColumn && targetColumn) {
        // Simple swap orders
        const tempOrder = draggedColumn.order || 0;
        actions.moveColumn(dragData.id, targetColumn.order || 0);
        actions.moveColumn(dropData.id, tempOrder);
      }
    }

    setActiveId(null);
  };

  const handleDragCancel = () => {
    setActiveId(null);
  };

  // Get the active card for drag overlay
  const activeCard = activeId ? data.cards.find((c) => c.id === activeId) : null;

  // Render board with rows (swimlanes)
  if (rows.length > 0) {
    return (
      <>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="kanban-board has-rows">
            {sortedColumnGroups.length > 0 && (
              <div className="kanban-groups-row">
                {sortedColumnGroups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    className={`kanban-group-pill ${group.collapsed ? 'collapsed' : ''}`}
                    onClick={() => actions.toggleColumnGroupCollapsed(group.id)}
                    onContextMenu={(e) => handleGroupMenuClick(group, e)}
                    aria-label={group.collapsed ? t('expandGroup') : t('collapseGroup')}
                  >
                    {group.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    <span>{group.label || t('group')}</span>
                    <span className="kanban-group-pill-count">{groupStats.byGroup.get(group.id) || 0}</span>
                  </button>
                ))}
                {groupStats.ungroupedCount > 0 && (
                  <div className="kanban-group-pill muted">
                    <span>{t('ungrouped')}</span>
                    <span className="kanban-group-pill-count">{groupStats.ungroupedCount}</span>
                  </div>
                )}
              </div>
            )}

            <div className="kanban-header-row">
              <div className="kanban-row-header-spacer" />
              <div className="kanban-columns-headers">
                {columnSections.map((section, sectionIndex) => (
                  <React.Fragment key={section.groupId || 'ungrouped'}>
                    {sectionIndex > 0 && <div className="kanban-group-separator" />}
                    {section.columns.map((column) => (
                      <Column
                        key={column.id}
                        column={column}
                        groupBy={ui.groupBy}
                        cards={getCardsForColumn(column.id)}
                        users={users}
                        variant="header-only"
                        isCollapsed={ui.collapsedColumns.has(column.id)}
                        onToggleCollapse={() => handleToggleColumnCollapsed(column.id)}
                        onAddCard={!readonly ? () => handleAddCard(column.id) : undefined}
                        onColumnMenuClick={!readonly ? (e) => handleColumnMenuClick(column, e) : undefined}
                        selectedCardIds={ui.selectedCardIds}
                        readonly={readonly}
                        visibleCount={getVisibleCountForCell(column.id)}
                        onShowMore={() => handleShowMore(column.id)}
                        cardsLoaded={isColumnLoaded(column.id)}
                        cardsLoading={isColumnLoading(column.id)}
                        onLoadCards={() => ensureColumnLoaded(column.id)}
                        cardRenderer={cardRenderer}
                      />
                    ))}
                  </React.Fragment>
                ))}
              </div>
            </div>

            {sortedRows.map((row) => (
              <div key={row.id} className={`kanban-row ${ui.collapsedRows.has(row.id) ? 'collapsed' : ''}`}>
                <div className="kanban-row-header">
                  <button
                    className="kanban-row-collapse-btn"
                    onClick={() => actions.toggleRowCollapsed(row.id)}
                  >
                    {ui.collapsedRows.has(row.id) ? '▶' : '▼'}
                  </button>
                  <div className="kanban-row-title">{normalizeRowLabel(row.label)}</div>
                  {!readonly && (
                    <button
                      className="kanban-row-menu-btn"
                      onClick={(e) => handleRowMenuClick(row, e)}
                      aria-label={t('rowMenu')}
                    >
                      ⋮
                    </button>
                  )}
                </div>

                {!ui.collapsedRows.has(row.id) && (
                  <div className="kanban-columns kanban-columns-body">
                    {columnSections.map((section, sectionIndex) => (
                      <React.Fragment key={section.groupId || 'ungrouped'}>
                        {sectionIndex > 0 && <div className="kanban-group-separator" />}
                        {section.columns.map((column) => (
                          <Column
                            key={column.id}
                            column={column}
                            groupBy={ui.groupBy}
                            rowId={row.id}
                            cards={getCardsForCell(column.id, row.id)}
                            users={users}
                            variant="body-only"
                            isCollapsed={ui.collapsedColumns.has(column.id)}
                            onToggleCollapse={() => handleToggleColumnCollapsed(column.id)}
                            onAddCard={!readonly ? () => handleAddCard(column.id, row.id) : undefined}
                            onCardClick={handleCardClick}
                            onCardMenuClick={!readonly ? handleCardMenuClick : undefined}
                            selectedCardIds={ui.selectedCardIds}
                            readonly={readonly}
                            visibleCount={getVisibleCountForCell(column.id, row.id)}
                            onShowMore={() => handleShowMore(column.id, row.id)}
                            cardsLoaded={isColumnLoaded(column.id)}
                            cardsLoading={isColumnLoading(column.id)}
                            onLoadCards={() => ensureColumnLoaded(column.id)}
                            cardRenderer={cardRenderer}
                          />
                        ))}
                      </React.Fragment>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Cards without row assignment */}
            {cards.some((card) => !card.rowId) && (
              <div className="kanban-row">
                <div className="kanban-row-header">
                  <div className="kanban-row-title">{t('unassigned')}</div>
                </div>
                <div className="kanban-columns kanban-columns-body">
                  {columnSections.map((section, sectionIndex) => (
                    <React.Fragment key={section.groupId || 'ungrouped'}>
                      {sectionIndex > 0 && <div className="kanban-group-separator" />}
                      {section.columns.map((column) => (
                        <Column
                          key={column.id}
                          column={column}
                          groupBy={ui.groupBy}
                          cards={getCardsForCell(column.id)}
                          users={users}
                          variant="body-only"
                          isCollapsed={ui.collapsedColumns.has(column.id)}
                          onToggleCollapse={() => handleToggleColumnCollapsed(column.id)}
                          onAddCard={!readonly ? () => handleAddCard(column.id) : undefined}
                          onCardClick={handleCardClick}
                          onCardMenuClick={!readonly ? handleCardMenuClick : undefined}
                          selectedCardIds={ui.selectedCardIds}
                          readonly={readonly}
                          visibleCount={getVisibleCountForCell(column.id)}
                          onShowMore={() => handleShowMore(column.id)}
                          cardsLoaded={isColumnLoaded(column.id)}
                          cardsLoading={isColumnLoading(column.id)}
                          onLoadCards={() => ensureColumnLoaded(column.id)}
                          cardRenderer={cardRenderer}
                        />
                      ))}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Context Menu */}
          {!readonly && contextMenu && (
            <ContextMenu
              items={
                contextMenu.type === 'card'
                  ? cardMenuItems
                  : contextMenu.type === 'column'
                    ? columnMenuItems
                    : contextMenu.type === 'group'
                      ? groupMenuItems
                      : rowMenuItems
              }
              position={contextMenu.position}
              onClose={() => setContextMenu(null)}
            />
          )}

          {/* Drag Overlay */}
          <DragOverlay>
            {activeCard ? <Card card={activeCard} users={users} readonly={readonly} cardRenderer={cardRenderer} /> : null}
          </DragOverlay>
        </DndContext>

        {/* Modals */}
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
        <ConfirmModal
          isOpen={modals.confirmModal.isOpen}
          onClose={modals.closeConfirmModal}
          onConfirm={modals.confirmModal.onConfirm}
          title={modals.confirmModal.title}
          message={modals.confirmModal.message}
          confirmText={modals.confirmModal.confirmText}
          confirmClass={modals.confirmModal.confirmClass}
        />
      </>
    );
  }

  // Render board without rows (simple columns)
  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="kanban-board has-rows">
          {sortedColumnGroups.length > 0 && (
            <div className="kanban-groups-row">
              {sortedColumnGroups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  className={`kanban-group-pill ${group.collapsed ? 'collapsed' : ''}`}
                  onClick={() => actions.toggleColumnGroupCollapsed(group.id)}
                  onContextMenu={(e) => handleGroupMenuClick(group, e)}
                  aria-label={group.collapsed ? t('expandGroup') : t('collapseGroup')}
                >
                  {group.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  <span>{group.label || t('group')}</span>
                  <span className="kanban-group-pill-count">{groupStats.byGroup.get(group.id) || 0}</span>
                </button>
              ))}
              {groupStats.ungroupedCount > 0 && (
                <div className="kanban-group-pill muted">
                  <span>{t('ungrouped')}</span>
                  <span className="kanban-group-pill-count">{groupStats.ungroupedCount}</span>
                </div>
              )}
            </div>
          )}

          {/* Global Header Row */}
          <div className="kanban-header-row">
            {/* No spacer needed when there are no row headers */}
            <div className="kanban-columns-headers">
              {columnSections.map((section, sectionIndex) => (
                <React.Fragment key={section.groupId || 'ungrouped'}>
                  {sectionIndex > 0 && <div className="kanban-group-separator" />}
                  {section.columns.map((column) => (
                    <Column
                      key={column.id}
                      column={column}
                      groupBy={ui.groupBy}
                      cards={getCardsForColumn(column.id)}
                      users={users}
                      variant="header-only"
                      isCollapsed={ui.collapsedColumns.has(column.id)}
                      onToggleCollapse={() => handleToggleColumnCollapsed(column.id)}
                      onAddCard={!readonly ? () => handleAddCard(column.id) : undefined}
                      onColumnMenuClick={!readonly ? (e) => handleColumnMenuClick(column, e) : undefined}
                      selectedCardIds={ui.selectedCardIds}
                      readonly={readonly}
                      visibleCount={getVisibleCountForCell(column.id)}
                      onShowMore={() => handleShowMore(column.id)}
                      cardsLoaded={isColumnLoaded(column.id)}
                      cardsLoading={isColumnLoading(column.id)}
                      onLoadCards={() => ensureColumnLoaded(column.id)}
                      cardRenderer={cardRenderer}
                    />
                  ))}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Body */}
          <div className="kanban-columns kanban-columns-body">
            {columnSections.map((section, sectionIndex) => (
              <React.Fragment key={section.groupId || 'ungrouped'}>
                {sectionIndex > 0 && <div className="kanban-group-separator" />}
                {section.columns.map((column) => (
                  <Column
                    key={column.id}
                    column={column}
                    groupBy={ui.groupBy}
                    cards={getCardsForCell(column.id)}
                    users={users}
                    variant="body-only"
                    isCollapsed={ui.collapsedColumns.has(column.id)}
                    onToggleCollapse={() => handleToggleColumnCollapsed(column.id)}
                    onAddCard={!readonly ? () => handleAddCard(column.id) : undefined}
                    onCardClick={handleCardClick}
                    onCardMenuClick={!readonly ? handleCardMenuClick : undefined}
                    onColumnMenuClick={!readonly ? (e) => handleColumnMenuClick(column, e) : undefined}
                    selectedCardIds={ui.selectedCardIds}
                    readonly={readonly}
                    visibleCount={getVisibleCountForCell(column.id)}
                    onShowMore={() => handleShowMore(column.id)}
                    cardsLoaded={isColumnLoaded(column.id)}
                    cardsLoading={isColumnLoading(column.id)}
                    onLoadCards={() => ensureColumnLoaded(column.id)}
                    cardRenderer={cardRenderer}
                  />
                ))}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Context Menu */}
        {!readonly && contextMenu && (
          <ContextMenu
            items={
              contextMenu.type === 'card'
                ? cardMenuItems
                : contextMenu.type === 'column'
                  ? columnMenuItems
                  : contextMenu.type === 'group'
                    ? groupMenuItems
                    : rowMenuItems
            }
            position={contextMenu.position}
            onClose={() => setContextMenu(null)}
          />
        )}

        {/* Drag Overlay */}
        <DragOverlay>
          {activeCard ? <Card card={activeCard} users={users} readonly={readonly} cardRenderer={cardRenderer} /> : null}
        </DragOverlay>
      </DndContext>

      {/* Modals */}
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
      <ConfirmModal
        isOpen={modals.confirmModal.isOpen}
        onClose={modals.closeConfirmModal}
        onConfirm={modals.confirmModal.onConfirm}
        title={modals.confirmModal.title}
        message={modals.confirmModal.message}
        confirmText={modals.confirmModal.confirmText}
        confirmClass={modals.confirmModal.confirmClass}
      />
    </>
  );
});
