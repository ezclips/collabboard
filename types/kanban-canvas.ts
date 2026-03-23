// Kanban Canvas Types - inspired by DHTMLX Kanban structure
// https://docs.dhtmlx.com/kanban/

import type { MouseEvent, ReactNode } from 'react';

// ============================================================================
// Core Data Types
// ============================================================================

export interface User {
  id: string;
  label: string;
  avatar?: string;
}

export interface CardAttachment {
  id?: string;
  name: string;
  url?: string;
  previewURL?: string;
  coverURL?: string;
  type?: string;
  isCover?: boolean;
}

export interface Card {
  id: string;
  label: string;
  description?: string;
  task_type?: 'Feature' | 'Task' | 'Milestone';
  start_date?: string;
  end_date?: string;
  priority?: 'low' | 'medium' | 'high';
  progress?: number;
  assigned?: string[]; // User IDs
  attached?: Array<string | CardAttachment>; // File names or rich attachment objects
  color?: string;
  projectId?: string;
  status?: string;
  columnId: string;
  rowId?: string;
  parent?: string;
  order?: number;
  votes?: Vote[];
  comments?: Comment[];
  links?: Link[];
  [key: string]: any; // Allow custom fields
}

export interface Column {
  id: string;
  label: string;
  limit?: number;
  strictLimit?: boolean;
  collapsed?: boolean;
  groupId?: string;
  order?: number;
}

export interface ColumnGroup {
  id: string;
  label: string;
  collapsed?: boolean;
  order?: number;
}

export interface Row {
  id: string;
  label: string;
  collapsed?: boolean;
  order?: number;
}

export interface Link {
  id: string;
  masterId: string; // Source card ID
  slaveId: string; // Target card ID
  relation?: string; // Type of link (e.g., "blocks", "relates to")
}

export interface Comment {
  id: string;
  cardId: string;
  text: string;
  date: string;
  userId: string;
}

export interface Vote {
  id: string;
  cardId: string;
  userId: string;
  value: number; // +1 or -1
}

export type CardGroupBy = 'none' | 'assignee' | 'priority' | 'project' | 'status';

// ============================================================================
// Shape Configuration Types (Stylization)
// ============================================================================

export interface CardShape {
  css?: string | ((card: Card) => string);
  headerCss?: string;
  footerCss?: string;
  cover?: keyof Card | null;
  coverCss?: string;
  label?: keyof Card;
  description?: keyof Card;
  progress?: keyof Card;
  priority?: keyof Card;
  date?: keyof Card;
  menuButton?: boolean;
  attached?: boolean;
  votes?: boolean;
  comments?: boolean;
}

export interface ColumnShape {
  css?: string;
  collapsed?: boolean;
  collapsedWidth?: number;
}

export interface RowShape {
  css?: string;
  collapsed?: boolean;
}

// ============================================================================
// Editor Configuration Types
// ============================================================================

export type EditorFieldType =
  | 'text'
  | 'textarea'
  | 'select'
  | 'multiselect'
  | 'date'
  | 'daterange'
  | 'progress'
  | 'comments'
  | 'links'
  | 'files'
  | 'color'
  | 'custom';

export interface EditorField {
  key: string;
  type: EditorFieldType;
  label: string;
  config?: {
    placeholder?: string;
    readonly?: boolean;
    options?: Array<{ id: string | number; label: string }>;
    multiple?: boolean;
    min?: number;
    max?: number;
    step?: number;
    [key: string]: any;
  };
}

export interface EditorShape {
  fields?: EditorField[];
  css?: string;
  width?: number;
  closeButton?: boolean;
  saveButton?: boolean;
  deleteButton?: boolean;
}

// ============================================================================
// Kanban Configuration
// ============================================================================

export interface KanbanConfig {
  // Data
  cards?: Card[];
  columns?: Column[];
  columnGroups?: ColumnGroup[];
  rows?: Row[];
  links?: Link[];
  users?: User[];

  // Keys
  columnKey?: string; // Default: "columnId"
  rowKey?: string; // Default: "rowId"

  // Shapes
  cardShape?: CardShape;
  cardRenderer?: (props: {
    card: Card;
    users: User[];
    onClick?: () => void;
    onMenuClick?: (e: MouseEvent) => void;
    isSelected?: boolean;
    readonly?: boolean;
  }) => ReactNode;
  columnShape?: ColumnShape;
  rowShape?: RowShape;
  editorShape?: EditorShape;

  // Behavior
  readonly?: boolean;
  history?: boolean;
  scrollType?: 'default' | 'native';
  renderType?: 'lazy' | 'default';

  // Localization
  locale?: string;
}

// ============================================================================
// Toolbar Configuration
// ============================================================================

export type ToolbarItemType =
  | 'search'
  | 'sort'
  | 'spacer'
  | 'addColumn'
  | 'addRow'
  | 'undo'
  | 'redo'
  | 'export'
  | 'locale'
  | 'custom';

export interface ToolbarItem {
  type: ToolbarItemType;
  id?: string;
  label?: string;
  icon?: string;
  onClick?: () => void;
}

export interface ToolbarConfig {
  items?: ToolbarItem[];
}

// ============================================================================
// State Types
// ============================================================================

export interface KanbanState {
  readonly: boolean;
  data: {
    cards: Card[];
    columns: Column[];
    columnGroups: ColumnGroup[];
    rows: Row[];
    links: Link[];
    users: User[];
  };
  ui: {
    selectedCardIds: string[];
    activeCardId: string | null;
    collapsedColumns: Set<string>;
    collapsedRows: Set<string>;
    searchQuery: string;
    sortBy: string | null;
    sortOrder: 'asc' | 'desc';
    groupBy: CardGroupBy;
    groupFilter: string | null;
    dateFormat: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';
    projectFilter: string | null;
    statusFilter: string | null;
    locale: string;
  };
  history: {
    past: KanbanState['data'][];
    future: KanbanState['data'][];
  };
}

// ============================================================================
// Action Types
// ============================================================================

export type KanbanAction =
  | { type: 'SET_READONLY'; payload: boolean }
  // Card actions
  | { type: 'ADD_CARD'; payload: Card }
  | { type: 'UPDATE_CARD'; payload: { id: string; updates: Partial<Card> } }
  | { type: 'DELETE_CARD'; payload: string }
  | { type: 'DUPLICATE_CARD'; payload: string }
  | { type: 'MOVE_CARD'; payload: { id: string; columnId: string; rowId?: string; order?: number } }
  | { type: 'SELECT_CARD'; payload: string }
  | { type: 'UNSELECT_CARD'; payload: string }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'SET_ACTIVE_CARD'; payload: string | null }
  // Column actions
  | { type: 'ADD_COLUMN'; payload: Column }
  | { type: 'UPDATE_COLUMN'; payload: { id: string; updates: Partial<Column> } }
  | { type: 'DELETE_COLUMN'; payload: string }
  | { type: 'MOVE_COLUMN'; payload: { id: string; order: number } }
  | { type: 'TOGGLE_COLUMN_COLLAPSED'; payload: string }
  | { type: 'ADD_COLUMN_GROUP'; payload: ColumnGroup }
  | { type: 'UPDATE_COLUMN_GROUP'; payload: { id: string; updates: Partial<ColumnGroup> } }
  | { type: 'DELETE_COLUMN_GROUP'; payload: string }
  | { type: 'MOVE_COLUMN_GROUP'; payload: { id: string; order: number } }
  | { type: 'TOGGLE_COLUMN_GROUP_COLLAPSED'; payload: string }
  | { type: 'ASSIGN_COLUMN_TO_GROUP'; payload: { columnId: string; groupId?: string } }
  // Row actions
  | { type: 'ADD_ROW'; payload: Row }
  | { type: 'UPDATE_ROW'; payload: { id: string; updates: Partial<Row> } }
  | { type: 'DELETE_ROW'; payload: string }
  | { type: 'MOVE_ROW'; payload: { id: string; order: number } }
  | { type: 'TOGGLE_ROW_COLLAPSED'; payload: string }
  // Link actions
  | { type: 'ADD_LINK'; payload: Link }
  | { type: 'DELETE_LINK'; payload: string }
  // Comment actions
  | { type: 'ADD_COMMENT'; payload: Comment }
  | { type: 'DELETE_COMMENT'; payload: { cardId: string; commentId: string } }
  // Vote actions
  | { type: 'ADD_VOTE'; payload: Vote }
  | { type: 'REMOVE_VOTE'; payload: { cardId: string; voteId: string } }
  // UI actions
  | { type: 'SET_SEARCH_QUERY'; payload: string }
  | { type: 'SET_SORT'; payload: { by: string | null; order: 'asc' | 'desc' } }
  | { type: 'SET_GROUP_BY'; payload: CardGroupBy }
  | { type: 'SET_GROUP_FILTER'; payload: string | null }
  | { type: 'SET_DATE_FORMAT'; payload: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD' }
  | { type: 'SET_PROJECT_FILTER'; payload: string | null }
  | { type: 'SET_STATUS_FILTER'; payload: string | null }
  | { type: 'SET_LOCALE'; payload: string }
  // History actions
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'RESET'; payload: KanbanState['data'] }
  | { type: 'SET_COLUMN_CARDS'; payload: { columnId: string; cards: Card[] } };

// ============================================================================
// Event Types
// ============================================================================

export interface KanbanEvents {
  onCardClick?: (card: Card) => void;
  onCardUpdate?: (card: Card) => void;
  onCardAdd?: (card: Card) => void;
  onCardDelete?: (cardId: string) => void;
  onCardMove?: (card: Card, fromColumn: string, toColumn: string) => void;
  onColumnAdd?: (column: Column) => void;
  onColumnUpdate?: (column: Column) => void;
  onColumnDelete?: (columnId: string) => void;
  onRowAdd?: (row: Row) => void;
  onRowUpdate?: (row: Row) => void;
  onRowDelete?: (rowId: string) => void;
}
