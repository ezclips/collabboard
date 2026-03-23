'use client';

import { memo, useMemo } from 'react';
import type { CardGroupBy, Column as ColumnType, Card as CardType, User } from '@/types/kanban-canvas';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { ChevronLeft, ChevronRight, Plus, MoreVertical } from 'lucide-react';
import { DraggableCard } from './DraggableCard';
import { normalizeColumnLabel } from './labels';
import { useKanbanI18n } from './useKanbanI18n';

interface ColumnProps {
  column: ColumnType;
  cards: CardType[];
  rowId?: string;
  users?: User[];
  groupBy?: CardGroupBy;
  isCollapsed?: boolean;
  variant?: 'full' | 'header-only' | 'body-only';
  hideAddButton?: boolean;
  onToggleCollapse?: () => void;
  onAddCard?: () => void;
  onCardClick?: (card: CardType) => void;
  onCardMenuClick?: (card: CardType, e: React.MouseEvent) => void;
  onColumnMenuClick?: (e: React.MouseEvent) => void;
  selectedCardIds?: string[];
  readonly?: boolean;
  visibleCount?: number;
  onShowMore?: () => void;
  cardsLoaded?: boolean;
  cardsLoading?: boolean;
  onLoadCards?: () => void;
  cardRenderer?: (props: {
    card: CardType;
    users: User[];
    onClick?: () => void;
    onMenuClick?: (e: React.MouseEvent) => void;
    isSelected?: boolean;
    readonly?: boolean;
  }) => React.ReactNode;
}

interface GroupSection {
  key: string;
  label: string;
  cards: CardType[];
}

function GroupDroppableSection({
  section,
  groupBy,
  columnId,
  rowId,
  users,
  selectedCardIds,
  readonly,
  onCardClick,
  onCardMenuClick,
  cardRenderer,
}: {
  section: GroupSection;
  groupBy: CardGroupBy;
  columnId: string;
  rowId?: string;
  users: User[];
  selectedCardIds: string[];
  readonly: boolean;
  onCardClick?: (card: CardType) => void;
  onCardMenuClick?: (card: CardType, e: React.MouseEvent) => void;
  cardRenderer?: ColumnProps['cardRenderer'];
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${rowId ? `${columnId}::${rowId}` : columnId}::group::${section.key}`,
    data: {
      type: 'group',
      id: `${rowId ? `${columnId}::${rowId}` : columnId}::group::${section.key}`,
      columnId,
      rowId,
      groupKey: section.key,
      groupBy,
    },
  });

  return (
    <div ref={setNodeRef} className={`kanban-card-group-section ${isOver ? 'drag-over' : ''}`}>
      {groupBy !== 'none' && (
        <div className="kanban-card-group-header">
          <span className="kanban-card-group-label">{section.label}</span>
          <span className="kanban-card-group-count">{section.cards.length}</span>
        </div>
      )}
      {section.cards.map((card) => (
        <DraggableCard
          key={card.id}
          card={card}
          users={users}
          onClick={() => onCardClick?.(card)}
          onMenuClick={(e) => onCardMenuClick?.(card, e)}
          isSelected={selectedCardIds.includes(card.id)}
          readonly={readonly}
          cardRenderer={cardRenderer}
        />
      ))}
    </div>
  );
}

export const Column = memo(function Column({
  column,
  cards,
  rowId,
  users = [],
  groupBy = 'none',
  isCollapsed = false,
  variant = 'full',
  hideAddButton = false,
  onToggleCollapse,
  onAddCard,
  onCardClick,
  onCardMenuClick,
  onColumnMenuClick,
  selectedCardIds = [],
  readonly = false,
  visibleCount,
  onShowMore,
  cardsLoaded = true,
  cardsLoading = false,
  onLoadCards,
  cardRenderer,
}: ColumnProps) {
  const { t } = useKanbanI18n();
  const cardCount = cards.length;
  const renderCount = typeof visibleCount === 'number' ? visibleCount : cardCount;
  const visibleCards = cards.slice(0, renderCount);
  const hiddenCount = Math.max(0, cardCount - visibleCards.length);
  const hasLimit =
    typeof column.limit === 'number' &&
    Number.isFinite(column.limit) &&
    column.limit > 0;
  const isLimitReached = hasLimit && cardCount >= (column.limit as number);

  // Make column droppable
  const droppableId = rowId ? `${column.id}::${rowId}` : column.id;
  const { setNodeRef, isOver } = useDroppable({
    id: droppableId,
    data: {
      type: 'column',
      id: droppableId,
      columnId: column.id,
      rowId,
    },
  });

  const cardIds = visibleCards.map((card) => card.id);
  const groupedSections = useMemo<GroupSection[]>(() => {
    if (groupBy === 'none') {
      return [{ key: 'all', label: '', cards: visibleCards }];
    }

    const userLabelById = new Map(users.map((u) => [u.id, u.label]));
    const sections = new Map<string, { key: string; label: string; cards: CardType[] }>();

    const getSection = (key: string, label: string) => {
      const existing = sections.get(key);
      if (existing) return existing;
      const created = { key, label, cards: [] as CardType[] };
      sections.set(key, created);
      return created;
    };

    visibleCards.forEach((card) => {
      let key = 'none';
      let label = t('noGroup');

      if (groupBy === 'assignee') {
        const assigneeId = card.assigned?.[0];
        if (assigneeId) {
          key = `assignee:${assigneeId}`;
          label = userLabelById.get(assigneeId) || assigneeId;
        } else {
          key = 'assignee:none';
          label = t('unassigned');
        }
      } else if (groupBy === 'priority') {
        const priority = card.priority || 'none';
        key = `priority:${priority}`;
        label = priority === 'none'
          ? t('noGroup')
          : priority.charAt(0).toUpperCase() + priority.slice(1);
      } else if (groupBy === 'project') {
        const projectId = card.projectId?.trim();
        if (projectId) {
          key = `project:${projectId}`;
          label = projectId;
        } else {
          key = 'project:none';
          label = t('noGroup');
        }
      } else if (groupBy === 'status') {
        const status = card.status?.trim();
        if (status) {
          key = `status:${status}`;
          label = status;
        } else {
          key = 'status:none';
          label = t('noGroup');
        }
      }

      getSection(key, label).cards.push(card);
    });

    return Array.from(sections.values());
  }, [groupBy, t, users, visibleCards]);
  const showHeader = variant !== 'body-only';
  const showBody = variant !== 'header-only';
  const showMenuButton = !readonly && variant !== 'body-only' && !!onColumnMenuClick;
  const showAddButton = !readonly && variant !== 'body-only' && !hideAddButton;

  return (
    <div
      className={`kanban-column ${isCollapsed ? 'collapsed' : ''} ${isOver ? 'drag-over' : ''}`}
    >
      {showHeader && (
        <div className="kanban-column-header">
          <button
            className="kanban-column-collapse-btn"
            onClick={onToggleCollapse}
            aria-label={isCollapsed ? t('expandColumn') : t('collapseColumn')}
          >
            {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>

          {!isCollapsed && (
            <>
              <div className="kanban-column-title-wrap">
                <span className="kanban-column-title">{normalizeColumnLabel(column.label)}</span>
                <span className="kanban-column-count" aria-label={t('cardCount', { count: cardCount })}>
                  {cardCount}
                </span>
                {hasLimit && (
                  <span className="kanban-column-limit" aria-label={t('columnLimit', { limit: String(column.limit) })}>
                    / {column.limit}
                  </span>
                )}
              </div>

              {showMenuButton && (
                <button
                  className="kanban-column-menu-btn"
                  onClick={onColumnMenuClick}
                  aria-label={t('columnMenu')}
                >
                  <MoreVertical size={16} />
                </button>
              )}
            </>
          )}
        </div>
      )}

      {showAddButton && !isCollapsed && (
        <div className="kanban-column-quick-add">
          <button
            className="kanban-column-add-btn"
            onClick={onAddCard}
            disabled={!!isLimitReached}
            aria-label={t('addCardToColumn')}
            title={isLimitReached ? t('columnLimitReached') : t('addCard')}
          >
            <Plus size={18} />
          </button>
        </div>
      )}

      {showBody && !isCollapsed && (
        <div className="kanban-column-cards" ref={setNodeRef}>
          {!cardsLoaded ? (
            <div className="kanban-column-empty">
              <p>{cardsLoading ? t('loadingCards') : t('cardsNotLoaded')}</p>
              {!cardsLoading && onLoadCards && (
                <button onClick={onLoadCards} className="kanban-column-empty-btn">
                  {t('loadCards')}
                </button>
              )}
            </div>
          ) : (
            <>
              <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
                {groupedSections.map((section) => (
                  <GroupDroppableSection
                    key={section.key}
                    section={section}
                    groupBy={groupBy}
                    columnId={column.id}
                    rowId={rowId}
                    users={users}
                    selectedCardIds={selectedCardIds}
                    readonly={readonly}
                    onCardClick={onCardClick}
                    onCardMenuClick={onCardMenuClick}
                    cardRenderer={cardRenderer}
                  />
                ))}
              </SortableContext>

              {hiddenCount > 0 && (
                <button
                  type="button"
                  className="kanban-column-show-more-btn"
                  onClick={onShowMore}
                >
                  {t('showMoreRemaining', { count: hiddenCount })}
                </button>
              )}

              {visibleCards.length === 0 && (
                <div className="kanban-column-empty">
                  <p>{t('noCards')}</p>
                  {onAddCard && (
                    <button onClick={onAddCard} className="kanban-column-empty-btn">
                      {t('addFirstCard')}
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
});
