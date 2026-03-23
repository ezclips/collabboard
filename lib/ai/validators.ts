import { z, ZodError } from 'zod';

import type {
  AIMode,
  DiagramSubtype,
  BarChartDiagramData,
  ComparisonDiagramData,
  FlowDiagramData,
  LessonBoardData,
  MindmapDiagramData,
  PhotoCardData,
  PieChartDiagramData,
  TimelineDiagramData,
  WorkshopBoardData,
} from './contracts';

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

export const MindmapDiagramSchema: z.ZodType<MindmapDiagramData> = z.object({
  type: z.literal('diagram'),
  subtype: z.literal('mindmap'),
  title: z.string().min(1),
  renderer: z.literal('diagram_code'),
  code: z.string().min(1),
  explanation: z.string().optional(),
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
});

export const ComparisonDiagramSchema: z.ZodType<ComparisonDiagramData> = z.object({
  type: z.literal('diagram'),
  subtype: z.literal('comparison'),
  title: z.string().min(1),
  renderer: z.literal('comparison'),
  columns: z.array(ComparisonColumnSchema).min(2),
});

export const PhotoCardSchema: z.ZodType<PhotoCardData> = z.object({
  type: z.literal('photo'),
  title: z.string().min(1),
  image: PhotoImageSchema,
  caption: z.string().optional(),
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
