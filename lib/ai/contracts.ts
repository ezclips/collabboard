export type AIMode =
  | 'lesson_board'
  | 'diagram'
  | 'photo_card'
  | 'workshop_board';

export type DiagramSubtype =
  | 'flowchart'
  | 'mindmap'
  | 'pie_chart'
  | 'bar_chart'
  | 'timeline'
  | 'comparison';

export type AIRendererKey =
  | 'lesson_board'
  | 'diagram_code'
  | 'chart'
  | 'timeline'
  | 'comparison'
  | 'photo'
  | 'workshop_board'
  | 'legacy_html';

export interface AIContentEnvelope<T = unknown> {
  mode: AIMode;
  version: 1;
  data: T;
  meta?: {
    renderer?: AIRendererKey;
    subtype?: DiagramSubtype | string;
    prompt?: string;
    createdAt?: string;
  };
}

export interface GenerateAIContentRequest {
  prompt: string;
  mode: AIMode;
  subtype?: DiagramSubtype;
}

export interface LessonBoardSection {
  title: string;
  bullets?: string[];
  durationMinutes?: number;
}

export interface LessonBoardData {
  type: 'lesson_board';
  title: string;
  objective?: string;
  sections: LessonBoardSection[];
}

export interface DiagramDataBase {
  type: 'diagram';
  subtype: DiagramSubtype;
  title: string;
  renderer: AIRendererKey;
}

export interface FlowDiagramData extends DiagramDataBase {
  subtype: 'flowchart';
  renderer: 'diagram_code';
  code: string;
  explanation?: string;
}

export interface MindmapDiagramData extends DiagramDataBase {
  subtype: 'mindmap';
  renderer: 'diagram_code';
  code: string;
  explanation?: string;
}

export interface ChartDataPoint {
  label: string;
  value: number;
}

export interface PieChartDiagramData extends DiagramDataBase {
  subtype: 'pie_chart';
  renderer: 'chart';
  dataPoints: ChartDataPoint[];
}

export interface BarChartDiagramData extends DiagramDataBase {
  subtype: 'bar_chart';
  renderer: 'chart';
  dataPoints: ChartDataPoint[];
  xLabel?: string;
  yLabel?: string;
}

export interface TimelineItem {
  title: string;
  description?: string;
  dateLabel?: string;
}

export interface TimelineDiagramData extends DiagramDataBase {
  subtype: 'timeline';
  renderer: 'timeline';
  items: TimelineItem[];
}

export interface ComparisonColumn {
  heading: string;
  points: string[];
}

export interface ComparisonDiagramData extends DiagramDataBase {
  subtype: 'comparison';
  renderer: 'comparison';
  columns: ComparisonColumn[];
}

export interface PhotoCardData {
  type: 'photo';
  title: string;
  image: {
    query: string;
    url?: string;
  };
  caption?: string;
}

export interface WorkshopBoardBlock {
  title: string;
  description?: string;
  durationMinutes?: number;
}

export interface WorkshopBoardData {
  type: 'workshop_board';
  title: string;
  blocks: WorkshopBoardBlock[];
}

export type DiagramData =
  | FlowDiagramData
  | MindmapDiagramData
  | PieChartDiagramData
  | BarChartDiagramData
  | TimelineDiagramData
  | ComparisonDiagramData;

export type AIContentData =
  | LessonBoardData
  | DiagramData
  | PhotoCardData
  | WorkshopBoardData;

export type StoredAIContent = AIContentEnvelope<AIContentData>;

export interface LegacyHTMLContent {
  html: string;
}

export type LoadedAIContent = StoredAIContent | LegacyHTMLContent;
