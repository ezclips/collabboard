'use client';

import { createContext, useContext, useReducer, useCallback, ReactNode, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { loadKanbanData, loadKanbanScaffoldData, loadKanbanCardsForColumn, saveCard, saveCardAssignees, deleteCard, saveColumn, deleteColumn, saveColumnGroup, deleteColumnGroup as deleteColumnGroupPersisted, saveSwimlane, deleteSwimlane, saveLink, deleteLink, saveComment, deleteComment as deleteCommentPersisted, saveVote, deleteVote as deleteVotePersisted, saveMemberSortPreference, saveMemberGroupByPreference, saveMemberDateFormatPreference } from '@/lib/kanban/supabaseAdapter';
import { supabaseBrowser } from '@/lib/supabase/browser';
import type {
  KanbanState,
  KanbanAction,
  CardGroupBy,
  Card,
  Column,
  ColumnGroup,
  Row,
  Link,
  Comment,
  Vote,
} from '@/types/kanban-canvas';

const supabase = supabaseBrowser();

// ============================================================================
// Initial State
// ============================================================================

const initialState: KanbanState = {
  readonly: false,
  data: {
    cards: [],
    columns: [],
    columnGroups: [],
    rows: [],
    links: [],
    users: [],
  },
  ui: {
    selectedCardIds: [],
    activeCardId: null,
    collapsedColumns: new Set(),
    collapsedRows: new Set(),
    searchQuery: '',
    sortBy: null,
    sortOrder: 'asc',
    groupBy: 'none',
    groupFilter: null,
    dateFormat: 'YYYY-MM-DD',
    projectFilter: null,
    statusFilter: null,
    locale: 'en',
  },
  history: {
    past: [],
    future: [],
  },
};

const defaultSeedCardLabels = [
  'Real-time Monitoring',
  'User Data Collection',
  'ML Framework Selection for Cat Recognition System',
  'API Development',
  'User Image Upload',
  'Hyperparameter Optimization for Enhanced Cat and Dog Recognition',
  'Test Data Preparation',
  'Image Preprocessing',
  'Dataset Preparation',
  'Data Preprocessing',
  'Database Optimization',
  'Data Quality Monitoring',
  'Audience Analysis',
  'Market Research',
  'Landing Page Creation',
  'Advertising Setup',
  'Advertising Channels',
  'Data Backup Mechanism',
  'User Feedback Analysis',
  'API Integration',
  'Model Training',
  'Pricing Strategy',
  'User Authentication',
  'Model Validation',
  'International Expansion',
  'CNN Architecture',
  'Security Testing',
  'Database Schema',
];

function parseAttachments(reference?: string): Card['attached'] {
  if (!reference) return [];
  try {
    const parsed = JSON.parse(reference);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function normalizeCardColor(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return undefined;
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) return trimmed;
  if (/^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) return `#${trimmed}`;
  return undefined;
}

function normalizeDateInput(value?: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return undefined;
  const hasExplicitTime = /[T\s]\d{2}:\d{2}/.test(trimmed);
  return hasExplicitTime ? parsed.toISOString() : parsed.toISOString().slice(0, 10);
}

function serializeAttachments(attached?: Card['attached']): string | undefined {
  if (attached === undefined) return undefined;
  try {
    return JSON.stringify(attached);
  } catch {
    return undefined;
  }
}

function mapColumnCards(
  chunk: NonNullable<Awaited<ReturnType<typeof loadKanbanCardsForColumn>>>
): Card[] {
  const assigneesByCard = chunk.assignees.reduce<Record<string, string[]>>((acc, item) => {
    if (!acc[item.card_id]) acc[item.card_id] = [];
    acc[item.card_id].push(item.user_id);
    return acc;
  }, {});

  const commentsByCard = chunk.comments.reduce<Record<string, Comment[]>>((acc, item) => {
    if (!acc[item.card_id]) acc[item.card_id] = [];
    acc[item.card_id].push({
      id: item.id,
      cardId: item.card_id,
      text: item.text,
      date: item.created_at,
      userId: item.user_id,
    });
    return acc;
  }, {});

  const votesByCard = chunk.votes.reduce<Record<string, Vote[]>>((acc, item) => {
    if (!acc[item.card_id]) acc[item.card_id] = [];
    acc[item.card_id].push({
      id: item.id,
      cardId: item.card_id,
      userId: item.user_id,
      value: item.value,
    });
    return acc;
  }, {});

  return chunk.cards.map((c) => {
    let priority: Card['priority'] = 'medium';
    if (c.priority === 1) priority = 'low';
    else if (c.priority >= 3) priority = 'high';

    return {
      ...c,
      label: c.title,
      description: c.content,
      task_type: (c as any).task_type as 'Feature' | 'Task' | 'Milestone' | undefined,
      start_date: normalizeDateInput(c.date_started),
      end_date: normalizeDateInput(c.date_due),
      color: normalizeCardColor(c.color_id || undefined),
      attached: parseAttachments(c.reference),
      progress: typeof c.score === 'number' ? c.score : 0,
      assigned: assigneesByCard[c.id] || (c.assignee_id ? [c.assignee_id] : []),
      comments: commentsByCard[c.id] || [],
      votes: votesByCard[c.id] || [],
      projectId: c.project_id,
      status: (c as any).status || undefined,
      columnId: c.column_id,
      rowId: c.swimlane_id || undefined,
      parent: (c as any).parent_id || undefined,
      order: Number(c.order_index),
      priority,
    } as Card;
  });
}

/**
 * Map raw Supabase data into the frontend KanbanState['data'] shape.
 */
function mapLoadedData(
  data: NonNullable<Awaited<ReturnType<typeof loadKanbanData>>>,
  fallbackUsers: KanbanState['data']['users']
): KanbanState['data'] {
  const assigneesByCard = data.assignees.reduce<Record<string, string[]>>((acc, item) => {
    if (!acc[item.card_id]) acc[item.card_id] = [];
    acc[item.card_id].push(item.user_id);
    return acc;
  }, {});

  const memberUsers = Array.from(
    new Map(
      (data.members || []).map((m) => {
        const label = m.display_name || m.email || m.user_id;
        return [m.user_id, { id: m.user_id, label, avatar: m.avatar_url || undefined }] as const;
      })
    ).values()
  );
  const commentsByCard = data.comments.reduce<Record<string, Comment[]>>((acc, item) => {
    if (!acc[item.card_id]) acc[item.card_id] = [];
    acc[item.card_id].push({
      id: item.id,
      cardId: item.card_id,
      text: item.text,
      date: item.created_at,
      userId: item.user_id,
    });
    return acc;
  }, {});
  const votesByCard = data.votes.reduce<Record<string, Vote[]>>((acc, item) => {
    if (!acc[item.card_id]) acc[item.card_id] = [];
    acc[item.card_id].push({
      id: item.id,
      cardId: item.card_id,
      userId: item.user_id,
      value: item.value,
    });
    return acc;
  }, {});

  return {
    cards: data.cards.map((c) => {
      let priority: Card['priority'] = 'medium';
      if (c.priority === 1) priority = 'low';
      else if (c.priority >= 3) priority = 'high';

      return {
        ...c,
        label: c.title,
        description: c.content,
        task_type: (c as any).task_type as 'Feature' | 'Task' | 'Milestone' | undefined,
        start_date: normalizeDateInput(c.date_started),
        end_date: normalizeDateInput(c.date_due),
        color: normalizeCardColor(c.color_id || undefined),
        attached: parseAttachments(c.reference),
        progress: typeof c.score === 'number' ? c.score : 0,
        assigned: assigneesByCard[c.id] || (c.assignee_id ? [c.assignee_id] : []),
        comments: commentsByCard[c.id] || [],
        votes: votesByCard[c.id] || [],
        projectId: c.project_id,
        status: (c as any).status || undefined,
        columnId: c.column_id,
        rowId: c.swimlane_id || undefined,
        parent: (c as any).parent_id || undefined,
        order: Number(c.order_index),
        priority,
      } as Card;
    }),
    columns: data.columns.map((c) => ({
      ...c,
      label: c.name,
      limit: c.task_limit,
      order: c.order_index,
      groupId: c.group_id || undefined,
    })),
    columnGroups: data.columnGroups.map((group) => ({
      ...group,
      label: group.label,
      order: group.order_index,
      collapsed: group.is_collapsed,
    })),
    rows: data.rows.map((r) => ({
      ...r,
      label: r.name,
      order: r.order_index,
    })),
    links: data.links.map((l) => ({
      id: l.id,
      masterId: l.from_card_id,
      slaveId: l.to_card_id,
      relation: l.relation,
    })),
    users: fallbackUsers.length > 0 ? fallbackUsers : memberUsers,
  };
}

// ============================================================================
// Reducer
// ============================================================================

function kanbanReducer(state: KanbanState, action: KanbanAction): KanbanState {
  // Helper: Save to history before data mutations
  const saveHistory = (newData: KanbanState['data']): KanbanState => {
    return {
      ...state,
      data: newData,
      history: {
        past: [...state.history.past, state.data],
        future: [],
      },
    };
  };

  switch (action.type) {
    case 'SET_READONLY': {
      return {
        ...state,
        readonly: action.payload,
      };
    }

    // ========================================================================
    // Card Actions
    // ========================================================================
    case 'ADD_CARD': {
      const newData = {
        ...state.data,
        cards: [...state.data.cards, action.payload],
      };
      return saveHistory(newData);
    }

    case 'SET_COLUMN_CARDS': {
      const { columnId, cards } = action.payload;
      const otherCards = state.data.cards.filter((card) => card.columnId !== columnId);
      const newData = {
        ...state.data,
        cards: [...otherCards, ...cards],
      };
      // We don't save history for initial data loading to avoid polluting the undo stack
      return {
        ...state,
        data: newData,
      };
    }

    case 'UPDATE_CARD': {
      const newData = {
        ...state.data,
        cards: state.data.cards.map((card) =>
          card.id === action.payload.id ? { ...card, ...action.payload.updates } : card
        ),
      };
      return saveHistory(newData);
    }

    case 'DELETE_CARD': {
      const newData = {
        ...state.data,
        cards: state.data.cards.filter((card) => card.id !== action.payload),
        links: state.data.links.filter(
          (link) => link.masterId !== action.payload && link.slaveId !== action.payload
        ),
      };
      return saveHistory(newData);
    }

    case 'DUPLICATE_CARD': {
      const cardToDuplicate = state.data.cards.find((c) => c.id === action.payload);
      if (!cardToDuplicate) return state;

      const newCard: Card = {
        ...cardToDuplicate,
        id: crypto.randomUUID(),
        label: `${cardToDuplicate.label} (Copy)`,
        order: (cardToDuplicate.order || 0) + 1,
      };

      const newData = {
        ...state.data,
        cards: [...state.data.cards, newCard],
      };
      return saveHistory(newData);
    }

    case 'MOVE_CARD': {
      const newData = {
        ...state.data,
        cards: state.data.cards.map((card) =>
          card.id === action.payload.id
            ? {
              ...card,
              columnId: action.payload.columnId,
              rowId: action.payload.rowId,
              order: action.payload.order ?? card.order,
            }
            : card
        ),
      };
      return saveHistory(newData);
    }

    case 'SELECT_CARD': {
      return {
        ...state,
        ui: {
          ...state.ui,
          selectedCardIds: [...state.ui.selectedCardIds, action.payload],
        },
      };
    }

    case 'UNSELECT_CARD': {
      return {
        ...state,
        ui: {
          ...state.ui,
          selectedCardIds: state.ui.selectedCardIds.filter((id) => id !== action.payload),
        },
      };
    }

    case 'CLEAR_SELECTION': {
      return {
        ...state,
        ui: {
          ...state.ui,
          selectedCardIds: [],
        },
      };
    }

    case 'SET_ACTIVE_CARD': {
      return {
        ...state,
        ui: {
          ...state.ui,
          activeCardId: action.payload,
        },
      };
    }

    // ========================================================================
    // Column Actions
    // ========================================================================
    case 'ADD_COLUMN': {
      const newData = {
        ...state.data,
        columns: [...state.data.columns, action.payload],
      };
      return saveHistory(newData);
    }

    case 'UPDATE_COLUMN': {
      const newData = {
        ...state.data,
        columns: state.data.columns.map((col) =>
          col.id === action.payload.id ? { ...col, ...action.payload.updates } : col
        ),
      };
      return saveHistory(newData);
    }

    case 'DELETE_COLUMN': {
      const newData = {
        ...state.data,
        columns: state.data.columns.filter((col) => col.id !== action.payload),
        cards: state.data.cards.filter((card) => card.columnId !== action.payload),
      };
      return saveHistory(newData);
    }

    case 'MOVE_COLUMN': {
      const newData = {
        ...state.data,
        columns: state.data.columns.map((col) =>
          col.id === action.payload.id ? { ...col, order: action.payload.order } : col
        ),
      };
      return saveHistory(newData);
    }

    case 'TOGGLE_COLUMN_COLLAPSED': {
      const newCollapsed = new Set(state.ui.collapsedColumns);
      if (newCollapsed.has(action.payload)) {
        newCollapsed.delete(action.payload);
      } else {
        newCollapsed.add(action.payload);
      }
      return {
        ...state,
        ui: {
          ...state.ui,
          collapsedColumns: newCollapsed,
        },
      };
    }

    case 'ADD_COLUMN_GROUP': {
      const newData = {
        ...state.data,
        columnGroups: [...state.data.columnGroups, action.payload],
      };
      return saveHistory(newData);
    }

    case 'UPDATE_COLUMN_GROUP': {
      const newData = {
        ...state.data,
        columnGroups: state.data.columnGroups.map((group) =>
          group.id === action.payload.id ? { ...group, ...action.payload.updates } : group
        ),
      };
      return saveHistory(newData);
    }

    case 'DELETE_COLUMN_GROUP': {
      const newData = {
        ...state.data,
        columnGroups: state.data.columnGroups.filter((group) => group.id !== action.payload),
        columns: state.data.columns.map((column) =>
          column.groupId === action.payload ? { ...column, groupId: undefined } : column
        ),
      };
      return saveHistory(newData);
    }

    case 'MOVE_COLUMN_GROUP': {
      const newData = {
        ...state.data,
        columnGroups: state.data.columnGroups.map((group) =>
          group.id === action.payload.id ? { ...group, order: action.payload.order } : group
        ),
      };
      return saveHistory(newData);
    }

    case 'TOGGLE_COLUMN_GROUP_COLLAPSED': {
      const newData = {
        ...state.data,
        columnGroups: state.data.columnGroups.map((group) =>
          group.id === action.payload ? { ...group, collapsed: !group.collapsed } : group
        ),
      };
      return saveHistory(newData);
    }

    case 'ASSIGN_COLUMN_TO_GROUP': {
      const newData = {
        ...state.data,
        columns: state.data.columns.map((column) =>
          column.id === action.payload.columnId
            ? { ...column, groupId: action.payload.groupId }
            : column
        ),
      };
      return saveHistory(newData);
    }

    // ========================================================================
    // Row Actions
    // ========================================================================
    case 'ADD_ROW': {
      const newData = {
        ...state.data,
        rows: [...state.data.rows, action.payload],
      };
      return saveHistory(newData);
    }

    case 'UPDATE_ROW': {
      const newData = {
        ...state.data,
        rows: state.data.rows.map((row) =>
          row.id === action.payload.id ? { ...row, ...action.payload.updates } : row
        ),
      };
      return saveHistory(newData);
    }

    case 'DELETE_ROW': {
      const newData = {
        ...state.data,
        rows: state.data.rows.filter((row) => row.id !== action.payload),
        cards: state.data.cards.map((card) =>
          card.rowId === action.payload ? { ...card, rowId: undefined } : card
        ),
      };
      return saveHistory(newData);
    }

    case 'MOVE_ROW': {
      const newData = {
        ...state.data,
        rows: state.data.rows.map((row) =>
          row.id === action.payload.id ? { ...row, order: action.payload.order } : row
        ),
      };
      return saveHistory(newData);
    }

    case 'TOGGLE_ROW_COLLAPSED': {
      const newCollapsed = new Set(state.ui.collapsedRows);
      if (newCollapsed.has(action.payload)) {
        newCollapsed.delete(action.payload);
      } else {
        newCollapsed.add(action.payload);
      }
      return {
        ...state,
        ui: {
          ...state.ui,
          collapsedRows: newCollapsed,
        },
      };
    }

    // ========================================================================
    // Link Actions
    // ========================================================================
    case 'ADD_LINK': {
      const newData = {
        ...state.data,
        links: [...state.data.links, action.payload],
      };
      return saveHistory(newData);
    }

    case 'DELETE_LINK': {
      const newData = {
        ...state.data,
        links: state.data.links.filter((link) => link.id !== action.payload),
      };
      return saveHistory(newData);
    }

    // ========================================================================
    // Comment Actions
    // ========================================================================
    case 'ADD_COMMENT': {
      const newData = {
        ...state.data,
        cards: state.data.cards.map((card) =>
          card.id === action.payload.cardId
            ? { ...card, comments: [...(card.comments || []), action.payload] }
            : card
        ),
      };
      return saveHistory(newData);
    }

    case 'DELETE_COMMENT': {
      const newData = {
        ...state.data,
        cards: state.data.cards.map((card) =>
          card.id === action.payload.cardId
            ? {
              ...card,
              comments: (card.comments || []).filter((c) => c.id !== action.payload.commentId),
            }
            : card
        ),
      };
      return saveHistory(newData);
    }

    // ========================================================================
    // Vote Actions
    // ========================================================================
    case 'ADD_VOTE': {
      const newData = {
        ...state.data,
        cards: state.data.cards.map((card) =>
          card.id === action.payload.cardId
            ? { ...card, votes: [...(card.votes || []), action.payload] }
            : card
        ),
      };
      return saveHistory(newData);
    }

    case 'REMOVE_VOTE': {
      const newData = {
        ...state.data,
        cards: state.data.cards.map((card) =>
          card.id === action.payload.cardId
            ? {
              ...card,
              votes: (card.votes || []).filter((v) => v.id !== action.payload.voteId),
            }
            : card
        ),
      };
      return saveHistory(newData);
    }

    // ========================================================================
    // UI Actions
    // ========================================================================
    case 'SET_SEARCH_QUERY': {
      return {
        ...state,
        ui: {
          ...state.ui,
          searchQuery: action.payload,
        },
      };
    }

    case 'SET_SORT': {
      return {
        ...state,
        ui: {
          ...state.ui,
          sortBy: action.payload.by,
          sortOrder: action.payload.order,
        },
      };
    }

    case 'SET_GROUP_BY': {
      return {
        ...state,
        ui: {
          ...state.ui,
          groupBy: action.payload,
        },
      };
    }

    case 'SET_GROUP_FILTER': {
      return {
        ...state,
        ui: {
          ...state.ui,
          groupFilter: action.payload,
        },
      };
    }

    case 'SET_DATE_FORMAT': {
      return {
        ...state,
        ui: {
          ...state.ui,
          dateFormat: action.payload,
        },
      };
    }

    case 'SET_PROJECT_FILTER': {
      return {
        ...state,
        ui: {
          ...state.ui,
          projectFilter: action.payload,
        },
      };
    }

    case 'SET_STATUS_FILTER': {
      return {
        ...state,
        ui: {
          ...state.ui,
          statusFilter: action.payload,
        },
      };
    }

    case 'SET_LOCALE': {
      return {
        ...state,
        ui: {
          ...state.ui,
          locale: action.payload,
        },
      };
    }

    // ========================================================================
    // History Actions
    // ========================================================================
    case 'UNDO': {
      if (state.history.past.length === 0) return state;

      const previous = state.history.past[state.history.past.length - 1];
      const newPast = state.history.past.slice(0, -1);

      return {
        ...state,
        data: previous,
        history: {
          past: newPast,
          future: [state.data, ...state.history.future],
        },
      };
    }

    case 'REDO': {
      if (state.history.future.length === 0) return state;

      const next = state.history.future[0];
      const newFuture = state.history.future.slice(1);

      return {
        ...state,
        data: next,
        history: {
          past: [...state.history.past, state.data],
          future: newFuture,
        },
      };
    }

    case 'RESET': {
      return {
        ...state,
        data: action.payload,
        history: {
          past: [],
          future: [],
        },
      };
    }

    default:
      return state;
  }
}

// ============================================================================
// Context
// ============================================================================

interface KanbanContextValue {
  state: KanbanState;
  dispatch: React.Dispatch<KanbanAction>;
  canvasId: string;
}

const KanbanContext = createContext<KanbanContextValue | undefined>(undefined);

// ============================================================================
// Provider
// ============================================================================

export function KanbanProvider({
  children,
  canvasId,
  initialData,
}: {
  children: ReactNode;
  canvasId: string;
  initialData?: Partial<KanbanState['data']>;
}) {
  const [state, dispatch] = useReducer(kanbanReducer, {
    ...initialState,
    data: {
      ...initialState.data,
      ...initialData,
    },
  });
  const activeCardIdRef = useRef<string | null>(null);
  const realtimeRefetchingRef = useRef(false);
  const realtimeReconcileQueuedRef = useRef(false);
  const realtimeReconcileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    activeCardIdRef.current = state.ui.activeCardId;
  }, [state.ui.activeCardId]);

  const reconcileFromServer = useCallback(async () => {
    if (realtimeRefetchingRef.current) {
      realtimeReconcileQueuedRef.current = true;
      return;
    }
    realtimeRefetchingRef.current = true;
    try {
      const fullData = await loadKanbanData(canvasId);
      if (!fullData) return;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      const currentMember = fullData.members.find((m) => m.user_id === user?.id);
      const isReadonly = currentMember?.permission_level === 'view';
      const persistedSortBy = currentMember?.sort_by || null;
      const persistedSortOrder = currentMember?.sort_order === 'desc' ? 'desc' : 'asc';
      const persistedGroupBy =
        currentMember?.group_by === 'assignee' ||
          currentMember?.group_by === 'priority' ||
          currentMember?.group_by === 'project' ||
          currentMember?.group_by === 'status' ||
          currentMember?.group_by === 'none'
          ? currentMember.group_by
          : 'none';
      const persistedDateFormat =
        currentMember?.date_format === 'MM/DD/YYYY' ||
          currentMember?.date_format === 'DD/MM/YYYY' ||
          currentMember?.date_format === 'YYYY-MM-DD'
          ? currentMember.date_format
          : 'YYYY-MM-DD';

      dispatch({ type: 'SET_READONLY', payload: isReadonly });
      dispatch({ type: 'SET_SORT', payload: { by: persistedSortBy, order: persistedSortOrder } });
      dispatch({ type: 'SET_GROUP_BY', payload: persistedGroupBy });
      dispatch({ type: 'SET_DATE_FORMAT', payload: persistedDateFormat });

      const fallbackUsers =
        initialData?.users && initialData.users.length > 0 ? initialData.users : [];
      const mappedData = mapLoadedData(fullData, fallbackUsers);
      dispatch({ type: 'RESET', payload: mappedData });

      if (
        activeCardIdRef.current &&
        !mappedData.cards.some((card) => card.id === activeCardIdRef.current)
      ) {
        activeCardIdRef.current = null;
        dispatch({ type: 'SET_ACTIVE_CARD', payload: null });
        toast.error('This card was deleted by another user.');
      }
    } finally {
      realtimeRefetchingRef.current = false;
      if (realtimeReconcileQueuedRef.current) {
        realtimeReconcileQueuedRef.current = false;
        void reconcileFromServer();
      }
    }
  }, [canvasId, initialData?.users]);

  const scheduleReconcileFromServer = useCallback(() => {
    if (realtimeReconcileTimerRef.current) {
      clearTimeout(realtimeReconcileTimerRef.current);
    }
    // Small debounce avoids transient stale reads immediately after realtime events.
    realtimeReconcileTimerRef.current = setTimeout(() => {
      realtimeReconcileTimerRef.current = null;
      void reconcileFromServer();
    }, 120);
  }, [reconcileFromServer]);

  // Load data from Supabase on mount
  useEffect(() => {
    async function init() {
      const data = await loadKanbanScaffoldData(canvasId);
      if (data) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const currentMember = data.members.find((m) => m.user_id === user?.id);
        const isReadonly = currentMember?.permission_level === 'view';
        dispatch({ type: 'SET_READONLY', payload: isReadonly });
        const persistedSortBy = currentMember?.sort_by || null;
        const persistedSortOrder = currentMember?.sort_order === 'desc' ? 'desc' : 'asc';
        const persistedGroupBy =
          currentMember?.group_by === 'assignee' ||
            currentMember?.group_by === 'priority' ||
            currentMember?.group_by === 'project' ||
            currentMember?.group_by === 'status' ||
            currentMember?.group_by === 'none'
            ? currentMember.group_by
            : 'none';
        const persistedDateFormat =
          currentMember?.date_format === 'MM/DD/YYYY' ||
            currentMember?.date_format === 'DD/MM/YYYY' ||
            currentMember?.date_format === 'YYYY-MM-DD'
            ? currentMember.date_format
            : 'YYYY-MM-DD';
        dispatch({ type: 'SET_SORT', payload: { by: persistedSortBy, order: persistedSortOrder } });
        dispatch({ type: 'SET_GROUP_BY', payload: persistedGroupBy });
        dispatch({ type: 'SET_DATE_FORMAT', payload: persistedDateFormat });

        const fallbackUsers =
          initialData?.users && initialData.users.length > 0 ? initialData.users : [];
        const mappedData = mapLoadedData(data, fallbackUsers);
        dispatch({ type: 'RESET', payload: mappedData });
      }
    }
    init();
  }, [canvasId]);

  // Realtime multi-user synchronization
  useEffect(() => {
    const channel = supabase
      .channel(`kanban-board:${canvasId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'kanban_cards', filter: `canvas_id=eq.${canvasId}` },
        (payload) => {
          if (
            payload.eventType === 'DELETE' &&
            activeCardIdRef.current &&
            (payload.old as any)?.id === activeCardIdRef.current
          ) {
            activeCardIdRef.current = null;
            dispatch({ type: 'SET_ACTIVE_CARD', payload: null });
            toast.error('This card was deleted by another user.');
          }
          scheduleReconcileFromServer();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'kanban_columns', filter: `canvas_id=eq.${canvasId}` },
        () => scheduleReconcileFromServer()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'kanban_column_groups', filter: `canvas_id=eq.${canvasId}` },
        () => scheduleReconcileFromServer()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'kanban_swimlanes', filter: `canvas_id=eq.${canvasId}` },
        () => scheduleReconcileFromServer()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'kanban_links', filter: `canvas_id=eq.${canvasId}` },
        () => scheduleReconcileFromServer()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'kanban_comments', filter: `canvas_id=eq.${canvasId}` },
        () => scheduleReconcileFromServer()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'kanban_votes', filter: `canvas_id=eq.${canvasId}` },
        () => scheduleReconcileFromServer()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'kanban_card_assignees', filter: `canvas_id=eq.${canvasId}` },
        () => scheduleReconcileFromServer()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'kanban_board_members', filter: `canvas_id=eq.${canvasId}` },
        () => scheduleReconcileFromServer()
      )
      .subscribe();

    return () => {
      if (realtimeReconcileTimerRef.current) {
        clearTimeout(realtimeReconcileTimerRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [canvasId, scheduleReconcileFromServer]);

  return (
    <KanbanContext.Provider value={{ state, dispatch, canvasId }}>
      {children}
    </KanbanContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useKanban() {
  const context = useContext(KanbanContext);
  if (!context) {
    throw new Error('useKanban must be used within KanbanProvider');
  }
  return context;
}

// ============================================================================
// Selector Hooks (for convenience)
// ============================================================================

export function useKanbanData() {
  const { state } = useKanban();
  return state.data;
}

export function useKanbanUI() {
  const { state } = useKanban();
  return state.ui;
}

export function useKanbanHistory() {
  const { state } = useKanban();
  return state.history;
}

export function useKanbanReadonly() {
  const { state } = useKanban();
  return state.readonly;
}

export function useKanbanActions() {
  const { dispatch, canvasId, state } = useKanban();

  return {
    // Card actions
    addCard: useCallback((card: Card) => dispatch({ type: 'ADD_CARD', payload: card }), [dispatch]),
    updateCard: useCallback(
      (id: string, updates: Partial<Card>) =>
        dispatch({ type: 'UPDATE_CARD', payload: { id, updates } }),
      [dispatch]
    ),
    deleteCard: useCallback((id: string) => dispatch({ type: 'DELETE_CARD', payload: id }), [dispatch]),
    duplicateCard: useCallback(
      (id: string) => dispatch({ type: 'DUPLICATE_CARD', payload: id }),
      [dispatch]
    ),
    moveCard: useCallback(
      (id: string, columnId: string, rowId?: string, order?: number) =>
        dispatch({ type: 'MOVE_CARD', payload: { id, columnId, rowId, order } }),
      [dispatch]
    ),
    selectCard: useCallback((id: string) => dispatch({ type: 'SELECT_CARD', payload: id }), [dispatch]),
    unselectCard: useCallback(
      (id: string) => dispatch({ type: 'UNSELECT_CARD', payload: id }),
      [dispatch]
    ),
    clearSelection: useCallback(() => dispatch({ type: 'CLEAR_SELECTION' }), [dispatch]),
    setActiveCard: useCallback(
      (id: string | null) => dispatch({ type: 'SET_ACTIVE_CARD', payload: id }),
      [dispatch]
    ),
    setColumnCards: useCallback(
      (columnId: string, cards: Card[]) =>
        dispatch({ type: 'SET_COLUMN_CARDS', payload: { columnId, cards } }),
      [dispatch]
    ),

    // Column actions
    addColumn: useCallback(
      (column: Column) => dispatch({ type: 'ADD_COLUMN', payload: column }),
      [dispatch]
    ),
    updateColumn: useCallback(
      (id: string, updates: Partial<Column>) =>
        dispatch({ type: 'UPDATE_COLUMN', payload: { id, updates } }),
      [dispatch]
    ),
    deleteColumn: useCallback(
      (id: string) => dispatch({ type: 'DELETE_COLUMN', payload: id }),
      [dispatch]
    ),
    moveColumn: useCallback(
      (id: string, order: number) => dispatch({ type: 'MOVE_COLUMN', payload: { id, order } }),
      [dispatch]
    ),
    toggleColumnCollapsed: useCallback(
      (id: string) => dispatch({ type: 'TOGGLE_COLUMN_COLLAPSED', payload: id }),
      [dispatch]
    ),
    addColumnGroup: useCallback(
      (group: ColumnGroup) => dispatch({ type: 'ADD_COLUMN_GROUP', payload: group }),
      [dispatch]
    ),
    updateColumnGroup: useCallback(
      (id: string, updates: Partial<ColumnGroup>) =>
        dispatch({ type: 'UPDATE_COLUMN_GROUP', payload: { id, updates } }),
      [dispatch]
    ),
    deleteColumnGroup: useCallback(
      (id: string) => dispatch({ type: 'DELETE_COLUMN_GROUP', payload: id }),
      [dispatch]
    ),
    moveColumnGroup: useCallback(
      (id: string, order: number) => dispatch({ type: 'MOVE_COLUMN_GROUP', payload: { id, order } }),
      [dispatch]
    ),
    toggleColumnGroupCollapsed: useCallback(
      (id: string) => dispatch({ type: 'TOGGLE_COLUMN_GROUP_COLLAPSED', payload: id }),
      [dispatch]
    ),
    assignColumnToGroup: useCallback(
      (columnId: string, groupId?: string) =>
        dispatch({ type: 'ASSIGN_COLUMN_TO_GROUP', payload: { columnId, groupId } }),
      [dispatch]
    ),

    // Row actions
    addRow: useCallback((row: Row) => dispatch({ type: 'ADD_ROW', payload: row }), [dispatch]),
    updateRow: useCallback(
      (id: string, updates: Partial<Row>) =>
        dispatch({ type: 'UPDATE_ROW', payload: { id, updates } }),
      [dispatch]
    ),
    deleteRow: useCallback((id: string) => dispatch({ type: 'DELETE_ROW', payload: id }), [dispatch]),
    moveRow: useCallback(
      (id: string, order: number) => dispatch({ type: 'MOVE_ROW', payload: { id, order } }),
      [dispatch]
    ),
    toggleRowCollapsed: useCallback(
      (id: string) => dispatch({ type: 'TOGGLE_ROW_COLLAPSED', payload: id }),
      [dispatch]
    ),

    // Link actions
    addLink: useCallback((link: Link) => dispatch({ type: 'ADD_LINK', payload: link }), [dispatch]),
    deleteLink: useCallback((id: string) => dispatch({ type: 'DELETE_LINK', payload: id }), [dispatch]),

    // Comment actions
    addComment: useCallback(
      (comment: Comment) => dispatch({ type: 'ADD_COMMENT', payload: comment }),
      [dispatch]
    ),
    deleteComment: useCallback(
      (cardId: string, commentId: string) =>
        dispatch({ type: 'DELETE_COMMENT', payload: { cardId, commentId } }),
      [dispatch]
    ),

    // Vote actions
    addVote: useCallback((vote: Vote) => dispatch({ type: 'ADD_VOTE', payload: vote }), [dispatch]),
    removeVote: useCallback(
      (cardId: string, voteId: string) =>
        dispatch({ type: 'REMOVE_VOTE', payload: { cardId, voteId } }),
      [dispatch]
    ),

    // UI actions
    setSearchQuery: useCallback(
      (query: string) => dispatch({ type: 'SET_SEARCH_QUERY', payload: query }),
      [dispatch]
    ),
    setSort: useCallback(
      (by: string | null, order: 'asc' | 'desc') =>
        dispatch({ type: 'SET_SORT', payload: { by, order } }),
      [dispatch]
    ),
    setGroupBy: useCallback(
      (groupBy: CardGroupBy) => dispatch({ type: 'SET_GROUP_BY', payload: groupBy }),
      [dispatch]
    ),
    setGroupFilter: useCallback(
      (groupFilter: string | null) => dispatch({ type: 'SET_GROUP_FILTER', payload: groupFilter }),
      [dispatch]
    ),
    setDateFormat: useCallback(
      (dateFormat: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD') =>
        dispatch({ type: 'SET_DATE_FORMAT', payload: dateFormat }),
      [dispatch]
    ),
    setProjectFilter: useCallback(
      (projectFilter: string | null) =>
        dispatch({ type: 'SET_PROJECT_FILTER', payload: projectFilter }),
      [dispatch]
    ),
    setStatusFilter: useCallback(
      (statusFilter: string | null) =>
        dispatch({ type: 'SET_STATUS_FILTER', payload: statusFilter }),
      [dispatch]
    ),
    setLocale: useCallback(
      (locale: string) => dispatch({ type: 'SET_LOCALE', payload: locale }),
      [dispatch]
    ),
    setReadonly: useCallback(
      (readonly: boolean) => dispatch({ type: 'SET_READONLY', payload: readonly }),
      [dispatch]
    ),

    // History actions
    undo: useCallback(() => dispatch({ type: 'UNDO' }), [dispatch]),
    redo: useCallback(() => dispatch({ type: 'REDO' }), [dispatch]),
    reset: useCallback(
      (data: KanbanState['data']) => dispatch({ type: 'RESET', payload: data }),
      [dispatch]
    ),
    canvasId,
    readonly: state.readonly,
  };
}

// Wrapper for actions that need persistence
export function useKanbanPersistence() {
  const actions = useKanbanActions();
  const { canvasId, readonly } = actions as any;
  const data = useKanbanData();

  // Debounce guard so multiple concurrent conflicts don't spam refetches
  const refetchingRef = useRef(false);

  const refetchAndReset = useCallback(async () => {
    if (refetchingRef.current) return;
    refetchingRef.current = true;
    try {
      const fresh = await loadKanbanData(canvasId);
      if (fresh) {
        const mapped = mapLoadedData(fresh, data.users);
        actions.reset(mapped);
      }
    } finally {
      refetchingRef.current = false;
    }
  }, [canvasId, data.users, actions]);

  const handleConflict = useCallback(
    (entityLabel: string) => {
      toast.error(`${entityLabel} was changed by another user. Board refreshed.`);
      refetchAndReset();
    },
    [refetchAndReset]
  );

  const getCurrentUserId = useCallback(async (): Promise<string | null> => {
    const { data: authData, error } = await supabase.auth.getUser();
    if (error || !authData?.user?.id) return null;
    return authData.user.id;
  }, []);

  const blockReadonlyMutation = useCallback(() => {
    if (!readonly) return false;
    toast.error('Read-only mode: edits are disabled.');
    return true;
  }, [readonly]);

  return {
    ...actions,
    loadCardsForColumn: async (columnId: string) => {
      const chunk = await loadKanbanCardsForColumn(canvasId, columnId);
      if (!chunk) {
        return { ok: false, message: 'Failed to load column cards.' };
      }

      const mappedCards = mapColumnCards(chunk);
      // Use atomic action to update state instead of resetting with potentially stale data
      actions.setColumnCards(columnId, mappedCards);

      return { ok: true, count: mappedCards.length };
    },
    setSort: async (by: string | null, order: 'asc' | 'desc') => {
      actions.setSort(by, order);
      const result = await saveMemberSortPreference(canvasId, by, order);
      if (!result.ok) {
        toast.error(result.message || 'Failed to save sort preference.');
      }
    },
    setGroupBy: async (groupBy: CardGroupBy) => {
      actions.setGroupBy(groupBy);
      const result = await saveMemberGroupByPreference(canvasId, groupBy);
      if (!result.ok) {
        toast.error(result.message || 'Failed to save group preference.');
      }
    },
    setDateFormat: async (dateFormat: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD') => {
      actions.setDateFormat(dateFormat);
      const result = await saveMemberDateFormatPreference(canvasId, dateFormat);
      if (!result.ok) {
        toast.error(result.message || 'Failed to save date format preference.');
      }
    },
    addCard: async (card: Card) => {
      if (blockReadonlyMutation()) return;
      actions.addCard(card);

      // Convert priority to numeric value
      let priorityNum = 2; // default medium
      if (card.priority === 'low') priorityNum = 1;
      else if (card.priority === 'high') priorityNum = 3;

      const result = await saveCard({
        id: card.id,
        canvas_id: canvasId,
        title: card.label,
        content: card.description,
        task_type: card.task_type,
        reference: serializeAttachments(card.attached),
        column_id: card.columnId,
        swimlane_id: card.rowId,
        parent_id: card.parent,
        assignee_id: card.assigned && card.assigned.length > 0 ? card.assigned[0] : undefined,
        order_index: card.order || 0,
        priority: priorityNum,
        score: card.progress || 0,
        project_id: card.projectId,
        status: card.status,
        color_id: normalizeCardColor(card.color),
        date_due: normalizeDateInput(card.end_date) || null,
        date_started: normalizeDateInput(card.start_date) || null,
        time_estimated: 0,
        time_spent: 0
      } as any, true); // isNew = true
      if (result.ok) {
        await saveCardAssignees(canvasId, card.id, card.assigned || []);
      }
    },
    duplicateCard: async (id: string) => {
      if (blockReadonlyMutation()) return;
      const source = data.cards.find((card) => card.id === id);
      if (!source) return;

      const duplicated: Card = {
        ...source,
        id: crypto.randomUUID(),
        label: `${source.label} (Copy)`,
        order: (source.order || 0) + 1,
      };

      actions.addCard(duplicated);

      let priorityNum = 2;
      if (duplicated.priority === 'low') priorityNum = 1;
      else if (duplicated.priority === 'high') priorityNum = 3;

      const result = await saveCard({
        id: duplicated.id,
        canvas_id: canvasId,
        title: duplicated.label,
        content: duplicated.description,
        reference: serializeAttachments(duplicated.attached),
        column_id: duplicated.columnId,
        swimlane_id: duplicated.rowId,
        parent_id: duplicated.parent,
        assignee_id: duplicated.assigned && duplicated.assigned.length > 0 ? duplicated.assigned[0] : undefined,
        order_index: duplicated.order || 0,
        priority: priorityNum,
        score: duplicated.progress || 0,
        project_id: duplicated.projectId,
        status: duplicated.status,
        color_id: normalizeCardColor(duplicated.color),
        date_due: normalizeDateInput(duplicated.end_date) || null,
        date_started: normalizeDateInput(duplicated.start_date) || null,
        time_estimated: 0,
        time_spent: 0
      } as any, true); // isNew = true
      if (result.ok) {
        await saveCardAssignees(canvasId, duplicated.id, duplicated.assigned || []);
      }
    },
    updateCard: async (id: string, updates: Partial<Card>) => {
      if (blockReadonlyMutation()) return;
      const currentCard = data.cards.find((card) => card.id === id) as (Card & { updated_at?: string }) | undefined;
      actions.updateCard(id, updates);

      // Build update object with only defined fields
      const dbUpdate: any = {
        id,
        canvas_id: canvasId
      };

      if (updates.label !== undefined) dbUpdate.title = updates.label;
      if (updates.description !== undefined) dbUpdate.content = updates.description;
      if (updates.attached !== undefined) dbUpdate.reference = serializeAttachments(updates.attached);
      if (updates.columnId !== undefined) dbUpdate.column_id = updates.columnId;
      if (updates.rowId !== undefined) dbUpdate.swimlane_id = updates.rowId;
      if (updates.parent !== undefined) dbUpdate.parent_id = updates.parent || null;
      if (updates.assigned !== undefined) dbUpdate.assignee_id = updates.assigned[0] || null;
      if (updates.order !== undefined) dbUpdate.order_index = updates.order;
      if (updates.color !== undefined) dbUpdate.color_id = normalizeCardColor(updates.color);
      if (updates.projectId !== undefined) dbUpdate.project_id = updates.projectId;
      if (updates.status !== undefined) dbUpdate.status = updates.status;
      if (updates.end_date !== undefined) dbUpdate.date_due = normalizeDateInput(updates.end_date) || null;
      if (updates.start_date !== undefined) dbUpdate.date_started = normalizeDateInput(updates.start_date) || null;
      if (updates.progress !== undefined) dbUpdate.score = updates.progress;
      if (updates.task_type !== undefined) dbUpdate.task_type = updates.task_type;

      // Convert priority to numeric value
      if (updates.priority !== undefined) {
        let priorityNum = 2; // default medium
        if (updates.priority === 'low') priorityNum = 1;
        else if (updates.priority === 'high') priorityNum = 3;
        dbUpdate.priority = priorityNum;
      }

      if (currentCard?.updated_at) dbUpdate.updated_at = currentCard.updated_at;
      const result = await saveCard(dbUpdate);
      if (!result.ok && result.conflict) {
        handleConflict('Card');
        return; // board will be refetched; skip stale assignee write
      }
      if (result.ok && updates.assigned !== undefined) {
        await saveCardAssignees(canvasId, id, updates.assigned || []);
      }
    },
    deleteCard: async (id: string) => {
      if (blockReadonlyMutation()) return;
      actions.deleteCard(id);
      await deleteCard(id);
    },
    moveCard: async (id: string, columnId: string, rowId?: string, order?: number) => {
      if (blockReadonlyMutation()) return;
      const currentCard = data.cards.find((card) => card.id === id) as (Card & { updated_at?: string }) | undefined;
      actions.moveCard(id, columnId, rowId, order);
      const result = await saveCard({
        id,
        canvas_id: canvasId,
        column_id: columnId,
        swimlane_id: rowId,
        order_index: order,
        updated_at: currentCard?.updated_at
      } as any);
      if (!result.ok && result.conflict) {
        handleConflict('Card');
      }
    },
    addColumn: async (column: Column) => {
      if (blockReadonlyMutation()) return;
      actions.addColumn(column);
      const result = await saveColumn({
        id: column.id,
        canvas_id: canvasId,
        name: column.label,
        order_index: column.order
      } as any, { isNew: true });
      if (!result.ok) {
        toast.error(result.message || 'Failed to create column.');
        refetchAndReset();
      }
    },
    updateColumn: async (id: string, updates: Partial<Column>) => {
      if (blockReadonlyMutation()) return;
      const currentColumn = data.columns.find((column) => column.id === id) as (Column & { updated_at?: string }) | undefined;
      actions.updateColumn(id, updates);

      const dbUpdate: any = {
        id,
        canvas_id: canvasId
      };

      if (updates.label !== undefined) dbUpdate.name = updates.label;
      if (updates.order !== undefined) dbUpdate.order_index = updates.order;
      if (updates.limit !== undefined) dbUpdate.task_limit = updates.limit;
      if (updates.collapsed !== undefined) dbUpdate.is_collapsed = updates.collapsed;
      if (updates.groupId !== undefined) dbUpdate.group_id = updates.groupId || null;

      const result = await saveColumn(dbUpdate, { expectedUpdatedAt: currentColumn?.updated_at });
      if (!result.ok && result.conflict) {
        handleConflict('Column');
      }
    },
    deleteColumn: async (id: string) => {
      if (blockReadonlyMutation()) return;
      actions.deleteColumn(id);
      await deleteColumn(id);
    },
    addColumnGroup: async (group: ColumnGroup) => {
      if (blockReadonlyMutation()) return;
      actions.addColumnGroup(group);
      const result = await saveColumnGroup({
        id: group.id,
        canvas_id: canvasId,
        label: group.label,
        order_index: group.order ?? 0,
        is_collapsed: !!group.collapsed
      }, { isNew: true });
      if (!result.ok) {
        toast.error(result.message || 'Failed to create column group.');
      }
    },
    updateColumnGroup: async (id: string, updates: Partial<ColumnGroup>) => {
      if (blockReadonlyMutation()) return;
      const currentGroup = data.columnGroups.find((group) => group.id === id) as (ColumnGroup & { updated_at?: string }) | undefined;
      actions.updateColumnGroup(id, updates);

      const result = await saveColumnGroup({
        id,
        canvas_id: canvasId,
        label: updates.label ?? currentGroup?.label,
        order_index: updates.order ?? currentGroup?.order ?? 0,
        is_collapsed: updates.collapsed ?? currentGroup?.collapsed ?? false
      }, { expectedUpdatedAt: currentGroup?.updated_at });

      if (!result.ok && result.conflict) {
        handleConflict('Column group');
      }
    },
    deleteColumnGroup: async (id: string) => {
      if (blockReadonlyMutation()) return;
      actions.deleteColumnGroup(id);
      const ok = await deleteColumnGroupPersisted(id);
      if (!ok) {
        toast.error('Failed to delete column group.');
      }
    },
    moveColumnGroup: async (id: string, order: number) => {
      if (blockReadonlyMutation()) return;
      const currentGroup = data.columnGroups.find((group) => group.id === id) as (ColumnGroup & { updated_at?: string }) | undefined;
      actions.moveColumnGroup(id, order);
      const result = await saveColumnGroup({
        id,
        canvas_id: canvasId,
        label: currentGroup?.label,
        order_index: order,
        is_collapsed: currentGroup?.collapsed ?? false
      }, { expectedUpdatedAt: currentGroup?.updated_at });
      if (!result.ok && result.conflict) {
        handleConflict('Column group');
      }
    },
    toggleColumnGroupCollapsed: async (id: string) => {
      if (blockReadonlyMutation()) return;
      const currentGroup = data.columnGroups.find((group) => group.id === id) as (ColumnGroup & { updated_at?: string }) | undefined;
      if (!currentGroup) return;
      const nextCollapsed = !currentGroup.collapsed;
      actions.toggleColumnGroupCollapsed(id);
      const result = await saveColumnGroup({
        id,
        canvas_id: canvasId,
        label: currentGroup.label,
        order_index: currentGroup.order ?? 0,
        is_collapsed: nextCollapsed
      }, { expectedUpdatedAt: currentGroup.updated_at });
      if (!result.ok && result.conflict) {
        handleConflict('Column group');
      }
    },
    assignColumnToGroup: async (columnId: string, groupId?: string) => {
      if (blockReadonlyMutation()) return;
      const currentColumn = data.columns.find((column) => column.id === columnId) as (Column & { updated_at?: string }) | undefined;
      actions.assignColumnToGroup(columnId, groupId);
      const result = await saveColumn({
        id: columnId,
        canvas_id: canvasId,
        group_id: groupId || null,
        updated_at: currentColumn?.updated_at
      } as any, { expectedUpdatedAt: currentColumn?.updated_at });
      if (!result.ok && result.conflict) {
        handleConflict('Column');
      }
    },
    addRow: async (row: Row) => {
      if (blockReadonlyMutation()) return;
      actions.addRow(row);
      const result = await saveSwimlane({
        id: row.id,
        canvas_id: canvasId,
        name: row.label,
        order_index: row.order
      } as any, { isNew: true });
      if (!result.ok) {
        toast.error(result.message || 'Failed to create row.');
        refetchAndReset();
      }
    },
    updateRow: async (id: string, updates: Partial<Row>) => {
      if (blockReadonlyMutation()) return;
      const currentRow = data.rows.find((row) => row.id === id) as (Row & { updated_at?: string }) | undefined;
      actions.updateRow(id, updates);

      const dbUpdate: any = {
        id,
        canvas_id: canvasId
      };

      if (updates.label !== undefined) dbUpdate.name = updates.label;
      if (updates.order !== undefined) dbUpdate.order_index = updates.order;
      if (updates.collapsed !== undefined) dbUpdate.is_collapsed = updates.collapsed;

      const result = await saveSwimlane(dbUpdate, { expectedUpdatedAt: currentRow?.updated_at });
      if (!result.ok && result.conflict) {
        handleConflict('Row');
      }
    },
    deleteRow: async (id: string) => {
      if (blockReadonlyMutation()) return;
      actions.deleteRow(id);
      await deleteSwimlane(id);
    },
    moveRow: async (id: string, order: number) => {
      if (blockReadonlyMutation()) return;
      const currentRow = data.rows.find((row) => row.id === id) as (Row & { updated_at?: string }) | undefined;
      actions.moveRow(id, order);
      const result = await saveSwimlane({
        id,
        canvas_id: canvasId,
        order_index: order,
        updated_at: currentRow?.updated_at
      } as any, { expectedUpdatedAt: currentRow?.updated_at });
      if (!result.ok && result.conflict) {
        handleConflict('Row');
      }
    },
    // Comment persistence
    addComment: async (comment: Comment) => {
      if (blockReadonlyMutation()) {
        return { ok: false, conflict: false, message: 'Read-only mode: comments are disabled.' };
      }
      const userId = await getCurrentUserId();
      if (!userId) {
        toast.error('Session expired. Please sign in again.');
        return { ok: false };
      }

      const result = await saveComment({
        id: comment.id,
        canvas_id: canvasId,
        card_id: comment.cardId,
        user_id: userId,
        text: comment.text
      });
      if (!result.ok) {
        toast.error(result.message || 'Failed to save comment.');
        return result;
      }

      actions.addComment({
        ...comment,
        id: result.comment?.id || comment.id,
        userId: result.comment?.user_id || userId,
        date: result.comment?.created_at || comment.date
      });
      return result;
    },
    deleteComment: async (cardId: string, commentId: string) => {
      if (blockReadonlyMutation()) {
        return { ok: false, conflict: false, message: 'Read-only mode: comments are disabled.' };
      }
      const result = await deleteCommentPersisted(commentId);
      if (!result.ok) {
        toast.error(result.message || 'Failed to delete comment.');
        return result;
      }
      actions.deleteComment(cardId, commentId);
      return result;
    },
    // Vote persistence
    addVote: async (vote: Vote) => {
      if (blockReadonlyMutation()) {
        return { ok: false, conflict: false, message: 'Read-only mode: voting is disabled.' };
      }
      const userId = await getCurrentUserId();
      if (!userId) {
        toast.error('Session expired. Please sign in again.');
        return { ok: false };
      }

      const result = await saveVote({
        id: vote.id,
        canvas_id: canvasId,
        card_id: vote.cardId,
        user_id: userId,
        value: vote.value
      });

      if (!result.ok) {
        toast.error(result.message || 'Failed to save vote.');
        return result;
      }

      const existingVote = data.cards
        .find((card) => card.id === vote.cardId)
        ?.votes?.find((v) => v.userId === userId);
      if (existingVote) {
        actions.removeVote(vote.cardId, existingVote.id);
      }

      actions.addVote({
        id: result.vote?.id || vote.id,
        cardId: vote.cardId,
        userId,
        value: result.vote?.value ?? vote.value
      });

      return result;
    },
    removeVote: async (cardId: string, voteId: string) => {
      if (blockReadonlyMutation()) {
        return { ok: false, conflict: false, message: 'Read-only mode: voting is disabled.' };
      }
      const result = await deleteVotePersisted(voteId);
      if (!result.ok) {
        toast.error(result.message || 'Failed to remove vote.');
        return result;
      }
      actions.removeVote(cardId, voteId);
      return result;
    },
    // Link persistence
    addLink: async (link: Link) => {
      if (blockReadonlyMutation()) {
        return { ok: false, isDuplicate: false, message: 'Read-only mode: links are disabled.' };
      }
      const result = await saveLink({
        id: link.id,
        canvas_id: canvasId,
        from_card_id: link.masterId,
        to_card_id: link.slaveId,
        relation: link.relation || 'Relates to'
      });
      if (result.ok) {
        actions.addLink(link);
      } else if (result.isDuplicate) {
        toast.error('This link already exists.');
      } else {
        toast.error(result.message || 'Failed to save link.');
      }
      return result;
    },
    deleteLink: async (id: string) => {
      if (blockReadonlyMutation()) return;
      actions.deleteLink(id);
      await deleteLink(id);
    }
  };
}
