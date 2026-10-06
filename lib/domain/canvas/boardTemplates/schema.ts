import { z } from 'zod';

/**
 * PATCH-296. The template schema, generalised from PATCH-293's freeform-only
 * shape to six layouts. `boardTemplates.ts` re-exports this module as the
 * public entry, so every existing import keeps working.
 */

export const boardTemplateLayoutSchema = z.enum([
  'freeform',
  'columns',
  'grid',
  'wall',
  'map',
  'timeline',
]);

export type BoardTemplateLayout = z.infer<typeof boardTemplateLayoutSchema>;

const templatePathSchema = z
  .string()
  .regex(/^\/templates\//, 'must be a same-origin /templates/ path');

const placementShape = {
  parent: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  /** Columns only: the root post's section key. */
  section: z.string().optional(),
} as const;

const locationSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  label: z.string(),
});

const columnPostSchema = z.object({
  kind: z.literal('column'),
  key: z.string().min(1),
  title: z.string(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  topStrip: z.string().optional(),
  /** A section key (columns/grid). */
  section: z.string().optional(),
  /** A map pin's position. */
  location: locationSchema.optional(),
  /** A Timeline entry's badge label (timeline only). */
  timelineLabel: z.string().optional(),
});

const sectionPostSchema = z.object({
  kind: z.literal('section'),
  key: z.string().min(1),
  title: z.string(),
  ...placementShape,
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
  sectionPostSchema,
  columnPostSchema,
  notePostSchema,
  todoPostSchema,
  tablePostSchema,
  imagePostSchema,
  clipartPostSchema,
]);

export type TemplatePost = z.infer<typeof templatePostSchema>;
export type TemplateSectionPost = Extract<TemplatePost, { kind: 'section' }>;
export type TemplateContainerPost = Extract<TemplatePost, { kind: 'column' }>;
export type ContentPost = Exclude<TemplatePost, { kind: 'column' | 'section' }>;

type RefineContext = z.RefinementCtx;
type Post = TemplatePost;

function hasPosition(post: Post): boolean {
  return post.x !== undefined || post.y !== undefined;
}

function contentPost(post: Post): post is ContentPost {
  return post.kind !== 'column' && post.kind !== 'section';
}

function addIssue(ctx: RefineContext, message: string, path: Array<string | number>): void {
  ctx.addIssue({ code: 'custom', message, path });
}

/** Every content post naming a column must name one that exists. */
function checkParentNamesColumn(posts: Post[], columnKeys: Set<string>, ctx: RefineContext): void {
  posts.forEach((post, index) => {
    if (!contentPost(post) || post.parent === undefined) return;
    if (!columnKeys.has(post.parent)) {
      addIssue(ctx, `parent "${post.parent}" names no column`, ['posts', index, 'parent']);
    }
  });
}

function checkDuplicateKeys(
  posts: Post[],
  kind: 'column' | 'section',
  ctx: RefineContext,
): void {
  const seen = new Set<string>();
  posts.forEach((post, index) => {
    if (post.kind !== kind) return;
    if (seen.has(post.key)) {
      addIssue(ctx, `Duplicate ${kind} key "${post.key}"`, ['posts', index, 'key']);
    }
    seen.add(post.key);
  });
}

function validateFreeform(posts: Post[], ctx: RefineContext): void {
  posts.forEach((post, index) => {
    if (post.kind === 'section') {
      addIssue(ctx, 'A freeform template has no sections', ['posts', index, 'kind']);
      return;
    }
    if (post.kind === 'column') {
      if (post.section !== undefined) {
        addIssue(ctx, 'A freeform container cannot carry a section', ['posts', index, 'section']);
      }
      if (post.location !== undefined) {
        addIssue(ctx, 'A freeform container cannot carry a location', ['posts', index, 'location']);
      }
      if (post.timelineLabel !== undefined) {
        addIssue(ctx, 'A freeform container cannot carry a timeline label', ['posts', index, 'timelineLabel']);
      }
      for (const field of ['x', 'y', 'width'] as const) {
        if (post[field] === undefined) {
          addIssue(ctx, `A freeform container needs a ${field}`, ['posts', index, field]);
        }
      }
      return;
    }
    if (post.section !== undefined) {
      addIssue(ctx, 'A freeform post cannot carry a section', ['posts', index, 'section']);
    }
    const parented = post.parent !== undefined;
    const positioned = hasPosition(post);
    if (parented && positioned) {
      addIssue(ctx, 'A child cannot carry both a parent and a free position', ['posts', index]);
    }
    if (!parented && (post.x === undefined || post.y === undefined)) {
      addIssue(ctx, 'A free post needs both x and y', ['posts', index]);
    }
  });
}

function validateColumns(posts: Post[], sectionKeys: Set<string>, ctx: RefineContext): void {
  posts.forEach((post, index) => {
    if (hasPosition(post)) {
      addIssue(ctx, 'A columns template has no free positions', ['posts', index, post.x !== undefined ? 'x' : 'y']);
    }
    if (post.kind === 'section') return;
    if (post.kind === 'column') {
      if (post.timelineLabel !== undefined) {
        addIssue(ctx, 'A columns container cannot carry a timeline label', ['posts', index, 'timelineLabel']);
      }
      if (post.section === undefined) {
        addIssue(ctx, 'A columns container needs a section', ['posts', index, 'section']);
      } else if (!sectionKeys.has(post.section)) {
        addIssue(ctx, `section "${post.section}" names no section`, ['posts', index, 'section']);
      }
      return;
    }
    if (post.parent !== undefined) {
      if (post.section !== undefined) {
        addIssue(ctx, 'A child cannot carry a section', ['posts', index, 'section']);
      }
      return;
    }
    if (post.section === undefined) {
      addIssue(ctx, 'A root post needs a section', ['posts', index, 'section']);
    } else if (!sectionKeys.has(post.section)) {
      addIssue(ctx, `section "${post.section}" names no section`, ['posts', index, 'section']);
    }
  });
}

function validateGrid(posts: Post[], sectionKeys: Set<string>, ctx: RefineContext): void {
  posts.forEach((post, index) => {
    if (hasPosition(post)) {
      addIssue(ctx, 'A grid template has no free positions', ['posts', index, post.x !== undefined ? 'x' : 'y']);
    }
    if (post.kind === 'section') return;
    if (post.kind === 'column') {
      if (post.timelineLabel !== undefined) {
        addIssue(ctx, 'A grid container cannot carry a timeline label', ['posts', index, 'timelineLabel']);
      }
      if (post.section === undefined) {
        addIssue(ctx, 'A grid container needs a section', ['posts', index, 'section']);
      } else if (!sectionKeys.has(post.section)) {
        addIssue(ctx, `section "${post.section}" names no section`, ['posts', index, 'section']);
      }
      return;
    }
    if (post.parent === undefined) {
      addIssue(ctx, 'A grid post needs a parent', ['posts', index, 'parent']);
    }
  });
}

function validateParentedLayout(posts: Post[], ctx: RefineContext, allowTimelineLabel: boolean): void {
  posts.forEach((post, index) => {
    if (hasPosition(post)) {
      addIssue(ctx, 'This layout has no free positions', ['posts', index, post.x !== undefined ? 'x' : 'y']);
    }
    if (post.kind === 'section') {
      addIssue(ctx, 'This layout has no sections', ['posts', index, 'kind']);
      return;
    }
    if (post.kind === 'column') {
      if (post.section !== undefined) {
        addIssue(ctx, 'This layout has no sections', ['posts', index, 'section']);
      }
      if (post.timelineLabel !== undefined && !allowTimelineLabel) {
        addIssue(ctx, 'This layout has no timeline labels', ['posts', index, 'timelineLabel']);
      }
      return;
    }
    if (post.section !== undefined) {
      addIssue(ctx, 'This layout has no sections', ['posts', index, 'section']);
    }
    if (post.parent === undefined) {
      addIssue(ctx, 'This layout needs every post to have a parent', ['posts', index, 'parent']);
    }
  });
}

function validateMap(posts: Post[], ctx: RefineContext): void {
  posts.forEach((post, index) => {
    if (hasPosition(post)) {
      addIssue(ctx, 'A map template has no free positions', ['posts', index, post.x !== undefined ? 'x' : 'y']);
    }
    if (post.kind === 'section') return;
    if (post.kind === 'column') {
      if (post.timelineLabel !== undefined) {
        addIssue(ctx, 'A map pin cannot carry a timeline label', ['posts', index, 'timelineLabel']);
      }
      if (post.location === undefined) {
        addIssue(ctx, 'A map pin needs a location', ['posts', index, 'location']);
      } else {
        const { lat, lng, label } = post.location;
        if (lat < -90 || lat > 90) {
          addIssue(ctx, 'A map pin latitude must be between -90 and 90', ['posts', index, 'location', 'lat']);
        }
        if (lng < -180 || lng > 180) {
          addIssue(ctx, 'A map pin longitude must be between -180 and 180', ['posts', index, 'location', 'lng']);
        }
        if (label.trim() === '') {
          addIssue(ctx, 'A map pin needs a label', ['posts', index, 'location', 'label']);
        }
      }
      return;
    }
    if (post.parent === undefined) {
      addIssue(ctx, 'A map post needs a parent', ['posts', index, 'parent']);
    }
  });
}

export const boardTemplateSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z.string(),
    layout: boardTemplateLayoutSchema,
    previewUrl: z.string().optional(),
    posts: z.array(templatePostSchema),
  })
  .superRefine((template, ctx) => {
    const columnKeys = new Set(
      template.posts.filter((post) => post.kind === 'column').map((post) => post.key),
    );
    const sectionKeys = new Set(
      template.posts.filter((post) => post.kind === 'section').map((post) => post.key),
    );

    checkDuplicateKeys(template.posts, 'column', ctx);
    checkDuplicateKeys(template.posts, 'section', ctx);
    checkParentNamesColumn(template.posts, columnKeys, ctx);

    switch (template.layout) {
      case 'freeform':
        validateFreeform(template.posts, ctx);
        break;
      case 'columns':
        validateColumns(template.posts, sectionKeys, ctx);
        break;
      case 'grid':
        validateGrid(template.posts, sectionKeys, ctx);
        break;
      case 'wall':
        validateParentedLayout(template.posts, ctx, false);
        break;
      case 'timeline':
        validateParentedLayout(template.posts, ctx, true);
        break;
      case 'map':
        validateMap(template.posts, ctx);
        break;
    }
  });

export type BoardTemplate = z.infer<typeof boardTemplateSchema>;
