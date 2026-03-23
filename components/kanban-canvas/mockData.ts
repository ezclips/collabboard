import type { Card, Column, Row, Link, User, Comment, Vote } from '@/types/kanban-canvas';

// ============================================================================
// Mock Users
// ============================================================================

export const mockUsers: User[] = [
  { id: 'user-1', label: 'Alice Johnson', avatar: '👩‍💼' },
  { id: 'user-2', label: 'Bob Smith', avatar: '👨‍💻' },
  { id: 'user-3', label: 'Carol White', avatar: '👩‍🎨' },
  { id: 'user-4', label: 'David Brown', avatar: '👨‍🔬' },
];

// ============================================================================
// Mock Columns
// ============================================================================

export const mockColumns: Column[] = [
  { id: 'col-1', label: 'Backlog', order: 1 },
  { id: 'col-2', label: 'In Progress', order: 2, limit: 3 },
  { id: 'col-3', label: 'Testing', order: 3 },
  { id: 'col-4', label: 'Done', order: 4 },
];

// ============================================================================
// Mock Rows (Swimlanes)
// ============================================================================

export const mockRows: Row[] = [
  { id: 'row-1', label: 'Feature', order: 1 },
  { id: 'row-2', label: 'Task', order: 2 },
];

// ============================================================================
// Mock Cards
// ============================================================================

export const mockCards: Card[] = [
  {
    id: 'card-1',
    label: 'Integration with Angular/React',
    description: 'Add support for modern frameworks',
    columnId: 'col-1',
    rowId: 'row-1',
    priority: 'high',
    start_date: '2026-01-01',
    progress: 0,
    assigned: ['user-1'],
    order: 1,
    color: '#FF6B6B',
  },
  {
    id: 'card-2',
    label: 'Archive the cards/boards',
    description: 'Implement archiving functionality',
    columnId: 'col-1',
    rowId: 'row-2',
    priority: 'low',
    progress: 1,
    assigned: ['user-2'],
    order: 2,
    color: '#4ECDC4',
  },
  {
    id: 'card-3',
    label: 'Set the tasks priorities',
    description: 'Allow users to set priority levels',
    columnId: 'col-2',
    rowId: 'row-1',
    priority: 'medium',
    start_date: '2026-01-01',
    progress: 75,
    assigned: ['user-1', 'user-3'],
    order: 1,
    color: '#FFD93D',
    attached: ['image-mountain.jpg'],
  },
  {
    id: 'card-4',
    label: 'Drag and drop',
    description: 'Enable drag and drop for cards',
    columnId: 'col-3',
    rowId: 'row-1',
    priority: 'high',
    progress: 100,
    assigned: ['user-2'],
    order: 1,
    color: '#6BCF7F',
  },
  {
    id: 'card-5',
    label: 'Searching and filtering',
    description: 'Add search and filter capabilities',
    columnId: 'col-4',
    rowId: 'row-2',
    priority: 'high',
    start_date: '2026-01-01',
    progress: 1,
    assigned: ['user-4'],
    order: 1,
    color: '#95E1D3',
  },
  {
    id: 'card-6',
    label: 'Custom icons',
    description: 'Allow custom icon uploads',
    columnId: 'col-2',
    rowId: 'row-2',
    priority: 'medium',
    start_date: '2026-01-01',
    progress: 0,
    assigned: ['user-3'],
    order: 2,
    color: '#F38181',
  },
  {
    id: 'card-7',
    label: 'Integration with Gantt',
    description: 'Connect Kanban with Gantt chart',
    columnId: 'col-2',
    rowId: 'row-1',
    priority: 'medium',
    progress: 0,
    assigned: ['user-1', 'user-4'],
    order: 3,
    color: '#AA96DA',
  },
  {
    id: 'card-8',
    label: 'Create cards and lists from the UI and from code',
    description: 'Support both UI and programmatic card creation',
    columnId: 'col-4',
    rowId: 'row-1',
    priority: 'low',
    start_date: '2026-06-08',
    progress: 0,
    assigned: ['user-2', 'user-3'],
    order: 2,
    color: '#FCBAD3',
  },
  {
    id: 'card-9',
    label: 'Draw swimlanes',
    description: 'Visual representation of swimlanes',
    columnId: 'col-4',
    rowId: 'row-1',
    priority: 'medium',
    progress: 0,
    assigned: ['user-1'],
    order: 3,
    color: '#FFFFD2',
  },
  {
    id: 'card-10',
    label: 'Progress bar',
    description: 'Add progress indicators to cards',
    columnId: 'col-4',
    rowId: 'row-2',
    priority: 'high',
    start_date: '2026-01-01',
    progress: 100,
    assigned: ['user-4'],
    order: 2,
    color: '#A8D8EA',
  },
];

// ============================================================================
// Mock Comments
// ============================================================================

export const mockComments: Comment[] = [
  {
    id: 'comment-1',
    cardId: 'card-3',
    text: 'Great progress! Almost there.',
    date: '2026-01-15T10:30:00Z',
    userId: 'user-1',
  },
  {
    id: 'comment-2',
    cardId: 'card-3',
    text: 'Need to review the edge cases.',
    date: '2026-01-16T14:20:00Z',
    userId: 'user-3',
  },
];

// ============================================================================
// Mock Votes
// ============================================================================

export const mockVotes: Vote[] = [
  { id: 'vote-1', cardId: 'card-3', userId: 'user-1', value: 1 },
  { id: 'vote-2', cardId: 'card-3', userId: 'user-2', value: 1 },
];

// ============================================================================
// Mock Links
// ============================================================================

export const mockLinks: Link[] = [
  {
    id: 'link-1',
    masterId: 'card-1',
    slaveId: 'card-3',
    relation: 'blocks',
  },
  {
    id: 'link-2',
    masterId: 'card-4',
    slaveId: 'card-5',
    relation: 'relates to',
  },
];

// ============================================================================
// Helper: Attach comments to cards
// ============================================================================

export function attachCommentsToCards(cards: Card[], comments: Comment[]): Card[] {
  return cards.map((card) => ({
    ...card,
    comments: comments.filter((c) => c.cardId === card.id),
  }));
}

// ============================================================================
// Helper: Attach votes to cards
// ============================================================================

export function attachVotesToCards(cards: Card[], votes: Vote[]): Card[] {
  return cards.map((card) => ({
    ...card,
    votes: votes.filter((v) => v.cardId === card.id),
  }));
}

// ============================================================================
// Get initial mock data with all relations
// ============================================================================

export function getMockData() {
  let cardsWithRelations = [...mockCards];
  cardsWithRelations = attachCommentsToCards(cardsWithRelations, mockComments);
  cardsWithRelations = attachVotesToCards(cardsWithRelations, mockVotes);

  return {
    cards: cardsWithRelations,
    columns: mockColumns,
    rows: mockRows,
    links: mockLinks,
    users: mockUsers,
  };
}
