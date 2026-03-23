import type {
  AIContentData,
  AIMode,
  AIContentEnvelope,
  DiagramSubtype,
  LegacyHTMLContent,
  LoadedAIContent,
  StoredAIContent,
} from '@/lib/ai/contracts';
import { trackAIUnsupportedVersion } from '@/lib/ai/telemetry';
import { safeValidateAIContent } from '@/lib/ai/validators';

export const CURRENT_AI_CONTENT_VERSION = 1 as const;

type AIContentMeta = AIContentEnvelope<AIContentData>['meta'];

export type DeserializedPersistedAIContent =
  | { kind: 'structured'; envelope: StoredAIContent }
  | { kind: 'legacy'; content: LoadedAIContent }
  | { kind: 'unsupported_version'; version: number | null; raw: unknown }
  | { kind: 'unknown'; raw: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isAIMode(value: unknown): value is AIMode {
  return typeof value === 'string'
    && ['lesson_board', 'diagram', 'photo_card', 'workshop_board'].includes(value);
}

function inferModeFromData(data: AIContentData): AIMode {
  switch (data.type) {
    case 'lesson_board':
      return 'lesson_board';
    case 'diagram':
      return 'diagram';
    case 'photo':
      return 'photo_card';
    case 'workshop_board':
      return 'workshop_board';
    default:
      return 'lesson_board';
  }
}

export function isLegacyHTMLContent(value: unknown): value is LegacyHTMLContent {
  return isRecord(value) && typeof value.html === 'string';
}

export function isStructuredAIContentData(value: unknown): value is AIContentData {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return false;
  }

  if (value.type === 'diagram') {
    if (typeof value.subtype !== 'string') {
      return false;
    }

    return safeValidateAIContent({
      mode: 'diagram',
      subtype: value.subtype as DiagramSubtype,
      data: value,
    }).success;
  }

  const modeByType: Record<Exclude<AIContentData['type'], 'diagram'>, Exclude<AIMode, 'diagram'>> = {
    lesson_board: 'lesson_board',
    photo: 'photo_card',
    workshop_board: 'workshop_board',
  };

  if (!(value.type in modeByType)) {
    return false;
  }

  return safeValidateAIContent({
    mode: modeByType[value.type as keyof typeof modeByType],
    data: value,
  }).success;
}

export function getAIContentVersion(value: unknown): number | null {
  if (!isRecord(value) || typeof value.version !== 'number') {
    return null;
  }

  return value.version;
}

export function isSupportedAIContentVersion(version: number | null): version is typeof CURRENT_AI_CONTENT_VERSION {
  return version === CURRENT_AI_CONTENT_VERSION;
}

export function isPersistedAIContentEnvelope(value: unknown): value is StoredAIContent {
  const version = getAIContentVersion(value);

  return isRecord(value)
    && isSupportedAIContentVersion(version)
    && isAIMode(value.mode)
    && isStructuredAIContentData(value.data);
}

export function migrateAIContentEnvelope(value: unknown): DeserializedPersistedAIContent {
  if (isPersistedAIContentEnvelope(value)) {
    return {
      kind: 'structured',
      envelope: value,
    };
  }

  const version = getAIContentVersion(value);
  if (version !== null) {
    trackAIUnsupportedVersion({ version, stage: 'persistence' });
    return {
      kind: 'unsupported_version',
      version,
      raw: value,
    };
  }

  return {
    kind: 'unknown',
    raw: value,
  };
}

export function serializeAIContentEnvelope(input: {
  mode: AIMode;
  data: AIContentData;
  meta?: AIContentMeta;
}): StoredAIContent {
  return {
    mode: input.mode,
    version: CURRENT_AI_CONTENT_VERSION,
    data: input.data,
    meta: input.meta,
  };
}

export function serializeAIContentForPersistence(
  value: unknown,
  options?: {
    mode?: AIMode;
    meta?: AIContentMeta;
  },
): LoadedAIContent | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (isLegacyHTMLContent(value)) {
    return value;
  }

  if (isPersistedAIContentEnvelope(value)) {
    return serializeAIContentEnvelope({
      mode: value.mode,
      data: value.data,
      meta: value.meta,
    });
  }

  if (isStructuredAIContentData(value)) {
    return serializeAIContentEnvelope({
      mode: options?.mode ?? inferModeFromData(value),
      data: value,
      meta: options?.meta,
    });
  }

  return undefined;
}

export function deserializePersistedAIContent(value: unknown): DeserializedPersistedAIContent {
  if (value === undefined || value === null) {
    return {
      kind: 'unknown',
      raw: value,
    };
  }

  if (isLegacyHTMLContent(value)) {
    return {
      kind: 'legacy',
      content: value,
    };
  }

  const migrated = migrateAIContentEnvelope(value);
  if (migrated.kind === 'structured' || migrated.kind === 'unsupported_version') {
    return migrated;
  }

  if (isStructuredAIContentData(value)) {
    return {
      kind: 'legacy',
      content: value as any,
    };
  }

  return {
    kind: 'unknown',
    raw: value,
  };
}
