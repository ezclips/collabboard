import { z } from 'zod';
import { defineCommand } from '../core/command';
import { domainError } from '../core/errors';
import { asPostId } from '../core/ids';
import { err, ok } from '../core/result';
import type { PostsRepository } from './posts';

/**
 * PATCH-293. A pure template data model plus the ONE command that fills an
 * EMPTY board, columns first (ids generated up front). The command never
 * creates a board, checks emptiness or authority - RLS decides every insert.
 */

const templatePathSchema = z
  .string()
  .regex(/^\/templates\//, 'must be a same-origin /templates/ path');

const placementShape = {
  parent: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
} as const;

const columnPostSchema = z.object({
  kind: z.literal('column'),
  key: z.string().min(1),
  title: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number().optional(),
  topStrip: z.string().optional(),
});

const notePostSchema = z.object({
  kind: z.literal('note'),
  title: z.string(),
  html: z.string(),
  ...placementShape,
});

const todoPostSchema = z.object({
  kind: z.literal('todo'),
  title: z.string(),
  tasks: z.array(z.object({ text: z.string(), done: z.boolean() })),
  ...placementShape,
});

const tablePostSchema = z.object({
  kind: z.literal('table'),
  title: z.string(),
  /** First row is the header. */
  rows: z.array(z.array(z.string())),
  ...placementShape,
});

const imagePostSchema = z.object({
  kind: z.literal('image'),
  title: z.string(),
  src: templatePathSchema,
  caption: z.string().optional(),
  ...placementShape,
});

const clipartPostSchema = z.object({
  kind: z.literal('clipart'),
  title: z.string(),
  svg: templatePathSchema,
  iconBgColor: z.string(),
  iconColor: z.string().optional(),
  ...placementShape,
});

export const templatePostSchema = z.discriminatedUnion('kind', [
  columnPostSchema,
  notePostSchema,
  todoPostSchema,
  tablePostSchema,
  imagePostSchema,
  clipartPostSchema,
]);

export const boardTemplateSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z.string(),
    layout: z.literal('freeform'),
    previewUrl: z.string().optional(),
    posts: z.array(templatePostSchema),
  })
  .superRefine((template, ctx) => {
    const columnKeys = new Set<string>();
    template.posts.forEach((post, index) => {
      if (post.kind !== 'column') return;
      if (columnKeys.has(post.key)) {
        ctx.addIssue({
          code: 'custom',
          message: `Duplicate column key "${post.key}"`,
          path: ['posts', index, 'key'],
        });
      }
      columnKeys.add(post.key);
    });

    template.posts.forEach((post, index) => {
      if (post.kind === 'column') return;
      const hasParent = post.parent !== undefined;
      const hasPosition = post.x !== undefined || post.y !== undefined;
      if (hasParent && hasPosition) {
        ctx.addIssue({
          code: 'custom',
          message: 'A child cannot carry both a parent and a free position',
          path: ['posts', index],
        });
      }
      if (!hasParent && (post.x === undefined || post.y === undefined)) {
        ctx.addIssue({
          code: 'custom',
          message: 'A free post needs both x and y',
          path: ['posts', index],
        });
      }
      if (hasParent && !columnKeys.has(post.parent as string)) {
        ctx.addIssue({
          code: 'custom',
          message: `parent "${post.parent}" names no column`,
          path: ['posts', index, 'parent'],
        });
      }
    });
  });

export type BoardTemplate = z.infer<typeof boardTemplateSchema>;
export type TemplatePost = z.infer<typeof templatePostSchema>;

type ContentPost = Exclude<TemplatePost, { kind: 'column' }>;
type TemplateRow = Record<string, unknown> & { id: string };

function placementMetadata(parentId: string | undefined, width?: number, height?: number): Record<string, unknown> {
  return { ...(parentId === undefined ? {} : { parentId }), ...(width !== undefined || height !== undefined ? { manualSize: true } : {}) };
}

/**
 * Pure. Columns first, each child's parentId set and each column's ordered childPadletIds filled from ids generated up front. `newId` is injected for deterministic tests.
 */
export function buildTemplateRows(
  boardId: string,
  template: BoardTemplate,
  newId: () => string,
): object[] {
  const ids = new Map<TemplatePost, string>();
  for (const post of template.posts) ids.set(post, newId());

  const columnIds = new Map<string, string>();
  for (const post of template.posts) {
    if (post.kind === 'column') columnIds.set(post.key, ids.get(post)!);
  }

  const rows: TemplateRow[] = [];

  for (const post of template.posts) {
    if (post.kind !== 'column') continue;
    const childIds = template.posts
      .filter((candidate): candidate is ContentPost => candidate.kind !== 'column' && candidate.parent === post.key)
      .map((child) => ids.get(child)!);
    rows.push({
      id: ids.get(post)!,
      board_id: boardId,
      type: 'container',
      title: post.title,
      content: '',
      position_x: post.x,
      position_y: post.y,
      width: post.width,
      ...(post.height !== undefined ? { height: post.height } : {}),
      metadata: {
        ...placementMetadata(undefined, post.width, post.height),
        isContainer: true, orientation: 'vertical',
        childPadletIds: childIds,
        startExpanded: true,
        ...(post.topStrip !== undefined ? { topStrip: post.topStrip } : {}),
      },
    });
  }

  for (const post of template.posts) {
    if (post.kind === 'column') continue;
    const id = ids.get(post)!;
    const parent = post.parent;
    const parentId = parent === undefined ? undefined : columnIds.get(parent);
    const shared = {
      id,
      board_id: boardId,
      title: post.title,
      position_x: post.x ?? 0,
      position_y: post.y ?? 0,
      ...(post.width !== undefined ? { width: post.width } : {}),
      ...(post.height !== undefined ? { height: post.height } : {}),
    };

    switch (post.kind) {
      case 'note':
        rows.push({ ...shared, type: 'text', content: post.html, metadata: placementMetadata(parentId, post.width, post.height) });
        break;
      case 'todo': {
        const tasks = post.tasks.map((task, index) => ({ id: `${id}-task-${index}`, text: task.text, completed: task.done }));
        rows.push({
          ...shared,
          type: 'todo',
          content: JSON.stringify(tasks),
          metadata: { ...placementMetadata(parentId, post.width, post.height), tasks, todoTitle: post.title },
        });
        break;
      }
      case 'table': {
        const [header = [], ...body] = post.rows;
        rows.push({
          ...shared,
          type: 'table',
          content: JSON.stringify({ rows: body, columns: header }),
          metadata: placementMetadata(parentId, post.width, post.height),
        });
        break;
      }
      case 'image':
        rows.push({
          ...shared,
          type: 'image',
          content: '',
          file_url: post.src,
          width: post.width ?? 300,
          height: post.height ?? 200,
          metadata: {
            imageUrl: post.src,
            ...(post.caption !== undefined ? { caption: post.caption } : {}),
            ...placementMetadata(parentId, post.width, post.height),
          },
        });
        break;
      case 'clipart':
        rows.push({
          ...shared,
          type: 'card',
          content: '',
          width: 180,
          height: 220,
          metadata: {
            svgUrl: post.svg,
            iconColor: post.iconColor ?? '#000000',
            iconBgColor: post.iconBgColor,
            counterType: 'words',
            ...placementMetadata(parentId, post.width, post.height),
          },
        });
        break;
    }
  }
  return rows;
}

export const applyBoardTemplateSchema = z.object({
  boardId: z.string(),
  template: boardTemplateSchema,
});

/**
 * `board.applyTemplate`. Inserts the built rows in order; a failed insert rolls the rows already written back and returns `template_apply_failed`.
 */
export const createApplyBoardTemplateCommand = (repository: PostsRepository) =>
  defineCommand({
    name: 'board.applyTemplate',
    input: applyBoardTemplateSchema,
    execute: async (input) => {
      const rows = buildTemplateRows(input.boardId, input.template, () => crypto.randomUUID()) as TemplateRow[];
      const insertedIds: string[] = [];
      for (const row of rows) {
        const result = await repository.insert(row);
        if (!result.ok) {
          if (insertedIds.length > 0) {
            await repository.deleteByIds(insertedIds.map(asPostId));
          }
          return err(
            domainError('template_apply_failed', 'Could not apply the board template', {
              cause: result.error,
              details: { insertedIds },
            }),
          );
        }
        insertedIds.push(row.id);
      }

      return ok(rows.length);
    },
  });
