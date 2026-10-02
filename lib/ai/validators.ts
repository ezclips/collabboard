import { z, ZodError } from 'zod';

import type {
  AIMode,
  DiagramSubtype,
  BarChartDiagramData,
  ComparisonDiagramData,
  FlowDiagramData,
  InfographicDiagramData,
  InfographicTemplate,
  LessonBoardData,
  MindmapDiagramData,
  PhotoCardData,
  PieChartDiagramData,
  StoredInfographicTemplate,
  TimelineDiagramData,
  WorkshopBoardData,
} from './contracts';
import { isKnownAntvTemplate } from './antv/catalog';
import { parseOutline } from './outline';
import { VISUAL_THEMES, type VisualThemeId } from './visualThemes';
import { sanitizeVisualStyle } from './visualStyle';

/**
 * PATCH-238. An optional colour theme. A known id is kept; an unknown string is
 * dropped to undefined so a stored post is never rejected over its theme.
 */
const ThemeSchema = z
  .string()
  .optional()
  .transform((value): VisualThemeId | undefined =>
    value && Object.prototype.hasOwnProperty.call(VISUAL_THEMES, value) ? (value as VisualThemeId) : undefined,
  );

/**
 * PATCH-253. An optional, lenient per-picture visual style. Only real `#rrggbb`
 * colours and known system fonts survive; an entirely invalid style becomes
 * undefined rather than rejecting the post.
 */
const StyleSchema = z.unknown().optional().transform(sanitizeVisualStyle);

const LessonBoardSectionSchema = z.object({
  title: z.string().min(1),
  bullets: z.array(z.string().min(1)).optional(),
  durationMinutes: z.number().int().positive().optional(),
});

const ChartDataPointSchema = z.object({
  label: z.string().min(1),
  value: z.number(),
});

const TimelineItemSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  dateLabel: z.string().optional(),
});

const ComparisonColumnSchema = z.object({
  heading: z.string().min(1),
  points: z.array(z.string().min(1)).min(1),
});

const PhotoImageSchema = z.object({
  query: z.string().min(1),
  url: z.string().url().optional(),
});

const PhotoCardTextStyleSchema = z.object({
  heading: z.enum(['h1', 'h2', 'normal', 'small', 'code', 'callout', 'quote']).optional(),
  color: z.string().optional(),
  backgroundColor: z.string().optional(),
  fontSize: z.string().optional(),
  fontWeight: z.string().optional(),
  fontStyle: z.string().optional(),
  fontFamily: z.string().optional(),
  lineHeight: z.string().optional(),
  underline: z.boolean().optional(),
  strikethrough: z.boolean().optional(),
  textAlign: z.enum(['left', 'center', 'right']).optional(),
});

const WorkshopBoardBlockSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  durationMinutes: z.number().int().positive().optional(),
});

export const LessonBoardSchema: z.ZodType<LessonBoardData> = z.object({
  type: z.literal('lesson_board'),
  title: z.string().min(1),
  objective: z.string().optional(),
  sections: z.array(LessonBoardSectionSchema).min(1),
});

export const FlowDiagramSchema: z.ZodType<FlowDiagramData> = z.object({
  type: z.literal('diagram'),
  subtype: z.literal('flowchart'),
  title: z.string().min(1),
  renderer: z.literal('diagram_code'),
  code: z.string().min(1),
  explanation: z.string().optional(),
});

const MindmapLeafSchema = z.object({ label: z.string().min(1) });

/**
 * PATCH-242. An optional branch side. A known value is kept; anything else is
 * dropped to undefined so a stored post is never rejected over it.
 */
const MindmapBranchSideSchema = z
  .unknown()
  .transform((value): 'left' | 'right' | undefined => (value === 'left' || value === 'right' ? value : undefined));

const MindmapBranchSchema = z.object({
  label: z.string().min(1),
  side: MindmapBranchSideSchema,
  children: z.array(MindmapLeafSchema).optional(),
});

/**
 * PATCH-234. The optional tree our own mind-map renderer draws. Over-long trees
 * are trimmed (8 branches, 6 leaves) rather than rejected, matching
 * `parseOutline`, which already caps the outline at those counts upstream.
 */
const MindmapTreeSchema = z
  .object({
    label: z.string().min(1),
    children: z.array(MindmapBranchSchema).optional(),
  })
  .transform((tree) => ({
    label: tree.label,
    children: tree.children
      ?.slice(0, 8)
      .map((branch) => ({
        label: branch.label,
        ...(branch.side ? { side: branch.side } : {}),
        children: branch.children ? branch.children.slice(0, 6) : undefined,
      })),
  }));

export const MindmapDiagramSchema: z.ZodType<MindmapDiagramData> = z.object({
  type: z.literal('diagram'),
  subtype: z.literal('mindmap'),
  title: z.string().min(1),
  renderer: z.literal('diagram_code'),
  code: z.string().min(1),
  explanation: z.string().optional(),
  tree: MindmapTreeSchema.optional(),
  theme: ThemeSchema,
  style: StyleSchema,
});

export const PieChartDiagramSchema: z.ZodType<PieChartDiagramData> = z.object({
  type: z.literal('diagram'),
  subtype: z.literal('pie_chart'),
  title: z.string().min(1),
  renderer: z.literal('chart'),
  dataPoints: z.array(ChartDataPointSchema).min(1),
});

export const BarChartDiagramSchema: z.ZodType<BarChartDiagramData> = z.object({
  type: z.literal('diagram'),
  subtype: z.literal('bar_chart'),
  title: z.string().min(1),
  renderer: z.literal('chart'),
  dataPoints: z.array(ChartDataPointSchema).min(1),
  xLabel: z.string().optional(),
  yLabel: z.string().optional(),
});

export const TimelineDiagramSchema: z.ZodType<TimelineDiagramData> = z.object({
  type: z.literal('diagram'),
  subtype: z.literal('timeline'),
  title: z.string().min(1),
  renderer: z.literal('timeline'),
  items: z.array(TimelineItemSchema).min(1),
  theme: ThemeSchema,
  style: StyleSchema,
});

export const ComparisonDiagramSchema: z.ZodType<ComparisonDiagramData> = z.object({
  type: z.literal('diagram'),
  subtype: z.literal('comparison'),
  title: z.string().min(1),
  renderer: z.literal('comparison'),
  columns: z.array(ComparisonColumnSchema).min(2),
  theme: ThemeSchema,
  style: StyleSchema,
});

/**
 * PATCH-236. The infographic keeps the extracted outline. Its `outline` is run
 * through the SAME `parseOutline` every model reply uses, so the limits live in
 * one place; an unknown template is rejected.
 */
const OUR_INFographic_TEMPLATES = ['stack', 'pyramid', 'stairs', 'cycle', 'funnel', 'hub'] as const;

/**
 * PATCH-241. Our six names stay exact; an `antv:<name>` is kept only when it is
 * in the generated catalogue. Anything else falls back to a known-good AntV
 * template, so an old/new post is never rejected over its design.
 */
export const INfographicFallbackTemplate: StoredInfographicTemplate = 'antv:list-grid-badge-card';

const INfographicTemplateSchema = z.string().transform((value): StoredInfographicTemplate => {
  if ((OUR_INFographic_TEMPLATES as readonly string[]).includes(value)) {
    return value as InfographicTemplate;
  }
  if (/^antv:[a-z0-9-]{3,80}$/.test(value) && isKnownAntvTemplate(value.slice('antv:'.length))) {
    return value as StoredInfographicTemplate;
  }
  return INfographicFallbackTemplate;
});

export const InfographicDiagramSchema: z.ZodType<InfographicDiagramData> = z.object({
  type: z.literal('diagram'),
  subtype: z.literal('infographic'),
  title: z.string().min(1),
  renderer: z.literal('infographic'),
  template: INfographicTemplateSchema,
  outline: z.unknown().transform((value, ctx) => {
    try {
      return parseOutline(value);
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : 'Invalid outline.',
      });
      return z.NEVER;
    }
  }),
  explanation: z.string().optional(),
  theme: ThemeSchema,
  style: StyleSchema,
});

export const PhotoCardSchema: z.ZodType<PhotoCardData> = z.object({
  type: z.literal('photo'),
  title: z.string(),
  image: PhotoImageSchema,
  caption: z.string().optional(),
  kicker: z.string().optional(),
  textStyle: PhotoCardTextStyleSchema.optional(),
});

export const WorkshopBoardSchema: z.ZodType<WorkshopBoardData> = z.object({
  type: z.literal('workshop_board'),
  title: z.string().min(1),
  blocks: z.array(WorkshopBoardBlockSchema).min(1),
});

export const DIAGRAM_SUBTYPE_SCHEMAS = {
  flowchart: FlowDiagramSchema,
  mindmap: MindmapDiagramSchema,
  pie_chart: PieChartDiagramSchema,
  bar_chart: BarChartDiagramSchema,
  timeline: TimelineDiagramSchema,
  comparison: ComparisonDiagramSchema,
  infographic: InfographicDiagramSchema,
} as const;

export const MODE_SCHEMAS = {
  lesson_board: LessonBoardSchema,
  photo_card: PhotoCardSchema,
  workshop_board: WorkshopBoardSchema,
} as const;

type StandardMode = Exclude<AIMode, 'diagram'>;

type ModeSchemaMap = typeof MODE_SCHEMAS;
type DiagramSchemaMap = typeof DIAGRAM_SUBTYPE_SCHEMAS;

type ParsedModeData<M extends StandardMode> = z.infer<ModeSchemaMap[M]>;
type ParsedDiagramData<S extends DiagramSubtype> = z.infer<DiagramSchemaMap[S]>;

export type ValidationInput =
  | { mode: 'diagram'; subtype: DiagramSubtype; data: unknown }
  | { mode: StandardMode; data: unknown };

export type ValidationMissingSubtypeError = {
  success: false;
  error: Error;
};

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: ZodError | Error };

export function validateModeData<M extends StandardMode>(
  mode: M,
  input: unknown,
): ParsedModeData<M> {
  const schema = MODE_SCHEMAS[mode] as z.ZodType<ParsedModeData<M>>;
  return schema.parse(input);
}

export function validateDiagramData<S extends DiagramSubtype>(
  subtype: S,
  input: unknown,
): ParsedDiagramData<S> {
  const schema = DIAGRAM_SUBTYPE_SCHEMAS[subtype] as z.ZodType<ParsedDiagramData<S>>;
  return schema.parse(input);
}

export function validateAIContent(input: ValidationInput) {
  if (input.mode === 'diagram') {
    return validateDiagramData(input.subtype, input.data);
  }

  return validateModeData(input.mode, input.data);
}

export function safeValidateModeData<M extends StandardMode>(
  mode: M,
  input: unknown,
): ValidationResult<ParsedModeData<M>> {
  const schema = MODE_SCHEMAS[mode] as z.ZodType<ParsedModeData<M>>;
  return schema.safeParse(input);
}

export function safeValidateDiagramData<S extends DiagramSubtype>(
  subtype: S,
  input: unknown,
): ValidationResult<ParsedDiagramData<S>> {
  const schema = DIAGRAM_SUBTYPE_SCHEMAS[subtype] as z.ZodType<ParsedDiagramData<S>>;
  return schema.safeParse(input);
}

export function safeValidateAIContent(input: ValidationInput) {
  if (input.mode === 'diagram') {
    return safeValidateDiagramData(input.subtype, input.data);
  }

  return safeValidateModeData(input.mode, input.data);
}

export function safeValidateAIContentWithSubtypeCheck(input: {
  mode: AIMode;
  subtype?: DiagramSubtype;
  data: unknown;
}):
  | ValidationResult<LessonBoardData | PhotoCardData | WorkshopBoardData>
  | ValidationResult<
      | FlowDiagramData
      | MindmapDiagramData
      | PieChartDiagramData
      | BarChartDiagramData
      | TimelineDiagramData
      | ComparisonDiagramData
      | InfographicDiagramData
    >
  | ValidationMissingSubtypeError {
  if (input.mode === 'diagram') {
    if (!input.subtype) {
      return {
        success: false,
        error: new Error('Diagram subtype is required for validation.'),
      };
    }

    return safeValidateDiagramData(input.subtype, input.data);
  }

  return safeValidateModeData(input.mode, input.data);
}

export function createValidationError(error: ZodError): {
  message: string;
  issues: Array<{
    path: string;
    message: string;
    code: string;
  }>;
} {
  return {
    message: 'AI content validation failed.',
    issues: error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    })),
  };
}

export type LessonBoardSchemaData = z.infer<typeof LessonBoardSchema>;
export type FlowDiagramSchemaData = z.infer<typeof FlowDiagramSchema>;
export type MindmapDiagramSchemaData = z.infer<typeof MindmapDiagramSchema>;
export type PieChartDiagramSchemaData = z.infer<typeof PieChartDiagramSchema>;
export type BarChartDiagramSchemaData = z.infer<typeof BarChartDiagramSchema>;
export type TimelineDiagramSchemaData = z.infer<typeof TimelineDiagramSchema>;
export type ComparisonDiagramSchemaData = z.infer<typeof ComparisonDiagramSchema>;
export type PhotoCardSchemaData = z.infer<typeof PhotoCardSchema>;
export type WorkshopBoardSchemaData = z.infer<typeof WorkshopBoardSchema>;
