import type { LayoutType } from '@/types/collabboard';

/**
 * PATCH-301. The ten board formats, in two groups, with the exact copy the
 * approved mockup uses. Layout ids are the existing `LayoutType` values.
 */
export interface BoardFormat {
  readonly id: LayoutType;
  readonly name: string;
  readonly description: string;
  readonly tag?: string;
}

export interface BoardFormatGroup {
  readonly label: string;
  readonly formats: readonly BoardFormat[];
}

export const BOARD_FORMAT_GROUPS: readonly BoardFormatGroup[] = [
  {
    label: 'Collect and arrange',
    formats: [
      {
        id: 'freeform',
        name: 'Freeform',
        description: 'Your research board: notes, PDFs and pictures anywhere.',
        tag: 'Board AI + wiki',
      },
      { id: 'wall', name: 'Wall', description: 'Cards in a tidy, flowing wall.' },
      { id: 'columns', name: 'Columns', description: 'Sort posts into named columns.' },
      { id: 'grid', name: 'Grid', description: 'Even rows of equal cards.' },
      { id: 'timeline', name: 'Timeline', description: 'Posts in date order along a line.' },
      { id: 'map', name: 'Map', description: 'Pin posts to places on a world map.' },
    ],
  },
  {
    label: 'Plan, track and draw',
    formats: [
      { id: 'kanban', name: 'Kanban', description: 'Move tasks through stages.' },
      {
        id: 'gantt',
        name: 'Gantt',
        description: 'Schedule tasks and their dependencies.',
      },
      { id: 'scheduler', name: 'Scheduler', description: 'Events on a calendar.' },
      { id: 'drawing', name: 'Drawing', description: 'One big whiteboard to draw on.' },
    ],
  },
];

export const BOARD_FORMATS: readonly BoardFormat[] = BOARD_FORMAT_GROUPS.flatMap(
  (group) => group.formats,
);

export function formatById(id: LayoutType | null | undefined): BoardFormat | undefined {
  if (!id) return undefined;
  return BOARD_FORMATS.find((format) => format.id === id);
}
