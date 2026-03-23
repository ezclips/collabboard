import type { Card, Link, Row, Column } from '@/types/kanban-canvas';

export type GanttLinkType = '0' | '1' | '2' | '3';

export interface GanttTask {
  id: string;
  text: string;
  description?: string;
  start_date: string;
  end_date: string;
  duration: number;
  progress: number;
  stage_id?: string;
  task_type?: string;
  parent?: string;
  open?: boolean;
  type?: string;
  color?: string;
}

export interface GanttLink {
  id: string;
  source: string;
  target: string;
  type: GanttLinkType;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const RELATION_TO_GANTT: Record<string, GanttLinkType> = {
  'Depends on': '0',        // Finish to Start (Standard)
  'Starts with': '1',       // Start to Start
  'Finishes with': '2',     // Finish to Finish
  'Start to Finish': '3',   // Start to Finish
  'Relates to': '0',        // Default fallback
  blocks: '0',              // Legacy fallback
  'Is required for': '2',   // Legacy fallback
};

const GANTT_TO_RELATION: Record<GanttLinkType, string> = {
  '0': 'Depends on',
  '1': 'Starts with',
  '2': 'Finishes with',
  '3': 'Start to Finish',
};

function clamp(num: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, num));
}

function formatDateParts(year: number, monthOneBased: number, day: number): string {
  return `${year}-${String(monthOneBased).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseDateOnlyAsUtc(dateOnly: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function toDateOnly(dateLike?: string | Date | null): string | null {
  if (!dateLike) return null;
  if (typeof dateLike === 'string') {
    const trimmed = dateLike.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return null;
    return formatDateParts(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
  }

  const date = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(date.getTime())) return null;
  return formatDateParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function addDays(dateOnly: string, days: number): string {
  const date = parseDateOnlyAsUtc(dateOnly);
  if (!date) return dateOnly;
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function durationFromDates(startDate: string, endDate: string): number {
  const start = parseDateOnlyAsUtc(startDate);
  const end = parseDateOnlyAsUtc(endDate);
  if (!start || !end) return 1;
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / DAY_MS));
}

function normalizeHexColor(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return undefined;
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) return trimmed.toUpperCase();
  if (/^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(trimmed)) return `#${trimmed.toUpperCase()}`;
  return undefined;
}

export function cardProgressToGantt(progress?: number): number {
  const normalized = typeof progress === 'number' ? progress : 0;
  return clamp(normalized / 100, 0, 1);
}

export function ganttProgressToCard(progress?: number): number {
  const normalized = typeof progress === 'number' ? progress : 0;
  return Math.round(clamp(normalized, 0, 1) * 100);
}

export function mapCardToGanttTask(card: Card): GanttTask {
  const startDate = toDateOnly(card.start_date) || toDateOnly(card.end_date) || new Date().toISOString().slice(0, 10);
  const endDate = toDateOnly(card.end_date) || addDays(startDate, 1);

  const isMilestoneCard = card.task_type?.toLowerCase() === 'milestone';

  const task: GanttTask = {
    id: card.id,
    text: card.label || 'Untitled',
    description: card.description,
    start_date: startDate,
    end_date: endDate,
    duration: durationFromDates(startDate, endDate),
    progress: cardProgressToGantt(card.progress),
    stage_id: card.columnId,
    task_type: card.task_type || 'Task',
    type: isMilestoneCard ? 'milestone' : 'task',
    open: true,
    color: normalizeHexColor(card.color),
  };

  // Milestones: DHTMLX requires duration=0 explicitly; end_date must equal start_date
  if (task.type === 'milestone') {
    task.duration = 0;
    task.end_date = startDate;
  }

  // Include parent if it exists
  if (typeof card.parent === 'string' && card.parent.length > 0) {
    task.parent = card.parent;
  }

  return task;
}

export function mapGanttTaskToCardPatch(task: Partial<GanttTask>): Partial<Card> {
  const startDate = toDateOnly(task.start_date);
  const isMilestone = task.type === 'milestone' || task.task_type === 'Milestone';
  // Milestones have zero duration — end_date must equal start_date
  const endDate = isMilestone
    ? startDate
    : (toDateOnly(task.end_date) || (startDate ? addDays(startDate, Math.max(1, task.duration || 1)) : null));

  const patch: Partial<Card> = {};
  if (task.text !== undefined) patch.label = task.text;
  if (task.description !== undefined) patch.description = task.description;
  if (task.task_type !== undefined) {
    patch.task_type = (task.task_type === 'Milestone' || task.task_type === 'milestone')
      ? 'Milestone'
      : (task.task_type as 'Feature' | 'Task');
  }
  if (task.stage_id !== undefined) patch.columnId = task.stage_id;
  if (task.parent !== undefined) patch.parent = task.parent || undefined;
  if (startDate !== null) patch.start_date = startDate;
  if (endDate !== null) patch.end_date = endDate;
  if (task.progress !== undefined) patch.progress = ganttProgressToCard(task.progress);
  if (task.color !== undefined) {
    const normalized = normalizeHexColor(task.color);
    patch.color = normalized || '';
  }
  return patch;
}

export function mapLinkToGantt(link: Link): GanttLink {
  return {
    id: link.id,
    source: link.masterId,
    target: link.slaveId,
    type: RELATION_TO_GANTT[link.relation || ''] || '0',
  };
}

export function mapGanttLinkToKanban(link: GanttLink): Link {
  const relationType = (link.type || '0') as GanttLinkType;
  return {
    id: link.id,
    masterId: link.source,
    slaveId: link.target,
    relation: GANTT_TO_RELATION[relationType] || 'Relates to',
  };
}

export function resolveDefaultPlacement(columns: Column[], rows: Row[]): { columnId: string | null; rowId?: string } {
  const firstColumn = [...columns].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0];
  if (!firstColumn) return { columnId: null };
  const firstRow = [...rows].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0];
  return {
    columnId: firstColumn.id,
    rowId: firstRow?.id,
  };
}
