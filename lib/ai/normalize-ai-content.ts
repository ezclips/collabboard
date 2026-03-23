import type { AIContentData, DiagramData, StoredAIContent } from '@/lib/ai/contracts';
import {
  deserializePersistedAIContent,
  isLegacyHTMLContent,
  isStructuredAIContentData,
} from '@/lib/ai/persistence';
import {
  trackAINormalizationUnknownShape,
  trackAIUnsupportedVersion,
} from '@/lib/ai/telemetry';
import type { LessonBoard as LegacyLessonBoard } from '@/types/collabboard';

type AIAssetImage = {
  query: string;
  placeholder?: string;
  url: string | null;
  source?: string | null;
};

type AIContentMetadata = {
  aiComponentJson?: unknown;
  savedAIComponent?: {
    code?: string;
    assets?: {
      images?: AIAssetImage[];
    };
  };
  aiComponentCode?: string;
  aiRawCode?: string;
  aiAssets?: {
    images?: AIAssetImage[];
  };
};

export type NormalizedAIContent =
  | { kind: 'legacy_html'; html: string }
  | { kind: 'legacy_lesson_board'; data: LegacyLessonBoard }
  | { kind: 'structured'; data: AIContentData; envelope?: StoredAIContent }
  | { kind: 'unsupported_structured_version'; version: number | null; raw: unknown }
  | { kind: 'unknown'; raw: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isLegacyLessonBoardContent(value: unknown): value is LegacyLessonBoard {
  return isRecord(value)
    && value.type === 'lesson_board'
    && Array.isArray(value.sections)
    && value.sections.every((section) => (
      isRecord(section) && Array.isArray(section.items)
    ));
}

export function isDiagramData(value: unknown): value is DiagramData {
  return isRecord(value) && value.type === 'diagram' && typeof value.subtype === 'string';
}

export function normalizeAIContent(value: unknown): NormalizedAIContent {
  const deserialized = deserializePersistedAIContent(value);

  switch (deserialized.kind) {
    case 'structured':
      return {
        kind: 'structured',
        data: deserialized.envelope.data,
        envelope: deserialized.envelope,
      };
    case 'legacy':
      if (isLegacyHTMLContent(deserialized.content)) {
        return { kind: 'legacy_html', html: deserialized.content.html };
      }

      if (isLegacyLessonBoardContent(deserialized.content)) {
        return { kind: 'legacy_lesson_board', data: deserialized.content };
      }

      if (isStructuredAIContentData(deserialized.content)) {
        return { kind: 'structured', data: deserialized.content };
      }

      trackAINormalizationUnknownShape({ stage: 'normalization', reason: 'unrecognized_legacy_shape' });
      return { kind: 'unknown', raw: deserialized.content };
    case 'unsupported_version':
      trackAIUnsupportedVersion({ version: deserialized.version, stage: 'normalization' });
      return {
        kind: 'unsupported_structured_version',
        version: deserialized.version,
        raw: deserialized.raw,
      };
    case 'unknown':
    default:
      if (value !== null && value !== undefined) {
        trackAINormalizationUnknownShape({ stage: 'normalization', reason: 'unknown_shape' });
      }
      return { kind: 'unknown', raw: value };
  }
}

export function resolveSavedAIHtmlFromMetadata(metadata?: AIContentMetadata): string {
  const stableCode = metadata?.savedAIComponent?.code || metadata?.aiComponentCode || '';
  if (stableCode) {
    return stableCode;
  }

  const rawCode = metadata?.aiRawCode || '';
  if (!rawCode) {
    return '';
  }

  const images =
    metadata?.savedAIComponent?.assets?.images ||
    (metadata?.aiAssets?.images || []).map((image) => ({
      query: image.query,
      placeholder: image.placeholder,
      url: image.url,
      source: image.source,
    }));

  let output = rawCode;
  for (const image of images) {
    if (image.placeholder) {
      output = output.split(image.placeholder).join(image.url || '/images/ai-placeholder.svg');
      continue;
    }

    const escapedQuery = image.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const tagRegex = new RegExp(`\\[SEARCH_IMAGE:\\s*${escapedQuery}\\s*\\]`, 'g');
    output = output.replace(tagRegex, image.url || '/images/ai-placeholder.svg');
  }

  return output;
}

export function extractAIContentFromPadletMetadata(
  metadata?: AIContentMetadata,
) {
  if (metadata?.aiComponentJson) {
    return metadata.aiComponentJson;
  }

  const html = resolveSavedAIHtmlFromMetadata(metadata);
  if (html) {
    return { html };
  }

  return undefined;
}
